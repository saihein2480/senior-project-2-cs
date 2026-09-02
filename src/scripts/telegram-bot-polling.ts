/**
 * Telegram Bot - Polling Mode (for local development)
 * Run this script to test your bot without needing a public URL
 */

// Load environment variables
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN not found in environment");
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;
let isRunning = true;

/**
 * Get updates from Telegram
 */
async function getUpdates() {
  try {
    const response = await fetch(`${API_BASE}/getUpdates?offset=${offset}&timeout=30`);
    const data = await response.json();

    if (!data.ok) {
      console.error("❌ Failed to get updates:", data.description);
      return;
    }

    const updates = data.result;

    for (const update of updates) {
      // Process update
      await processUpdate(update);

      // Update offset
      offset = update.update_id + 1;
    }
  } catch (error) {
    console.error("❌ Error getting updates:", error);
  }
}

/**
 * Process a single update
 */
async function processUpdate(update: any) {
  console.log("📨 Received update:", {
    updateId: update.update_id,
    hasMessage: !!update.message,
    hasCallbackQuery: !!update.callback_query,
  });

  // Import the bot service handler
  const { handleTelegramUpdate } = await import("../lib/telegram/bot-service");

  try {
    await handleTelegramUpdate(update);
    console.log("✅ Update processed successfully");
  } catch (error) {
    console.error("❌ Error processing update:", error);
  }
}

/**
 * Start polling
 */
async function startPolling() {
  console.log("🤖 Telegram Bot Starting...");
  console.log("📡 Mode: Polling (Development)");
  console.log("🔑 Bot Token:", BOT_TOKEN!.substring(0, 20) + "...");
  console.log("");

  // Delete webhook to enable polling
  try {
    const response = await fetch(`${API_BASE}/deleteWebhook?drop_pending_updates=true`);
    const data = await response.json();
    
    if (data.ok) {
      console.log("✅ Webhook deleted, polling mode enabled");
    }
  } catch (error) {
    console.error("❌ Failed to delete webhook:", error);
  }

  // Get bot info
  try {
    const response = await fetch(`${API_BASE}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log("✅ Bot connected:", data.result.username);
      console.log("");
      console.log("🎯 Bot is ready! Send /start to test");
      console.log("⏹️  Press Ctrl+C to stop");
      console.log("");
    }
  } catch (error) {
    console.error("❌ Failed to get bot info:", error);
  }

  // Start polling loop
  while (isRunning) {
    await getUpdates();
    // Small delay to avoid hammering the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Handle shutdown
 */
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down bot...");
  isRunning = false;
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n👋 Shutting down bot...");
  isRunning = false;
  process.exit(0);
});

// Start the bot
startPolling().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
