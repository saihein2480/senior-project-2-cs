# Telegram Integration Setup Guide

## Overview

This guide will help you set up the Telegram Bot integration for your clothing store. Customers will be able to:

- Browse and search products
- Track orders and view purchase history
- Get AI-powered shopping assistance
- Receive order notifications and updates
- Manage their cart and checkout
- Request cancellations and returns
- Link their Telegram account with their web account

## Prerequisites

- Telegram account
- Access to your server for webhook setup
- Firebase project configured

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat with BotFather and send `/newbot`
3. Follow the prompts:
   - **Bot name**: Choose a display name (e.g., "Swe Trendy Hub")
   - **Bot username**: Choose a unique username ending in `bot` (e.g., `SweTrendyHubBot`)
4. BotFather will provide you with a **Bot Token** - save this securely!

Example token format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

## Step 2: Configure Bot Settings

Send these commands to @BotFather:

### Set Bot Description
```
/setdescription
```
Then send:
```
🛍️ Welcome to Swe Trendy Hub!

Browse products, track orders, get personalized recommendations, and shop with our AI assistant - all from Telegram!

Use /start to begin shopping.
```

### Set Bot About Text
```
/setabouttext
```
Then send:
```
Your personal shopping assistant for Swe Trendy Hub. Browse fashion, track orders, and get AI-powered recommendations!
```

### Set Bot Commands
```
/setcommands
```
Then send:
```
start - Start shopping and see main menu
help - Show help and available commands
products - Browse all products
search - Search for products
cart - View your shopping cart
orders - View your orders
track - Track an order
profile - View/edit your profile
link - Link your account
promotions - View current promotions
account - Manage your account
cancel - Cancel a pending order
```

### Set Bot Profile Picture
1. Send `/setuserpic` to BotFather
2. Select your bot
3. Send a square image (recommended: 512x512px)

## Step 3: Configure Environment Variables

Add these variables to your `.env.local` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=your_random_secret_string_here

# Optional: Telegram Admin Chat ID (for notifications)
TELEGRAM_ADMIN_CHAT_ID=your_admin_chat_id
```

### How to get your Telegram Chat ID:
1. Search for **@userinfobot** on Telegram
2. Start a chat and it will show your User ID
3. Use this as your `TELEGRAM_ADMIN_CHAT_ID`

### Generate Webhook Secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 4: Set Up Webhook

After deploying your application, set the webhook URL:

### Option A: Using the API endpoint (Recommended)
Visit your deployment URL:
```
https://yourdomain.com/api/telegram/setup-webhook
```

### Option B: Using cURL
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/telegram/webhook",
    "secret_token": "your_webhook_secret_here"
  }'
```

### Verify Webhook
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Step 5: Test Your Bot

1. Open Telegram and search for your bot username
2. Start a conversation with `/start`
3. Try these commands:
   - `/products` - Browse products
   - `/search black shirt` - Search for products
   - `/cart` - View cart
   - `/orders` - View your orders
   - `/help` - Get help

## Features Overview

### 🛍️ Product Browsing
- Search products by name, color, category
- Filter by price range
- View product details with images
- Check available sizes and colors

### 📦 Order Management
- Track order status in real-time
- View order history
- Request cancellations (for eligible orders)
- Request returns and refunds

### 🤖 AI Shopping Assistant
- Natural language product search
- Outfit recommendations
- Size recommendations
- Product information lookup

### 🔔 Notifications
Automatic notifications for:
- Order confirmation
- Payment confirmation
- Shipping updates
- Delivery confirmation
- Cancellation/refund status

### 🛒 Cart Management
- Add products to cart
- View cart contents
- Remove items
- Checkout directly from Telegram

### 👤 Account Linking
- Link Telegram with web account
- Sync cart and orders
- Access purchase history

## Bot Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Start bot and show main menu | `/start` |
| `/help` | Show help message | `/help` |
| `/products` | Browse all products | `/products` |
| `/search <query>` | Search for products | `/search black jeans` |
| `/cart` | View shopping cart | `/cart` |
| `/orders` | View order history | `/orders` |
| `/track <orderRef>` | Track specific order | `/track OR12345678` |
| `/profile` | View/edit profile | `/profile` |
| `/link` | Link Telegram account | `/link` |
| `/promotions` | View current deals | `/promotions` |
| `/cancel <orderRef>` | Cancel an order | `/cancel OR12345678` |

## Inline Keyboards

The bot uses interactive buttons for better UX:

- **Main Menu**: Quick access to key features
- **Product Cards**: View details, add to cart
- **Cart View**: Update quantities, remove items, checkout
- **Order Status**: Track, cancel, return options
- **Category Browse**: Filter by clothing categories

## Natural Language Commands

The bot also understands natural language:

```
User: "Show me black t-shirts under 50000"
User: "What's the status of my order OR12345678?"
User: "I need an outfit for a date"
User: "Do you have this in size M?"
User: "Any discounts available?"
```

## Security Features

- Webhook secret validation
- User authentication via account linking
- Secure token storage
- Rate limiting on API endpoints
- Input validation and sanitization

## Troubleshooting

### Bot Not Responding
1. Check webhook status: `getWebhookInfo`
2. Verify environment variables are set
3. Check server logs for errors
4. Ensure webhook URL is HTTPS

### Webhook Errors
1. Ensure your domain has valid SSL certificate
2. Check webhook secret matches
3. Verify bot token is correct
4. Check firewall/CORS settings

### Account Linking Issues
1. User must be logged in on web
2. Link code expires after 15 minutes
3. Each code can only be used once
4. Check Firebase authentication is working

### Notifications Not Sending
1. Verify customer has linked their Telegram account
2. Check `telegramChatId` is stored in customer profile
3. Verify bot has permission to message user
4. Check server logs for API errors

## Rate Limits

Telegram API has these limits:
- 30 messages per second to different users
- 1 message per second to the same user
- 20 messages per minute to the same group

The bot implements queuing for notifications to respect these limits.

## Database Schema Updates

The integration adds these fields to the `customers` collection:

```typescript
{
  telegramChatId?: string;      // User's Telegram chat ID
  telegramUsername?: string;     // Telegram username
  telegramLinkedAt?: Timestamp;  // When account was linked
  notificationPreferences?: {
    telegram: boolean;           // Enable Telegram notifications
    orderUpdates: boolean;       // Order status updates
    promotions: boolean;         // Marketing messages
    deliveryAlerts: boolean;     // Delivery notifications
  }
}
```

## Privacy & Data Protection

- Customer phone numbers are never shared with Telegram
- Telegram chat IDs are stored securely in Firebase
- Customers can unlink their account anytime
- Bot respects notification preferences
- No personal data is logged in plaintext

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs
3. Test webhook connectivity
4. Verify environment variables

## Next Steps

1. ✅ Create bot with BotFather
2. ✅ Configure environment variables
3. ✅ Deploy application with webhook
4. ✅ Set up webhook URL
5. ✅ Test bot functionality
6. ✅ Link your account
7. ✅ Enable notifications
8. 🎉 Start shopping via Telegram!

## Advanced Configuration

### Custom Welcome Message
Edit `pos-clothing-store-web/src/lib/telegram/bot-service.ts` and modify the `START_MESSAGE` constant.

### Notification Templates
Edit `pos-clothing-store-web/src/lib/telegram/notifications.ts` to customize notification messages.

### Product Display Format
Edit `pos-clothing-store-web/src/lib/telegram/formatters.ts` to change how products are displayed.

### Add More Commands
Edit `pos-clothing-store-web/src/lib/telegram/bot-service.ts` and add your command handlers.

## Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)
- [Telegram Bot Best Practices](https://core.telegram.org/bots/features)
