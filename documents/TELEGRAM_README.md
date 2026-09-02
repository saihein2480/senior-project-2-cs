# Telegram Integration - Complete Guide

## 📚 Documentation Index

This Telegram integration provides a complete shopping assistant bot for your customers. Below is the complete documentation:

### 📖 Main Documentation

1. **[TELEGRAM_INTEGRATION.md](./TELEGRAM_INTEGRATION.md)** - Setup & Configuration Guide
   - Bot creation with BotFather
   - Webhook configuration
   - Environment variables
   - Troubleshooting
   - Security features

2. **[TELEGRAM_API_REFERENCE.md](./TELEGRAM_API_REFERENCE.md)** - API Reference
   - All available functions
   - Type definitions
   - API endpoints
   - Error handling

3. **[TELEGRAM_USAGE_EXAMPLES.md](./TELEGRAM_USAGE_EXAMPLES.md)** - Practical Examples
   - Order management integration
   - Inventory monitoring
   - Customer service
   - Marketing campaigns
   - Admin dashboard

---

## 🚀 Quick Start

### 1. Create Your Bot

```bash
# 1. Talk to @BotFather on Telegram
# 2. Send /newbot
# 3. Follow prompts to create bot
# 4. Save the bot token
```

### 2. Configure Environment

Add to `.env.local`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=your_random_secret
TELEGRAM_ADMIN_CHAT_ID=your_admin_chat_id
```

### 3. Deploy & Setup Webhook

```bash
# Deploy your application first
npm run build
npm run start

# Then setup webhook
curl https://yourdomain.com/api/telegram/setup-webhook
```

### 4. Test Your Bot

Open Telegram and search for your bot, then try:
```
/start
/help
/products
```

---

## ✨ Features

### 🛍️ For Customers

- **Product Browsing**: Search and browse products with images
- **AI Assistant**: Natural language shopping help powered by Groq
- **Order Tracking**: Real-time order status updates
- **Cart Management**: Add to cart, view cart, checkout
- **Size Recommendations**: AI-powered size suggestions
- **Outfit Recommendations**: Complete outfit suggestions for occasions
- **Promotions**: Get notified about deals and discounts
- **Account Linking**: Link Telegram with web account for seamless experience

### 🔔 Notifications

Automatic notifications for:
- Order confirmation
- Payment confirmation  
- Shipping updates
- Delivery confirmation
- Cancellation status
- Refund processing
- Promotions and deals
- Back in stock alerts

### 👨‍💼 For Admins

- New order alerts
- Payment confirmations
- Low stock warnings
- Cancellation requests
- Return/refund requests
- System error alerts
- Bulk messaging capability

---

## 📦 Architecture

```
pos-clothing-store-web/
├── src/
│   ├── app/
│   │   ├── api/telegram/
│   │   │   ├── webhook/route.ts          # Main webhook handler
│   │   │   ├── setup-webhook/route.ts    # Webhook configuration
│   │   │   ├── link-account/route.ts     # Account linking
│   │   │   └── send-notification/route.ts # Notification API
│   │   └── account/
│   │       └── link-telegram/page.tsx     # Account linking page
│   └── lib/telegram/
│       ├── bot-service.ts                 # Core bot logic
│       ├── api-client.ts                  # Telegram API wrapper
│       ├── auth-service.ts                # Account linking
│       ├── customer-service.ts            # Customer data operations
│       ├── cart-service.ts                # Cart management
│       ├── notifications.ts               # Notification system
│       ├── admin-helpers.ts               # Admin notifications
│       ├── ai-integration.ts              # AI assistant
│       ├── formatters.ts                  # Message formatters
│       ├── keyboards.ts                   # Inline keyboards
│       ├── types.ts                       # TypeScript types
│       └── index.ts                       # Main exports
└── documents/
    ├── TELEGRAM_INTEGRATION.md            # Setup guide
    ├── TELEGRAM_API_REFERENCE.md          # API docs
    ├── TELEGRAM_USAGE_EXAMPLES.md         # Examples
    └── TELEGRAM_README.md                 # This file
```

---

## 🎯 Core Commands

| Command | Description |
|---------|-------------|
| `/start` | Show main menu |
| `/help` | Show help and commands |
| `/products` | Browse all products |
| `/search <query>` | Search for products |
| `/cart` | View shopping cart |
| `/orders` | View order history |
| `/track <orderRef>` | Track specific order |
| `/profile` | View/edit profile |
| `/link` | Link Telegram account |
| `/promotions` | View current deals |
| `/cancel <orderRef>` | Cancel an order |

---

## 💻 Usage Examples

### Send Order Confirmation

```typescript
import { sendOrderConfirmationNotification } from "@/lib/telegram";

await sendOrderConfirmationNotification(customerId, {
  orderRef: "OR12345678",
  totalAmount: 150000,
  paymentMethod: "COD",
  items: [...],
  createdAt: new Date(),
  status: "pending",
  paymentStatus: "pending"
});
```

### Send Bulk Promotion

```typescript
import { sendBulkNotification } from "@/lib/telegram";

const result = await sendBulkNotification(
  "🎉 Flash Sale! 50% off all items!",
  true // only to users who enabled promotions
);

console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
```

### Link Account

```typescript
import { generateLinkToken, linkTelegramToCustomer } from "@/lib/telegram";

// Generate token
const token = await generateLinkToken(telegramChatId);

// After user clicks link and logs in
await linkTelegramToCustomer(customerId, {
  chatId: telegramChatId,
  username: "johndoe"
});
```

---

## 🔐 Security Features

- ✅ Webhook secret validation
- ✅ Secure token-based account linking
- ✅ Input sanitization (MarkdownV2 escaping)
- ✅ Rate limiting on bulk operations
- ✅ Expiring link tokens (15 minutes)
- ✅ User preference checking
- ✅ Owner verification for actions

---

## 🧪 Testing

### Test Webhook

```bash
curl https://yourdomain.com/api/telegram/setup-webhook?action=info
```

### Test Admin Notification

```typescript
import { sendAdminTestNotification } from "@/lib/telegram";
await sendAdminTestNotification();
```

### Test Bot Commands

In Telegram:
1. Search for your bot
2. Send `/start`
3. Try various commands

---

## 🔧 Troubleshooting

### Bot Not Responding

1. Check webhook status:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

2. Verify environment variables are set
3. Check server logs for errors
4. Ensure HTTPS is configured

### Notifications Not Sending

1. Verify customer has linked Telegram account
2. Check `telegramChatId` is stored in customer profile
3. Verify bot has permission to message user
4. Check notification preferences

### Account Linking Issues

1. User must be logged in on web
2. Link code expires after 15 minutes
3. Each code can only be used once
4. Check Firebase authentication

---

## 📊 Database Schema

### Customers Collection Updates

```typescript
{
  // Existing fields...
  telegramChatId?: string,
  telegramUsername?: string,
  telegramFirstName?: string,
  telegramLastName?: string,
  telegramLinkedAt?: Timestamp,
  notificationPreferences?: {
    telegram: boolean,
    orderUpdates: boolean,
    promotions: boolean,
    deliveryAlerts: boolean
  }
}
```

### New Collections

**telegramLinkTokens**
```typescript
{
  token: string,
  customerId: string,
  telegramChatId: string,
  createdAt: Timestamp,
  expiresAt: Timestamp,
  used: boolean
}
```

**telegramCarts**
```typescript
{
  chatId: string,
  items: TelegramCartItem[],
  updatedAt: Timestamp
}
```

---

## 📈 Performance Considerations

### Rate Limits

Telegram API limits:
- 30 messages/second to different users
- 1 message/second to same user
- 20 messages/minute to same group

Our implementation:
- Bulk notifications: 35ms delay between messages
- Automatic queuing for admin notifications
- Graceful error handling

### Best Practices

1. **Async Processing**: Don't block critical paths
2. **Error Handling**: Notifications should never fail orders
3. **User Preferences**: Always check before sending
4. **Logging**: Track all notification attempts
5. **Testing**: Test thoroughly in development

---

## 🎨 Customization

### Custom Commands

Edit `src/lib/telegram/bot-service.ts`:

```typescript
const commandHandlers: Record<string, () => Promise<void>> = {
  "/start": () => handleStartCommand(ctx),
  "/help": () => handleHelpCommand(ctx),
  // Add your custom command here
  "/mycustom": () => handleMyCustomCommand(ctx),
};
```

### Custom Notifications

Create new notification functions in `src/lib/telegram/notifications.ts`:

```typescript
export async function sendMyCustomNotification(
  customerId: string,
  data: any
): Promise<boolean> {
  const customer = await getCustomerById(customerId);
  if (!customer?.telegramChatId) return false;
  
  const message = formatMyCustomMessage(data);
  return await sendMessageSafe(customer.telegramChatId, message);
}
```

### Custom Keyboards

Add new keyboards in `src/lib/telegram/keyboards.ts`:

```typescript
export function createMyCustomKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Button 1", callback_data: "action_1" },
        { text: "Button 2", callback_data: "action_2" }
      ]
    ]
  };
}
```

---

## 📞 Support

### Documentation

- [Setup Guide](./TELEGRAM_INTEGRATION.md)
- [API Reference](./TELEGRAM_API_REFERENCE.md)
- [Usage Examples](./TELEGRAM_USAGE_EXAMPLES.md)

### External Resources

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)

### Troubleshooting

1. Check the troubleshooting section in [TELEGRAM_INTEGRATION.md](./TELEGRAM_INTEGRATION.md)
2. Review server logs for detailed errors
3. Test webhook connectivity
4. Verify all environment variables

---

## 🎯 Next Steps

1. ✅ Create bot with BotFather
2. ✅ Configure environment variables
3. ✅ Deploy application
4. ✅ Setup webhook
5. ✅ Test bot functionality
6. ✅ Link your account
7. ✅ Test notifications
8. 🎉 Launch to customers!

---

## 📝 License

This integration is part of the Swe Trendy Hub project.

---

## 🤝 Contributing

When adding new features:

1. Add type definitions to `types.ts`
2. Implement function in appropriate service file
3. Export from `index.ts`
4. Add documentation to API reference
5. Create usage examples
6. Test thoroughly

---

## 🔄 Version History

### v1.0.0 (Current)
- ✅ Core bot functionality
- ✅ Product search and browsing
- ✅ Order management
- ✅ AI assistant integration
- ✅ Account linking
- ✅ Cart management
- ✅ Notification system
- ✅ Admin helpers
- ✅ Inline keyboards
- ✅ Comprehensive documentation

---

**Happy Chatting! 🎉**

For detailed setup instructions, see [TELEGRAM_INTEGRATION.md](./TELEGRAM_INTEGRATION.md)
