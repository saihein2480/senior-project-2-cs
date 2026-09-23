# Customer Email Verification (Gmail App Password)

Customers who register with **email + password** must confirm their address
with a 6-digit code before they can pay. Customers who use **Continue with
Google** are already verified by Google and skip this entirely.

## 1. Create a Google App Password

A normal Google account password will be rejected by Gmail's SMTP server. You
need an App Password, which requires 2-Step Verification on the sending
account.

1. Enable 2-Step Verification: <https://myaccount.google.com/security>
2. Open <https://myaccount.google.com/apppasswords>
3. Create a password (any app name, e.g. `Pink Boutique Storefront`)
4. Copy the 16-character value

If the App Passwords page is unavailable, the account either lacks 2-Step
Verification or is a Workspace account where an admin has disabled the feature.

## 2. Configure environment variables

Add to `pos-clothing-store-web/.env.local`:

```
GMAIL_USER=your_shop_account@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password
EMAIL_FROM_NAME=Pink Boutique
```

The app strips spaces from `GMAIL_APP_PASSWORD`, so pasting Google's
`abcd efgh ijkl mnop` display form works.

Restart the dev server after editing `.env.local` — Next.js only reads it at
startup.

`FIREBASE_SERVICE_ACCOUNT_KEY` must also be set, since the routes verify ID
tokens and write the verified flag with the Admin SDK.

## 3. Flow

1. Customer submits `/auth/register`
2. `register()` creates the Firebase user, then calls
   `POST /api/auth/send-verification`
3. Customer lands on `/auth/verify-email` and enters the code
4. `POST /api/auth/verify-email` validates it and marks the account verified in
   three places: the Firebase Auth user (`emailVerified`), `customers/{uid}`,
   and `users/{uid}`
5. Customer continues to checkout

If the initial send fails (bad App Password, Gmail outage), registration still
succeeds — the customer uses **Resend code** on the verify page.

## 4. Security properties

| Concern | Handling |
| --- | --- |
| Whose account is being verified | Derived from the Firebase ID token via `getUidFromAuthHeader`, never from the request body |
| Code storage | Only a SHA-256 hash is written to Firestore |
| Code generation | `crypto.randomInt`, not `Math.random` |
| Comparison | `crypto.timingSafeEqual` |
| Brute force | Max 5 attempts per issued code |
| Expiry | 15 minutes |
| Inbox spam | 60-second resend cooldown, enforced server-side |
| Code in transit to client | Never returned by any endpoint |

Tunable constants live at the top of `src/lib/email/verification-service.ts`.

## 5. Firestore

New collection `emailVerificationCodes`, one document per customer keyed by
uid:

```
{ uid, email, codeHash, createdAt, expiresAt, used, attempts, usedAt? }
```

Documents are single-use and overwritten on resend. They are not deleted after
use, matching the existing `telegramLinkTokens` behaviour. Consider a TTL
policy on `expiresAt` if you want automatic cleanup.

Customer documents gain `emailVerified: boolean` and `emailVerifiedAt`.

## 6. Existing customers

Accounts created before this feature have no `emailVerified` field, which reads
as unverified, so they will be asked to verify on their next checkout. To
grandfather them in, set `emailVerified: true` on their `customers` and `users`
documents.

## 7. Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Email sending is not configured` | `GMAIL_USER` / `GMAIL_APP_PASSWORD` missing, or server not restarted |
| `Invalid login: 535-5.7.8 Username and Password not accepted` | Using the account password instead of an App Password |
| `Not authenticated` (401) | ID token missing or expired; sign out and back in |
| Code email never arrives | Check the Gmail account's Sent folder, then the recipient's spam folder |

Gmail limits roughly 500 messages/day on consumer accounts. Move to a
transactional provider before real production volume.
