# Renewly

Renewly is an offline-first money app for a phone: a daily expense tracker, a
subscription tracker, and a simulated wallet for Philippine cards and e-wallets.
There is no server, no account, no analytics, and no email forwarding. Every
transaction, card balance, goal, and setting lives in IndexedDB on the device.

Beta builds are published as GitHub Releases. The latest release is
[beta-1.5](https://github.com/markusknave/renewly/releases/tag/beta-1.5),
and its release asset is the installable APK:

```text
renewly-beta-1.5.apk
```

## What is new in beta-1.5

- **Searchable account pickers.** Bank, wallet, credit, platform, plan, and
  time-zone dropdowns open a search field. Type part of a name, such as `bpi`,
  `maya`, or `atome`, and pick the filtered match.
- **Credit / BNPL accounts.** A new payment type covers Atome, BillEase, Home
  Credit, Salmon, Tala, Cashalo, Akulaku, JuanHand, UnaCash, Maya Credit, GLoan,
  SPayLater, and LazPayLater.
- **More Philippine banks.** Added PBCom, Philtrust, CTBC, Bank of China
  (Manila), MUFG Manila, Philippine Veterans Bank, Producers Bank, First
  Consolidated Bank, and Al-Amanah.
- **Any account pair can transfer.** The payment-method type is now **Bank
  account**, and transfers can move money from a bank to an e-wallet, an
  e-wallet to a bank, or between two accounts of the same type.
- **Automatic accounts from imports.** When a statement names a card or wallet
  that is not saved, the preview offers to create it with an inferred type and
  assigns the imported rows to it.
- **Reports the created accounts.** The import result names new accounts, for
  example `Imported 3 expenses and created BillEase, GCash`.

## What is new in beta-1.4

- **Transfers between accounts.** Choose **Transfer between accounts** when
  adding a transaction, or use **Transfer money** on the home screen or Cards &
  wallets screen. Pick the source and destination; both balances update and the
  total across accounts stays the same.
- **Transfers in imports.** CSV, Excel, PDF, JSON, and Money Manager imports
  recognize Transfer, InstaPay, PESONet, and "sent to"/"received from" rows. The
  preview matches the other account where it can and marks rows that still need
  one; transfers without both sides are not committed.
- **Receipt scanning.** **Scan receipt** in the add dialog reads a photo of a
  receipt, payslip, or bank transfer confirmation and fills the date, merchant
  or employer, total or net pay, category, and transaction type. Review and edit
  anything before saving.
- **Offline OCR.** Tesseract, its core, and the English model ship inside the
  app. Scanning uses no network, no CDN, and no model download.
- **Backups and reports.** JSON backups move to format version 5 and preserve
  both sides of a transfer. Reports show transfers as
  `Source → Destination` without counting them as spending or income.

## What is new in beta-1.3

- **Income is a first-class ledger type.** CSV, Excel, PDF, JSON, and Money
  Manager imports now store credits, deposits, salary, refunds, and income rows
  as income instead of skipping them or treating them as negative expenses.
- **Manual income entry.** The add/edit dialog has an Expense / Income selector.
  Income increases the selected card or wallet; expenses decrease it.
- **Type filter and totals.** The Expenses screen filters by All types,
  Expenses, or Income and shows expense, income, and net totals.
- **Reports and backups.** CSV, XLSX, PDF, Renewly JSON, and MMBAK paths keep
  income positive and preserve its type.
- **Import review.** The preview shows Type, expense/income counts, separate
  totals, net, and analyst categories before commit.

## What is new in beta-1.2-hotfix

- **Signing key rotation.** The old beta key was committed to this public
  repository. It is removed, retired, and replaced with a key stored in release
  secrets. New APKs are signed only from tag builds.
- **One-time reinstall required.** Android will not accept this APK as an
  in-place update of beta-1.2 or older. Export a JSON backup, uninstall once,
  install this APK, then restore the backup. See **Updating from beta-1.2 or
  earlier** below.
- **CSV formula injection fixed.** Text cells starting with `=`, `+`, `-`, `@`,
  TAB, or CR are prefixed with an apostrophe on export; amount cells stay
  numeric.
- **Import parser limits.** Files are capped at 25 MB, SQLite record headers and
  overflow chains are bounded, and ZIP/PDF decompression has byte and stream
  limits. A crafted statement can no longer wedge the app.

## What is new in beta-1.2

- **Statement import.** Read CSV, text PDF, Excel (.xlsx), JSON, and Realbyte
  Money Manager `.mbak`/`.mmbak` backups. Preview every row, see the local
  analyst's category summary, skip duplicates, and commit the expenses.
- **Breadcrumbs.** Every module under **More** now shows `More / Module` and a
  link back to the hub.
- **Android home-screen widget.** A 2×1 Renewly widget opens the expense tracker
  and the add-expense dialog directly from the launcher.
- **Current bank name.** SeaBank Philippines is now MariBank, so the provider
  list and card theme use MariBank.

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

- Add an expense or income entry with date, description, amount, category,
  notes, and payment method.
- Move money between any two saved accounts with a transfer, including bank to
  e-wallet and e-wallet to bank. The source is debited, the destination is
  credited, and the transfer is excluded from expense and income totals. The
  source must have enough balance on the entry date.
- Account, provider, platform, plan, and time-zone pickers are searchable: open
  the dropdown, type part of the bank, wallet, or credit provider name, and pick
  the match. Native form values are preserved, so imports and exports are
  unchanged.
- Scan a receipt, payslip, or bank transfer confirmation to prefill the dialog.
  The parser prefers a printed grand total, amount due, net pay, or net income
  and stays editable before saving.
- Categories: food and drinks, groceries, transport, bills and utilities,
  shopping, health, entertainment, education, travel, home, and other. Income
  uses the dedicated Income category.
- Every payment method has a starting balance and a balance date. Its current
  balance is the starting balance plus income and interest, minus expenses and
  goal deposits, plus goal withdrawals.
- Filter by this month, last month, last 7 days, last 30 days, this year, all
  time, or a custom range. Type, category, method, and text filters apply on
  top.
- Delete an entry to recalculate the payment method balance.

### Importing statements

- Supported files: CSV/TSV, text-based PDF, Excel `.xlsx`, JSON, and Realbyte
  Money Manager `.mbak`/`.mmbak` (ZIP-wrapped or plain SQLite).
- Open **Expenses → Import** or **More → Import transactions**. Choose or drop a
  file, review the parsed rows, then import.
- The local analyst infers categories from the description and notes, and
  matches account/card names to your saved payment methods. When the statement
  names a card or wallet you have not saved, the preview lists it under
  **Create missing accounts** (checked by default) and creates it with the
  inferred type: bank account, e-wallet, card, or Credit / BNPL. Clear the
  checkbox to send those rows to the default account instead.
- Debit, withdrawal, and expense rows become expenses. Credit, deposit, salary,
  refund, and income rows become income. Transfer, InstaPay, PESONet, and
  "sent to"/"received from" rows become transfers; the preview matches the
  other account from the description or lets you pick it. Separate Debit/Credit
  columns and an explicit Type/Category column are both supported. The preview's
  Type column lets you correct an individual row before committing.
- Duplicate rows (same date, type, amount, normalized merchant, and method) are
  marked and excluded. Transfer duplicates also compare the other account. The
  commit step rechecks against the current ledger.
- Legacy `.xls` files are not supported; save them as `.xlsx` or CSV. Scanned
  image PDFs need OCR before import because there is no text layer to read.
- The import is local: the file is read in the browser/WebView and nothing is
  uploaded.

### Receipt scanning

- Open the add/edit transaction dialog and choose **Scan receipt**. The phone
  opens the camera; on the web you can choose an image file.
- The bundled OCR engine reads the photo in a Web Worker. Tesseract, its LSTM
  core, and the English fast model live under `public/vendor/tesseract` and are
  precached, so scanning works offline. Nothing is uploaded.
- Receipts fill date, merchant, total, and category. Payslips prefer net pay
  over gross pay. Bank transfer confirmations set the transfer type, direction,
  and the matching saved account when the description names it.
- The parser prefers totals labeled Grand total, Total amount due, Amount due,
  Net pay, Net income, or Take home pay. Subtotal, VAT, cash tendered, change,
  and deductions are ignored. Always check the prefilled fields before saving.

### Cards and interest

- Cards, e-wallets, bank accounts, credit / BNPL accounts, cash, and other
  accounts.
- The payment-method type is **Bank account** (not "bank transfer"); transfers
  are separate ledger entries and can connect any two account types.
- Credit / BNPL providers include Atome, BillEase, Home Credit, Salmon, Tala,
  Cashalo, Akulaku, JuanHand, UnaCash, Maya Credit, GLoan, SPayLater, and
  LazPayLater.
- Additional Philippine banks include PBCom, Philtrust, CTBC, Bank of China
  (Manila), MUFG Manila, Philippine Veterans Bank, Producers Bank, First
  Consolidated Bank, and Al-Amanah.
- Stylised card art for BPI, BDO, Metrobank, UnionBank, RCBC, Security Bank,
  Chinabank, LANDBANK, PNB, CIMB, Maya, GCash, GoTyme, Tonik, MariBank,
  Netbank, UNO, UnionDigital, Komo, DiskarTech, GrabPay, ShopeePay, PayPal, Wise,
  American Express, Citi, HSBC, Standard Chartered, Maybank, Atome, BillEase,
  Home Credit, Salmon, Tala, Cashalo, Akulaku, Maya Credit, and GLoan. Other
  providers use a clean fallback based on account type. SeaBank Philippines was
  renamed MariBank in 2025, so the app uses the current name.
- Set the instrument (debit, credit, prepaid, account, wallet, or cash), the
  network, the annual rate in percent (for example `3.25`), and daily or monthly
  compounding.
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
- The export follows the current date range, type, category, method, and search
  filters. It includes expenses, income, interest, goal transfers, and account
  transfers in that range; income stays positive, expenses are negative, and
  transfers show `Source → Destination` without affecting the totals.

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
adb install -r renewly-beta-1.5.apk
```

### Updating from beta-1.4

Install beta-1.5 over beta-1.4. It uses the same signing key and the same
IndexedDB schema version 3, so no uninstall or backup restore is required. JSON
backup format 5 still imports and now accepts Credit / BNPL accounts.

### Updating from beta-1.3

Install beta-1.5 over beta-1.3. It uses the same signing key and the same
IndexedDB schema version 3, so no uninstall or backup restore is required. The
JSON backup format moves to version 5; beta-1.5 imports versions 1 through 5.

### Updating from beta-1.2-hotfix

Install beta-1.5 over beta-1.2-hotfix. It uses the same rotated signing key and
the same IndexedDB schema, so no uninstall or backup restore is required.

### Updating from beta-1.2 or earlier

The signing key was rotated after the beta-1.2 audit. Android treats this as a
different signer, so it will reject an in-place update with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. This is expected.

1. Export a JSON backup from **More → Settings**.
2. Uninstall Renewly once.
3. Install `renewly-beta-1.5.apk`.
4. Restore the JSON backup.

The new certificate SHA-256 fingerprint is:

```text
33:8C:A3:F9:11:95:21:C8:3B:76:A1:75:0D:41:F5:90:E2:A3:7F:EF:6F:81:9A:C8:EC:34:56:88:A5:05:3D:E6
```

Verify it with:

```bash
apksigner verify --print-certs renewly-beta-1.5.apk
```

### Updating from beta-1.1

Installing beta-1.5 over beta-1.1 keeps the IndexedDB database, but the
signing key changed. Follow the one-time reinstall steps above. There is no
schema change; the import feature only adds rows through the existing expense
store.

### Updating from beta-0.3

Installing beta-1.5 over beta-0.3 keeps the IndexedDB database, but the
signing key changed, so follow the one-time reinstall steps above. The schema
moves from version 2 to version 3, which only adds the `transactions` and
`goals` stores; existing subscriptions, groups, payment methods, and settings
are left alone.

### Updating from beta-0.1 or beta-0.2

beta-0.2 through beta-1.2 used the retired beta key. beta-0.1 builds used a
runner-generated debug key. If Android rejects the install with a signature
mismatch, export your data first, uninstall once, then install
beta-1.5 and import the JSON backup.

## Run it locally

```bash
npm run serve          # http://127.0.0.1:8080
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

### Home-screen widget

Long-press the Android home screen, choose **Widgets → Renewly**, and place the
2×1 quick-add widget. Tapping it opens Renewly on the expense tracker and opens
the add-expense dialog. The widget is a native `AppWidgetProvider`; it does not
run a background service or collect data.

```bash
npm ci
npm run android:sync
npm run android:build
```

The debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`. Install it with
`adb install -r <apk>`, or copy it to the phone and tap it.

See [docs/ANDROID.md](docs/ANDROID.md) for SDK setup and troubleshooting.

## Data and privacy

- Storage: IndexedDB database `renewly` with `subscriptions`, `groups`,
  `paymentMethods`, `transactions`, `goals`, and `settings`. Schema version 3.
- App updates keep the database. beta-1.2-hotfix and newer use the new signing
  key; builds before the hotfix used the retired key and need the one-time
  reinstall migration.
- Receipt scanning is local: the photo is read by the bundled OCR engine in a
  Web Worker, and neither the image nor the extracted text leaves the device.
  The engine caches its English model in a separate IndexedDB store; that cache
  holds no personal data.
- Export produces a plain JSON file (format version 5). On Android the file is
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
- Import supports text-based PDFs. Receipt photos use the scan button instead;
  image-only statement PDFs still need OCR before import. Legacy `.xls` files
  must be saved as `.xlsx` or CSV. `.mbak`/`.mmbak` files must be Realbyte Money
  Manager backups with a readable `ZINOUTCOME` table. Import files are capped at
  25 MB.
- Imported transactions are only as accurate as the statement's text and the
  account matching. Review the preview before committing; duplicate detection
  uses date, type, amount, merchant, and method and cannot catch every reworded
  merchant.
- The web app needs a modern browser with IndexedDB and, for Excel export,
  `CompressionStream`; without it the workbook is written uncompressed and still
  opens.

## Project layout

```text
public/
  index.html             app shell, bottom nav, floating add button
  js/app.js              router, actions, dialogs, imports/exports, reminders
  js/db.js               IndexedDB backend (v3)
  js/store.js            validation, CRUD, groups, settings, subscriptions
  js/finance.js          balances, interest accrual, goals, periods
  js/insights.js         local analyst, forecasts, offline chat
  js/import.js           import orchestrator, expense/income/transfer mapping
  js/importers/          CSV, XLSX, PDF text, MMBAK/SQLite readers, limits
  js/export.js           CSV, XLSX, and PDF writers
  js/receipt.js          receipt, payslip, and transfer-note field parser
  js/ocr.js              offline Tesseract loader and image recognition
  js/backup.js           JSON backup build/validate/apply (v5)
  js/catalog.js          bundled catalog loader
  js/reminders.js        reminder occurrence computation
  js/notifications.js    Capacitor local-notification bridge
  js/views.js            view barrel
  js/views/              dashboard, expenses, goals, insights, import, cards,
                         more, subscriptions, shared helpers
  js/lib/dates.js        date, money, and cadence helpers
  js/lib/providers.js    Philippine banks, wallets, and credit providers
  js/lib/combobox.js     searchable select enhancement for long pickers
  js/lib/categories.js   expense categories, colors, icons, keywords
  js/lib/cardThemes.js   stylised Philippine card themes
  js/lib/timezones.js    IANA zone list with current UTC offsets
  data/plans.json        PH plan catalog
  vendor/tesseract/      bundled OCR engine, LSTM core, and English model
  sw.js                  offline shell cache
  styles.css             UI
scripts/
  serve.mjs              local static server
  refresh-plans.mjs      catalog refresh/drift report
  plans.sources.json     catalog sources
  generate-icons.mjs     icon generator
android/                 Capacitor Android project (includes QuickAddWidget)
```
