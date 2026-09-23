/**
 * The bot's command menu.
 *
 * Telegram stores this list on its own servers (via `setMyCommands`), which is
 * why commands can appear in the UI even when nothing is running to answer them.
 * Keeping it here rather than only in BotFather means adding a handler and
 * advertising it are one change, not two.
 *
 * Registered by `GET /api/telegram/setup-webhook?action=commands&secret=...`,
 * and automatically on startup by the dev polling script.
 */
export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "start", description: "Start shopping and see main menu" },
  { command: "help", description: "Show help and available commands" },
  { command: "branch", description: "Choose which branch you're shopping" },
  { command: "products", description: "Browse all products" },
  { command: "newarrivals", description: "See the latest arrivals" },
  { command: "bestsellers", description: "See our best selling products" },
  { command: "search", description: "Search for products" },
  { command: "cart", description: "View your shopping cart" },
  { command: "orders", description: "View your orders" },
  { command: "track", description: "Track an order" },
  { command: "profile", description: "View/edit your profile" },
  { command: "link", description: "Link your account" },
  { command: "promotions", description: "View current promotions" },
  { command: "account", description: "Manage your account" },
  { command: "cancel", description: "Cancel a pending order" },
];
