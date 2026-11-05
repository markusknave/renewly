# Renewly

Self-hosted subscription renewal tracker. Renewly shows every subscription, what it
really costs per month/year, and when it renews or expires. It can pick up new
subscriptions automatically from forwarded receipts and bank transactions, and every
automatic detection has a one-click manual fallback.

- Zero runtime dependencies (Node.js built-ins only, including `node:sqlite`)
- Server-rendered UI, mobile friendly, light/dark
- Installable PWA and a Capacitor Android shell with adaptive icons and splashes
- Works for 100+ common platforms (streaming, music, AI, software, cloud, fitness,
  delivery, gaming, news, shopping memberships, and more)
- Manual add/edit is always available
- Optional email, CSV, transaction-webhook, and Plaid ingestion
- Reminders, notification feed, optional webhook/Resend delivery, ICS calendar feed
- Export your data and delete your account from the settings page

## Requirements

- Node.js **>= 22.13** (24+ recommended; tested on 26); `node:sqlite` must be
  available without a flag
- A private directory for the SQLite database and generated secrets
- No npm install is needed for the web server; it is only required to build the
  Android app

## Quick start

```bash
cp .env.example .env
# edit .env, at minimum set RENEWLY_BASE_URL
npm start
```

Open `http://localhost:8787`, create an account, and add a subscription manually or
forward a receipt.

For development with auto-reload:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

## Android

Renewly works as an installable PWA immediately; no SDK or APK is required. On
Android, open the HTTPS site in Chrome and choose **Install app** / **Add to Home
screen**. For a native APK, the Capacitor project lives in `android/` and is built
with Android Studio (the Android SDK runs on your computer, not the phone).

See [docs/ANDROID.md](docs/ANDROID.md) for the PWA steps, Android Studio/SDK setup,
APK installation, tablet sizing, and troubleshooting.

## Configuration

All settings are environment variables or `.env` entries. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `RENEWLY_BASE_URL` | `http://localhost:$PORT` | Public URL used in links and cookies |
| `RENEWLY_DATA_DIR` | `data` | Private directory for DB and secrets |
| `RENEWLY_SECURE_COOKIES` | auto (`true` for https base URL) | Force `Secure` cookies |
| `RENEWLY_TRUST_PROXY` | `0` | Trust `X-Forwarded-For`; only behind a trusted proxy |
| `NODE_ENV` | `development` | `production` enables production behavior |
| `RENEWLY_MASTER_KEY` | auto-generated | Base64 32-byte AES key for encrypted tokens |
| `RENEWLY_EMAIL_WEBHOOK_SECRET` | auto-generated | HMAC secret; setting it **requires** signed inbound email |
| `RENEWLY_TXN_WEBHOOK_SECRET` | empty | Optional second factor for transaction webhooks |
| `RENEWLY_INGEST_DOMAIN` | `in.renewly.local` | Domain shown in forwarding addresses |
| `RENEWLY_NOTIFY_WEBHOOK_URL` | empty | Slack/Discord/ntfy/custom JSON notifications |
| `RESEND_API_KEY` | empty | Email notification delivery via Resend |
| `RENEWLY_NOTIFY_FROM` | `Renewly <renewly@localhost>` | Notification sender |
| `PLAID_ENV`, `PLAID_CLIENT_ID`, `PLAID_SECRET` | unset | Optional Plaid bank sync |

Secrets omitted from the environment are generated once under `RENEWLY_DATA_DIR`
(`master.key`, `email-webhook.secret`). Back that directory up; losing
`master.key` makes stored capability tokens unrecoverable.

## How detection works

### 1. Forward receipts (best signal)

Each account gets a unique address shown on the settings page:

```
renewly+<random-token>@<RENEWLY_INGEST_DOMAIN>
```

Point an inbound-email provider (or your own mail rule) at:

```
POST /webhooks/email
```

The JSON body should contain `to`, `from`, `subject`, and `text`/`html` (or `raw`).
The parser handles common receipt formats, multipart MIME, amounts in USD/GBP/EUR/
CAD/AUD/JPY/INR/PHP, monthly/annual/quarterly cadence, renewal dates, plan names, and
cancellation notices. Only recognized receipt/cancellation messages become
detections; marketing mail is ignored.

Send `X-Renewly-Signature: sha256=<hex hmac>` over the raw body when
`RENEWLY_EMAIL_WEBHOOK_SECRET` is set. Webhook events are deduplicated by message id
or body hash, so retries are safe.

### 2. CSV import

Settings → import accepts a CSV with merchant/description, date, amount, and
optional currency/id/account columns. Common header aliases are recognized. This is
the easiest fallback for banks without an API.

### 3. Transaction webhooks

Post normalized transactions to `POST /webhooks/transactions` with
`Authorization: Bearer <forwarding-token>`. The same token as the email address can
be used, or put it in the URL. Four or more consistent charges auto-create a
subscription; three charges appear in the review queue.

### 4. Plaid (optional)

`POST /api/bank/plaid/link-token`, `/exchange`, and `/sync` are implemented, and
`POST /webhooks/plaid` verifies Plaid's ES256 signature. This path is scaffolded and
requires Plaid credentials; verify it against your Plaid environment before relying
on it.

### Review queue and resubscribing

Auto-apply thresholds are deliberately conservative:

- Known email receipts: `0.70`
- Bank/CSV streams: `0.85` and the merchant must be recognized
- Existing subscription being updated: `0.55`

Anything below the bar stays in the "detected subscriptions" review queue with
Confirm/Dismiss buttons. A new charge after a cancellation or pause reactivates the
subscription, so resubscribing is detected without re-entering anything.

## Security

Implemented:

- scrypt password hashing (`N=32768, r=8, p=1`) with per-user salts
- Opaque server-side sessions; only SHA-256 token hashes are stored
- `HttpOnly`, `SameSite=Strict` cookies (and `Secure` over HTTPS)
- Per-session CSRF tokens on every state-changing form and API request
- Origin checks, login/registration rate limits, and a request body size cap
- Parameterized SQL, strict per-user ownership checks on every object
- HTML escaping for all user-controlled output
- CSP, `X-Frame-Options: DENY`, `nosniff`, referrer policy, HSTS-ready
- AES-256-GCM encryption for capability/provider tokens
- HMAC-SHA256 verification for email webhooks; replay dedupe table
- Plaid JWT verification and audit logging
- Account export, password change, session revocation, account deletion

Production checklist:

1. Serve only over HTTPS and set `RENEWLY_BASE_URL=https://...`.
2. Set `NODE_ENV=production`; keep `RENEWLY_SECURE_COOKIES=true`.
3. Set `RENEWLY_MASTER_KEY` and `RENEWLY_EMAIL_WEBHOOK_SECRET` explicitly.
4. Put Renewly behind a reverse proxy; set `RENEWLY_TRUST_PROXY=1` only if that proxy
   overwrites `X-Forwarded-For`.
5. Keep `RENEWLY_DATA_DIR` mode `0700` and out of backups you do not control.
6. Restrict inbound webhook routes at the proxy/firewall where possible.
7. Back up the database and `master.key`; rotate tokens from Settings if leaked.
8. Do not expose the app to the public internet without TLS.

## Project layout

```
src/
  config.js              env + generated secrets
  db.js                  SQLite schema and helpers
  auth.js                users, sessions, tokens, audit
  http.js                router, cookies, CSRF helpers, headers, rate limits
  server.js              request pipeline and entrypoint
  views.js               server-rendered pages
  domain/                merchants, recurring analysis, subscriptions,
                         email parser, CSV parser
  routes/                pages, API, webhooks, calendar
  jobs/                  reminder scheduling
  providers/plaid.js     optional bank integration
  lib/                   crypto and date utilities
public/                  CSS, PWA manifest/service worker, frontend script, icons
scripts/                 icon and splash generator
android/                 Capacitor Android project (optional APK build)
docs/                    Android build and install guide
test/                    node:test suites
```

## Limits

- Detection is heuristic. Unusual cadences, variable amounts, free trials, and
  family plans may need manual confirmation.
- The bundled merchant catalog covers common platforms; unknown merchants still work
  via manual entry and generic detection.
- Email ingestion needs a provider that can forward/route inbound mail to the
  webhook. No mailbox is polled directly.
- Plaid is optional and not required; CSV and manual entry cover most setups.
