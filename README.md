# Renewly

Renewly is an offline-first money app for a phone: a daily expense tracker, a
subscription tracker, and a simulated wallet for Philippine cards and e-wallets.
There is no server, no account, no analytics, and no email forwarding. Every
transaction, card balance, goal, and setting lives in IndexedDB on the device.

Beta builds are published as GitHub Releases. The latest release is
[beta-1.1](https://github.com/markusknave/renewly/releases/tag/beta-1.1), and its
release asset is the installable APK:

```text
renewly-beta-1.1.apk
```

## What is new in beta-1.1

- **Expense tracker.** Log purchases, bills, and miscellaneous fees with a date,
  category, notes, and payment method. Balances update immediately.
- **Slick card dashboard.** The home screen shows the money in every card,
  wallet, bank, or cash account on a carousel of stylised Philippine card
  designs, plus this month's spend, a category donut, recent activity, goals,
  and renewals.
- **Interest that compounds.** Set an annual rate and choose daily or monthly
  compounding per payment method. Completed months post automatically to the
  ledger; the current month shows as pending interest on the card and is
  included in the balance.
- **Goals funded in-app.** Create a target and deadline, then move money from
  any card or wallet into the goal. No bank transfer happens; this is purely the
  money you already recorded.
- **CSV, Excel, and PDF exports.** Filter the expense view by date range,
  category, method, or search, then export exactly that view.
- **Local analyst.** An Insights tab with forecasts, category shifts, goal
  feasibility, and a chat that answers questions from this device's records.
  It has no network access, cannot open other apps, does not learn, and keeps
  chat history only in memory.
- **New shell.** Bottom navigation on phones, a desktop nav, dark mode, and a
  redesigned subscription tracker under **More**.

## Features

### Expenses and balances

- Add an expense with date, description, amount, category, notes, and payment
  method.
- Categories: food and drinks, groceries, transport, bills and utilities,
  shopping, health, entertainment, education, travel, home, and other.
- Every payment method has a starting balance and a balance date. Its current
  balance is the starting balance plus income and interest, minus expenses and
  goal deposits, plus goal withdrawals.
- Filter by this month, last month, last 7 days, last 30 days, this year, all
  time, or a custom range. Category, method, and text filters apply on top.
- Delete an expense to restore the amount to its payment method.

### Cards and interest

- Cards, e-wallets, bank accounts, cash, and other accounts.
- Stylised card art for BPI, BDO, Metrobank, UnionBank, RCBC, Security Bank,
  Chinabank, LANDBANK, PNB, CIMB, Maya, GCash, SeaBank, GoTyme, Tonik, MariBank,
  Netbank, UNO, UnionDigital, Komo, DiskarTech, GrabPay, ShopeePay, PayPal, Wise,
  American Express, Citi, HSBC, Standard Chartered, and Maybank. Other providers
  use a clean fallback based on account type. The artwork is original CSS
  inspired by public brand colours, not official bank assets.
- Set the annual rate in percent (for example `3.25`), the network, and daily or
  monthly compounding.
- Interest is gross of the 20% final tax on Philippine deposit interest. Renewly
  does not deduct tax automatically.
- Daily compounding: `balance × rate ÷ 365` each day, rounded to cents, added to
  the running balance.
- Monthly compounding: `balance × rate ÷ 12` on the last day of each month.
- A completed month becomes one `Interest earned` ledger row. The current month
  is shown as pending on the card and included in the displayed balance, so the
  card reflects daily accrual without creating partial rows.

### Goals

- Target amount, optional deadline, colour, and note.
- Move money from any payment method into a goal, or withdraw it back.
- Progress ring, remaining amount, three-month contribution pace, required
  monthly amount for the deadline, and a projected finish date.
- Deleting a goal removes its transfers and returns the money to the source
  payment methods.

### Reports

- **CSV** for spreadsheets and scripts.
- **Excel (.xlsx)** as a real OOXML workbook with a styled header, frozen top
  row, auto-filter, and currency formatting.
- **PDF** with a title, date range, totals, a monospaced table, page numbers,
  and automatic pagination.
- The export follows the current date range, category, method, and search
  filters. It includes expenses, interest, and goal transfers in that range.

### Subscriptions

- Recurring subscriptions and one-time deals that expire.
- Custom groups such as Cars or Home, with a payment-method breakdown per group.
- One tracker per subscription type, plus a **Tracked for** owner when you pay
  for someone else's subscription of the same type.
- Monthly/yearly normalization, due-soon and overdue lists.
- Plan catalog for 26 mainstream platforms with Philippine prices, source links,
  and verification dates.
- Scheduled Android notifications that fire even when the app is closed.

### Local analyst and chat

- Answers questions such as "how much did I spend on food last month", "what is
  my balance", "will I reach my goals", "forecast my spending", and "how can I
  save more".
- Uses deterministic period summaries, category shares, a 30-day daily average,
  a least-squares trend, and goal pace math. Forecasts are straight-line
  estimates, not guarantees.
- Reads only Renewly's own IndexedDB. It makes no network requests, loads no
  remote model, sends no telemetry, and keeps chat messages in memory only.
- No training and no user profile: every answer is recomputed from the ledger
  for the current question.

## Download and install

Download the APK on the phone, tap it, and allow **Install unknown apps** for the
browser or file manager. The build is beta-signed, so it installs without the
Play Store. Android may warn that the app is from an unknown developer; that is
expected for a beta sideload.

```bash
adb install -r renewly-beta-1.1.apk
```

### Updating from beta-0.3

Installing beta-1.1 over beta-0.3 keeps the IndexedDB database. The schema moves
from version 2 to version 3, which only adds the `transactions` and `goals`
stores; existing subscriptions, groups, payment methods, and settings are left
alone. Both APKs use the same beta key, so the update installs in place.

### Updating from beta-0.1 or beta-0.2

Every beta-0.2 and newer APK is signed with the same bundled beta key, so future
updates install in place. beta-0.1 CI builds used a runner-generated debug key.
If Android rejects the install with a signature mismatch, export your data
first, uninstall beta-0.1 once, then install beta-1.1 and import the JSON backup.

## Run it locally

```bash
npm run serve          # http://127.0.0.1:8080
npm test               # node:test suites
```

To test from a phone on the same network:

```bash
HOST=0.0.0.0 npm run serve
```

Chrome only offers PWA installation on HTTPS or `localhost`; for a real phone
install, use the APK above or serve `public/` over HTTPS.

## Android

The native project lives in `android/`. Capacitor copies `public/` into the app,
so the APK runs with no network and no configured server URL.

```bash
npm ci
npm run android:sync
npm run android:build
```

The debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`. Install it with
`adb install -r <apk>`, or copy it to the phone and tap it.

The GitHub Actions workflow (`Build Android APK`) builds the same APK in the
cloud, runs the tests, and publishes it to the GitHub release for a `beta-*` tag.
See [docs/ANDROID.md](docs/ANDROID.md) for SDK setup and troubleshooting.

## Data and privacy

- Storage: IndexedDB database `renewly` with `subscriptions`, `groups`,
  `paymentMethods`, `transactions`, `goals`, and `settings`. Schema version 3.
- App updates keep the database. Every beta-0.2+ APK uses the same bundled beta
  key, so Android upgrades the app in place.
- No network requests except opening a catalog source link you tap.
- Export produces a plain JSON file (format version 4). On Android the file is
  written to the app cache and handed to the system share sheet so it can be
  saved to Files, Drive, or another app; in a browser it uses the save picker or
  a normal download.
- Import accepts a file or pasted JSON and replaces all data on the device.
  Backups from beta-0.1 through beta-0.3 still import; older files simply have no
  ledger or goals.
- Subscription names, `Tracked for` labels, and group names are limited to 25
  characters. Expense descriptions are limited to 60, goal names to 40, and
  notes to 500.
- Erasing site data, clearing app storage, or uninstalling the APK deletes the
  database. Export first if you care about it.
- Interest, balances, and goals are simulations over the values you enter. They
  are not bank statements and do not connect to any bank.

## Notifications

- Android schedules one local notification per subscription per reminder day, at
  09:00 device-local time. Schedules use Android's alarm manager with
  `allowWhileIdle`, so they fire even when Renewly is closed, and the plugin
  restores pending notifications after a reboot.
- Grant the notification permission from **More → Settings → Notifications**.
  Android 13+ also asks on first use; Android 12+ may ask for alarm permission
  depending on the device.
- Reminders are rescheduled whenever subscriptions or settings change and on app
  launch. A long-closed app cannot know about data that changed elsewhere,
  because there is no server.
- The web/PWA build cannot wake itself in the background; notifications there
  only fire while the tab or installed PWA is open.

## Plan catalog

`public/data/plans.json` is the bundled catalog. It is a snapshot, not a live
feed: the app never scrapes, so prices work offline and cannot silently change.

- Prices are stored as PHP cents. Platforms that publish PHP pricing are used
  directly; USD prices are converted with the rate recorded in `fx`.
- Each plan carries a `sourceUrl` and `verifiedAt` date. The catalog UI links to
  both.
- Payment method and renewal/expiry dates are personal data, so they are not part
  of the catalog; you pick them when you add the subscription.

Refresh the catalog on a computer, not on the phone:

```bash
npm run plans:refresh -- --dry-run   # fetch sources, report drift/unreachable
npm run plans:refresh -- --fx        # refresh the USD→PHP rate
npm run plans:refresh -- --write     # record fetched fingerprints
```

## Limits

- No email, bank, or Plaid ingestion by design. Balances are only as accurate as
  the starting balance and transactions you enter.
- Interest rates are user-entered and gross of tax. Promotional tiers, missions,
  and balance caps are not modeled.
- Card designs are stylised recreations; no bank logos or card artwork are
  bundled.
- Web notifications only fire while the app is open; use the Android APK for
  closed-app reminders.
- Catalog prices are point-in-time snapshots and vary by region, plan, and
  promotions. Always confirm on the platform before paying.
- The web app needs a modern browser with IndexedDB and, for Excel export,
  `CompressionStream`; without it the workbook is written uncompressed and still
  opens.
- The bundled beta signing key is for sideload builds only. Use a private key
  from CI secrets or Play App Signing before publishing to a store.

## Project layout

```text
public/
  index.html             app shell, bottom nav, floating add button
  js/app.js              router, actions, dialogs, imports/exports, reminders
  js/db.js               IndexedDB backend (v3) + in-memory backend for tests
  js/store.js            validation, CRUD, groups, settings, subscriptions
  js/finance.js          balances, interest accrual, goals, periods
  js/insights.js         local analyst, forecasts, offline chat
  js/export.js           CSV, XLSX, and PDF writers
  js/backup.js           JSON backup build/validate/apply (v4)
  js/catalog.js          bundled catalog loader
  js/reminders.js        reminder occurrence computation
  js/notifications.js    Capacitor local-notification bridge
  js/views.js            view barrel
  js/views/              dashboard, expenses, goals, insights, cards, more,
                         subscriptions, shared helpers
  js/lib/dates.js        date, money, and cadence helpers
  js/lib/providers.js    Philippine banks and e-wallets per payment type
  js/lib/categories.js   expense categories, colors, icons, keywords
  js/lib/cardThemes.js   stylised Philippine card themes
  js/lib/timezones.js    IANA zone list with current UTC offsets
  data/plans.json        PH plan catalog
  sw.js                  offline shell cache
  styles.css             UI
scripts/
  serve.mjs              local static server
  refresh-plans.mjs      catalog refresh/drift report
  plans.sources.json     catalog sources
  generate-icons.mjs     icon generator
android/                 Capacitor Android project
test/                    node:test suites
```
