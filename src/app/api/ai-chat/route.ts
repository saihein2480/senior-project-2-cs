import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getUidFromAuthHeader } from "../../../lib/firebase-admin";
import {
  CHAT_TOOLS,
  runTool,
  ToolContext,
  ToolSideEffects,
} from "../../../lib/chat/tools";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

/**
 * Must be a Groq model this account can access AND that supports tool calling.
 * Verified available: openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b.
 * Note llama-3.3-70b-versatile is NOT available and returns 404 model_not_found.
 * Overridable via env so a deprecation needs no code change.
 */
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

/** Safety valve so a confused model cannot loop forever. */
const MAX_TOOL_ROUNDS = 4;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
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

    const { messages, productContext, branch } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request. Messages array is required." },
        { status: 400 },
      );
    }

    // Identity comes from a verified ID token, never from the request body, so a
    // caller cannot read someone else's orders by guessing a uid.
    const customerUid = await getUidFromAuthHeader(
      req.headers.get("authorization"),
    );

    const ctx: ToolContext = {
      customerUid,
      productContext: productContext || null,
      branch: branch || null,
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
      // against the shared per-minute token budget.
      ...messages.slice(-6).map((msg: Message) => ({
        role: msg.role,
        content: msg.content,
      })),
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
      {
        error: "Failed to process your request. Please try again.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
