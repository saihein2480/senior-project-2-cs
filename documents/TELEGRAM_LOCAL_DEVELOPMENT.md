# Telegram Bot - Local Development Guide

## Problem: Webhook Doesn't Work on Localhost

Telegram webhooks require a **public HTTPS URL** that Telegram servers can reach. Since `localhost` is not accessible from the internet, the webhook won't work during local development.

## Solution: Use Polling Mode

We've created a polling-based bot runner that pulls updates from Telegram instead of waiting for webhooks. This is perfect for local development!

---

## 🚀 Quick Start (Local Development)

### Step 1: Start Your Next.js App

```bash
npm run dev
```

Keep this running in one terminal.

### Step 2: Start the Telegram Bot (Polling Mode)

Open a **new terminal** and run:

```bash
npm run telegram:dev
```

You should see:
```
🤖 Telegram Bot Starting...
📡 Mode: Polling (Development)
✅ Webhook deleted, polling mode enabled
✅ Bot connected: YourBotUsername
🎯 Bot is ready! Send /start to test
```

### Step 3: Test Your Bot

1. Open Telegram
2. Search for your bot
3. Send `/start`
4. Try commands like `/help`, `/products`, `/search black shirt`

---

## 📋 Available Commands to Test

| Command | Test Case |
|---------|-----------|
| `/start` | Should show welcome message with menu |
| `/help` | Should show all available commands |
| `/products` | Should show categories |
| `/search <query>` | Example: `/search black shirt` |
| `/cart` | Should show cart (empty initially) |
| `/orders` | Should prompt to link account |
| `/profile` | Should show profile or prompt to link |
| `/link` | Should generate account link |
| `/promotions` | Should show current promotions |

Test natural language too:
- "Hi"
- "Show me jeans"
- "What discounts do you have?"

---

## 🔄 Webhook vs Polling

### Polling Mode (Development)
✅ Works on localhost
✅ No public URL needed
✅ Easy to debug
✅ See updates in real-time
❌ Not suitable for production
❌ More API calls

**Use for:** Local development and testing

### Webhook Mode (Production)
✅ Efficient (push-based)
✅ Production-ready
✅ Scalable
❌ Requires public HTTPS URL
❌ Harder to debug locally

**Use for:** Production deployment

---

## 🛠️ Troubleshooting

### Bot Not Responding

1. **Check bot token**
   ```bash
   echo $env:TELEGRAM_BOT_TOKEN
   ```

2. **Verify bot is running**
   - Look for "Bot is ready!" message
   - Check for error messages

3. **Check server logs**
   - Look at the terminal running `npm run telegram:dev`
   - Check for error messages when you send commands

### Commands Return Errors

1. **Check Firebase is configured**
   - Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is set
   - Products require Firebase connection

2. **Check Groq API (for AI features)**
   - Verify `GROQ_API_KEY` is set
   - AI assistant needs Groq

3. **Check imports**
   - Make sure all dependencies are installed
   - Run `npm install` if needed

### "Cannot find module" Errors

```bash
npm install
```

Make sure all dependencies are installed.

### Bot Stops Responding

Press `Ctrl+C` and restart:
```bash
npm run telegram:dev
```

---

## 🔍 Debugging Tips

### Enable Verbose Logging

The polling script already logs:
- Every update received
- Processing success/failure
- Error details

Check both terminals:
1. **Next.js terminal** (`npm run dev`) - Shows API calls and Firebase operations
2. **Bot terminal** (`npm run telegram:dev`) - Shows Telegram updates

### Test Individual Features

```typescript
// Test product search directly
import { searchProducts } from "@/lib/productSearch";

const results = await searchProducts({ keyword: "shirt" });
console.log(results);
```

### Check Telegram API Directly

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"
```

---

## 📱 Testing on Mobile

The bot works the same on:
- Telegram Desktop
- Telegram Mobile (iOS/Android)
- Telegram Web

Just search for your bot and start testing!

---

## 🚀 Moving to Production

When ready to deploy:

### Option 1: Use ngrok (Quick Test)

```bash
# Install ngrok
choco install ngrok

# Start ngrok tunnel
ngrok http 3001

# Copy the HTTPS URL and update .env.local
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/telegram/webhook

# Setup webhook
npm run telegram:webhook
```

### Option 2: Deploy to Vercel/Railway/etc.

1. Deploy your app to a hosting service
2. Get your public URL
3. Update `.env.local` (or production env vars):
   ```env
   TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
   ```
4. Visit: `https://yourdomain.com/api/telegram/setup-webhook`

---

## 🔐 Security Notes

- Never commit `.env.local` with real tokens
- Use environment-specific tokens
- Keep bot token secure
- Use webhook secret in production

---

## 📊 Performance

Polling Mode Stats:
- ~1-2 requests per second to Telegram API
- Near-instant response (< 1s delay)
- Suitable for development and testing
- Not recommended for production (use webhooks)

---

## 🎯 Next Steps

1. ✅ Test all commands locally
2. ✅ Verify product search works
3. ✅ Test account linking
4. ✅ Try AI features
5. 🚀 Deploy to production with webhooks

---

## 💡 Pro Tips

### Run Both in One Terminal

Create a new script in `package.json`:
```json
"telegram:full": "concurrently \"npm run dev\" \"npm run telegram:dev\""
```

Then install concurrently:
```bash
npm install -D concurrently
```

Run everything with:
```bash
npm run telegram:full
```

### Auto-restart on Changes

The polling script doesn't auto-restart when you change code. To see changes:
1. Press `Ctrl+C` to stop
2. Run `npm run telegram:dev` again

Or use `nodemon`:
```bash
npm install -D nodemon
```

Update script:
```json
"telegram:dev": "nodemon --exec tsx src/scripts/telegram-bot-polling.ts"
```

---

## 📞 Need Help?

1. Check server logs in both terminals
2. Verify all environment variables are set
3. Make sure Firebase is configured
4. Test webhook info: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
5. Review the main documentation files

---

**Happy Testing! 🎉**
