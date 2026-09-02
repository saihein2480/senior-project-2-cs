# 🤖 Start Your Telegram Bot - Quick Guide

## ⚠️ Important: You're Running Locally

Your bot **won't work** with the current `localhost` webhook URL. Follow these steps:

---

## ✅ Step-by-Step Setup (5 minutes)

### 1️⃣ Open TWO Terminals

You need both your Next.js app AND the Telegram bot running.

### 2️⃣ Terminal 1: Start Next.js

```bash
cd pos-clothing-store-web
npm run dev
```

Keep this running! ✅

### 3️⃣ Terminal 2: Start Telegram Bot

```bash
cd pos-clothing-store-web
npm run telegram:dev
```

You should see:
```
✅ Bot connected: YourBotName
🎯 Bot is ready! Send /start to test
```

### 4️⃣ Test Your Bot

1. Open Telegram (mobile or desktop)
2. Search for your bot: `@YourBotName`
3. Click "Start" or send `/start`
4. You should get a welcome message! 🎉

---

## 🧪 Test These Commands

```
/start        - Welcome message
/help         - Show all commands
/products     - Browse products
/search shirt - Search for items
/promotions   - View deals
```

---

## 🐛 Troubleshooting

### Bot doesn't respond?

**Check Terminal 2** - You should see:
```
📨 Received update: ...
✅ Update processed successfully
```

If you don't see this, the bot isn't receiving messages.

### Fix: Restart the bot

Press `Ctrl+C` in Terminal 2, then:
```bash
npm run telegram:dev
```

### Still not working?

1. **Check your bot token** in `.env.local`:
   ```env
   TELEGRAM_BOT_TOKEN=8976369395:AAGgOqYmyK5yvTnyFgHkyMzmu0kaDA8dJy0
   ```

2. **Verify Firebase is configured**:
   - Check `FIREBASE_SERVICE_ACCOUNT_KEY` exists in `.env.local`

3. **Test bot token**:
   ```bash
   curl "https://api.telegram.org/bot8976369395:AAGgOqYmyK5yvTnyFgHkyMzmu0kaDA8dJy0/getMe"
   ```
   Should return bot info.

---

## 📚 More Documentation

- **[TELEGRAM_LOCAL_DEVELOPMENT.md](./documents/TELEGRAM_LOCAL_DEVELOPMENT.md)** - Detailed local dev guide
- **[TELEGRAM_INTEGRATION.md](./documents/TELEGRAM_INTEGRATION.md)** - Full setup guide
- **[TELEGRAM_API_REFERENCE.md](./documents/TELEGRAM_API_REFERENCE.md)** - API docs

---

## 🚀 Ready for Production?

See **[TELEGRAM_LOCAL_DEVELOPMENT.md](./documents/TELEGRAM_LOCAL_DEVELOPMENT.md)** for deployment options.

---

## 💡 Quick Tips

- **Keep both terminals running** while testing
- **Changes to code** require restarting Terminal 2
- **Database connection** needed for products/orders
- **AI features** require `GROQ_API_KEY`

---

**Questions? Check the logs in both terminals!** 📊
