import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getUidFromAuthHeader } from "../../../lib/firebase-admin";
import {
  CHAT_TOOLS,
  runTool,
  ToolContext,
  ToolSideEffects,
} from "../../../lib/chat/tools";
import { GROQ_CHAT_MODEL } from "../../../lib/chat/model";
import { createRateLimiter, getClientIp } from "../../../lib/server/rateLimit";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

/** Shared with the Telegram bot; see lib/chat/model.ts. */
const MODEL = GROQ_CHAT_MODEL;

/**
 * Safety valve so a confused model cannot loop forever. Each round is one Groq
 * call against the account's shared per-minute token budget.
 */
const MAX_TOOL_ROUNDS = 3;

/**
 * Per-instance limits (see lib/server/rateLimit.ts). Every request can cost
 * several Groq calls from a budget shared by all shoppers, so anonymous
 * callers, keyed by IP, get less than signed-in customers, keyed by uid.
 */
const signedInLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 1000 });
const anonymousLimiter = createRateLimiter({ limit: 8, windowMs: 60 * 1000 });

/** Input caps. Only the most recent turns are ever sent to the model. */
const MAX_HISTORY_MESSAGES = 12;
const RECENT_TURNS_SENT = 6;
const MAX_MESSAGE_CHARS = 1000;
const MAX_TOTAL_CHARS = 6000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CONTEXT_ID_LENGTH = 200;

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Keep only well-formed user/assistant turns from the client.
 *
 * Any other role is dropped: a client-supplied "system" (or "tool") turn would
 * otherwise sit next to our own system prompt. Each message is capped, and
 * older turns are dropped once the total is over budget, newest kept first.
 */
function sanitizeMessages(raw: unknown[]): Message[] {
  const valid: Message[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const text = content.trim();
    if (!text) continue;
    valid.push({ role, content: text.slice(0, MAX_MESSAGE_CHARS) });
  }

  const recent = valid.slice(-MAX_HISTORY_MESSAGES);
  const kept: Message[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    total += recent[i].content.length;
    if (total > MAX_TOTAL_CHARS) break;
    kept.unshift(recent[i]);
  }
  return kept;
}

/** An optional id from the client: a short string without "/", else null. */
function optionalContextId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > MAX_CONTEXT_ID_LENGTH || id.includes("/")) return null;
  return id;
}

/**
 * Kept deliberately short. Every request re-sends this plus all 7 tool schemas,
 * and this Groq account's budget is 8000 tokens/minute shared across every
 * shopper, so prompt size directly limits how many people can chat at once.
 */
function buildSystemPrompt(isSignedIn: boolean, hasProductContext: boolean) {
  return `You are StyleBot, a clothing store assistant.

Rules:
- Always call a tool for facts. You know nothing about products, orders, promotions or the store yourself.
- Never invent prices, stock, sizes, colours, materials, coupon codes, addresses, hours or policies. If a tool reports something unknown, say you don't have it on file and offer to connect them with staff.
- Reply in 2-4 short sentences. Product and outfit cards render separately, so summarise rather than listing items.
- Call several tools at once if asked several things.
- Cancelling or returning is a request the store must approve, never instant, and is submitted from Account > My Purchases.
- Size advice uses the store's general size chart, so mention fit can vary.
${
  isSignedIn
    ? "- Customer IS signed in: get_my_orders returns their real orders."
    : "- Customer is NOT signed in: get_my_orders cannot see orders. Ask them to sign in; do not ask for an order number instead."
}
${
  hasProductContext
    ? "- They are on a product page: call get_product_details with no productName for 'this item' questions."
    : "- They are not on a product page: ask which product if unclear."
}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!groq) {
      return NextResponse.json(
        {
          error:
            "Groq API is not configured. Add GROQ_API_KEY to .env.local. Get a free key at https://console.groq.com/keys",
        },
        { status: 500 },
      );
    }

    // Identity comes from a verified ID token, never from the request body, so a
    // caller cannot read someone else's orders by guessing a uid.
    const customerUid = await getUidFromAuthHeader(
      req.headers.get("authorization"),
    );

    // Rate limit before reading the body or calling the model.
    const limited = customerUid
      ? signedInLimiter.check(`uid:${customerUid}`)
      : anonymousLimiter.check(`ip:${getClientIp(req.headers) || "unknown"}`);
    if (!limited.allowed) {
      return NextResponse.json(
        {
          error:
            "You're sending messages a little too quickly. Please wait a moment and try again.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSeconds) },
        },
      );
    }

    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "This conversation is too long. Please start a new chat." },
        { status: 413 },
      );
    }

    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = rawBody ? JSON.parse(rawBody) : null;
      body =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      body = null;
    }

    if (!body || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "Invalid request. Messages array is required." },
        { status: 400 },
      );
    }

    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Please type a message first." },
        { status: 400 },
      );
    }

    const productContext = optionalContextId(body.productContext);
    const branch = optionalContextId(body.branch);

    const ctx: ToolContext = {
      customerUid,
      productContext,
      branch,
    };

    const effects: ToolSideEffects = {
      products: [],
      outfit: null,
      isOutfit: false,
    };

    const conversation: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildSystemPrompt(!!customerUid, !!productContext),
      },
      // Only recent turns: history is re-sent on every request and counts
      // against the shared per-minute token budget. Roles are already limited
      // to user/assistant by sanitizeMessages.
      ...messages.slice(-RECENT_TURNS_SENT).map(
        (msg): Groq.Chat.Completions.ChatCompletionMessageParam =>
          msg.role === "user"
            ? { role: "user", content: msg.content }
            : { role: "assistant", content: msg.content },
      ),
    ];

    let reply = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      let completion;

      try {
        completion = await groq.chat.completions.create({
          messages: conversation,
          model: MODEL,
          tools: CHAT_TOOLS,
          tool_choice: "auto",
          temperature: 0.4,
          max_tokens: 700,
        });
      } catch (modelError) {
        // Groq rejects the whole request when a generated tool call fails its
        // schema validation. Degrade to a plain answer instead of failing the
        // conversation, which previously surfaced as "having trouble right now".
        const message =
          modelError instanceof Error ? modelError.message : String(modelError);
        const status = (modelError as { status?: number })?.status;
        console.error("Groq call failed:", status, message);

        // The account has a shared per-minute token budget. Say so plainly
        // instead of implying something is broken.
        if (status === 429 || /rate limit/i.test(message)) {
          reply =
            "I'm getting a lot of questions right now. Give me about a minute and ask me again.";
          break;
        }

        if (status === 404 || /model_not_found|does not exist/i.test(message)) {
          console.error(
            `Configured GROQ_MODEL "${MODEL}" is unavailable on this account.`,
          );
          reply =
            "My assistant service is misconfigured right now. Please let the store know.";
          break;
        }

        if (/tool_use_failed|tool call validation/i.test(message)) {
          try {
            const fallback = await groq.chat.completions.create({
              messages: [
                ...conversation,
                {
                  role: "system",
                  content:
                    "Tool lookup failed. Reply in one or two sentences, ask the customer to rephrase, and do not state any product, order, promotion or store facts.",
                },
              ],
              model: MODEL,
              temperature: 0.3,
              max_tokens: 200,
            });
            reply = fallback.choices[0]?.message?.content || "";
          } catch (fallbackError) {
            console.error("Fallback completion failed:", fallbackError);
          }
        }

        break;
      }

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      const toolCalls = choice.tool_calls ?? [];

      if (toolCalls.length === 0) {
        reply = choice.content || "";
        break;
      }

      // Echo the assistant's tool request back before the results, which the
      // API requires for the next turn to validate.
      conversation.push({
        role: "assistant",
        content: choice.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = call.function?.name ?? "";
        let result: string;

        try {
          result = await runTool(
            toolName,
            call.function?.arguments ?? "{}",
            ctx,
            effects,
          );
        } catch (toolError) {
          console.error(`Tool ${toolName} failed:`, toolError);
          result = JSON.stringify({
            error: "This lookup failed. Tell the customer and suggest retrying.",
          });
        }

        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
    }

    if (!reply) {
      reply =
        "Sorry, I couldn't put that together just now. Could you rephrase, or ask me something else?";
    }

    return NextResponse.json({
      message: reply,
      products: effects.products,
      totalCount: effects.products.length,
      isOutfit: effects.isOutfit,
      outfit: effects.outfit,
      isProductInfo: effects.products.length > 0 && !effects.isOutfit,
      signedIn: !!customerUid,
    });
  } catch (error) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "Failed to process your request. Please try again." },
      { status: 500 },
    );
  }
}
