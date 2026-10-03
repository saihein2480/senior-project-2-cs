/**
 * The Groq model every chat surface uses (web chat and the Telegram bot).
 *
 * Must be a Groq model this account can access AND that supports tool calling
 * (the web chat uses tools).
 * Verified available: openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b.
 * Note llama-3.3-70b-versatile is NOT available and returns 404 model_not_found.
 * Overridable via the GROQ_MODEL env var so a deprecation needs no code change.
 */
export const GROQ_CHAT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
