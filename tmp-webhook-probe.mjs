/**
 * Temporary: the webhook is registered but the bot stays silent. Find out why.
 * Posts a synthetic /start to the DEPLOYED webhook exactly as Telegram would.
 * Delete after use.
 */
import { readFileSync } from "node:fs";

const ORIGIN = "https://senior-project-2-cs.vercel.app";
const WEBHOOK = `${ORIGIN}/api/telegram/webhook`;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const chatId = env.TELEGRAM_ADMIN_CHAT_ID;

// 1. Has Telegram recorded a delivery failure?
const info = await fetch(
  `https://api.telegram.org/bot${token}/getWebhookInfo`,
).then((r) => r.json());
console.log("=== getWebhookInfo ===");
console.log(JSON.stringify(info.result, null, 2));
if (info.result?.last_error_message) {
  console.log(
    `\n!! Telegram's last delivery error: ${info.result.last_error_message}`,
  );
  console.log(
    `   at ${new Date(info.result.last_error_date * 1000).toISOString()}`,
  );
} else {
  console.log("\nno delivery error recorded by Telegram");
}

const update = (id) => ({
  update_id: id,
  message: {
    message_id: id,
    date: Math.floor(Date.now() / 1000),
    chat: { id: Number(chatId), type: "private" },
    from: { id: Number(chatId), is_bot: false, first_name: "Probe", username: "probe" },
    text: "/start",
    entities: [{ offset: 0, length: 6, type: "bot_command" }],
  },
});

// 2. Wrong secret must be rejected -> proves the secret is set on the server.
console.log("\n=== POST with a WRONG secret ===");
const bad = await fetch(WEBHOOK, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-telegram-bot-api-secret-token": "definitely-wrong",
  },
  body: JSON.stringify(update(900001)),
});
console.log(`  HTTP ${bad.status} :: ${(await bad.text()).slice(0, 200)}`);
console.log(
  bad.status === 401
    ? "  -> secret IS configured on Vercel (good)"
    : "  -> NOT rejected: TELEGRAM_WEBHOOK_SECRET is probably missing on Vercel",
);

// 3. Correct secret. A 200 plus a message in Telegram means the whole path works.
console.log("\n=== POST with the CORRECT secret (should make the bot reply) ===");
const started = Date.now();
const good = await fetch(WEBHOOK, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-telegram-bot-api-secret-token": secret,
  },
  body: JSON.stringify(update(900002)),
});
const elapsed = Date.now() - started;
console.log(`  HTTP ${good.status} in ${elapsed}ms :: ${(await good.text()).slice(0, 200)}`);
console.log(
  elapsed < 400
    ? "  -> returned very fast: the deployed build is likely still the old\n" +
      "     fire-and-forget version, which is killed before it can reply."
    : "  -> took long enough to have actually done the work; check Telegram.",
);
