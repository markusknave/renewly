# Renewly

Offline-first subscription tracker for a phone. No server, no account, no email
forwarding: every subscription, payment label, and setting lives in IndexedDB on
the device. Renewly shows what each subscription really costs per month/year and
what is renewing or expiring next.

- Recurring subscriptions and one-time deals that expire
- Monthly/yearly normalization, due-soon and overdue lists
- Plan catalog for mainstream platforms with Philippine prices, source links, and
  verification dates
- A payment-method label per subscription
- Installable PWA and a Capacitor Android shell that bundles the app
- Zero runtime dependencies (the web app is plain ES modules)

## Download

Beta builds are published as GitHub Releases. The latest release is
[beta-0.1](https://github.com/markusknave/renewly/releases/tag/beta-0.1), and its
only release asset is the installable APK:

```text
renewly-beta-0.1.apk
```

Download it on the phone, tap it, and allow **Install unknown apps** for the
browser or file manager. The build is debug-signed, so it installs without the
Play Store. Android may warn that the app is from an unknown developer; that is
expected for a beta sideload.

To install with `adb` instead:

```bash
adb install -r renewly-beta-0.1.apk
```

## What changed from v1

The v1 app was a Node server with accounts, email forwarding, transaction
webhooks, Plaid, and server-side reminders. That stack cannot run on a phone and
required a hosted mailbox, so it was removed. Renewly is now a single client
app:

- No auth, sessions, CSRF, cookies, database server, or webhooks
- Manual entry (or catalog-assisted entry) is the only ingestion path
- Reminders are computed on the device; the app cannot wake itself in the
  background, so a notification is raised when you open it and something is due
- Data moves with Export/Import JSON instead of a server

## Run it locally

```bash
npm run serve          # http://127.0.0.1:8080
```

Then open the URL. To test from a phone on the same network:

```bash
HOST=0.0.0.0 npm run serve
```

Chrome only offers PWA installation on HTTPS or `localhost`; for a real phone
install, use the APK below or serve `public/` over HTTPS.

```bash
npm test               # node:test suites
```

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
cloud and uploads it as the `renewly-debug-apk` artifact. See
[docs/ANDROID.md](docs/ANDROID.md) for SDK setup and troubleshooting.

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

Source checks live in `scripts/plans.sources.json`. A source with an `extract`
regex records the matched price; otherwise the script records a body hash and
reports when a page changes so you can re-verify the price by hand.

## Data and privacy

- Storage: IndexedDB database `renewly` (stores `subscriptions`,
  `paymentMethods`, `settings`).
- No network requests except opening a catalog source link you tap.
- Export produces a plain JSON file; Import replaces all data on the device.
- Erasing site data, clearing app storage, or uninstalling the APK deletes the
  database. Export first if you care about it.

## Limits

- No email, bank, or Plaid ingestion by design.
- Notifications only fire while the app is open; there is no background worker.
- Catalog prices are point-in-time snapshots and vary by region, plan, and
  promotions. Always confirm on the platform before paying.
- The web app needs a modern browser with IndexedDB. Private browsing may block
  storage.

## Project layout

```text
public/
  index.html             app shell
  js/app.js              router, actions, import/export, notifications
  js/views.js            dashboard, form, catalog, cards, settings
  js/db.js               IndexedDB backend + in-memory backend for tests
  js/store.js            validation, CRUD, settings, summary math
  js/catalog.js          bundled catalog loader
  js/lib/dates.js        date, money, and cadence helpers
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
