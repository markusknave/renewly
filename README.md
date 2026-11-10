# Renewly

Offline-first subscription tracker for a phone. No server, no account, no email
forwarding: every subscription, payment label, and setting lives in IndexedDB on
the device. Renewly shows what each subscription really costs per month/year and
what is renewing or expiring next.

- Recurring subscriptions and one-time deals that expire
- Custom groups such as Cars or Home, with a payment-method breakdown per group
- Monthly/yearly normalization, due-soon and overdue lists
- Plan catalog for mainstream platforms with Philippine prices, source links, and
  verification dates
- A payment-method label per subscription
- Scheduled Android notifications that fire even when the app is closed
- Installable PWA and a Capacitor Android shell that bundles the app
- Zero runtime web dependencies (the web app is plain ES modules)

## Download

Beta builds are published as GitHub Releases. The latest release is
[beta-0.2](https://github.com/markusknave/renewly/releases/tag/beta-0.2), and its
only release asset is the installable APK:

```text
renewly-beta-0.2.apk
```

Download it on the phone, tap it, and allow **Install unknown apps** for the
browser or file manager. The build is beta-signed, so it installs without the
Play Store. Android may warn that the app is from an unknown developer; that is
expected for a beta sideload.

To install with `adb` instead:

```bash
adb install -r renewly-beta-0.2.apk
```

### Updating from beta-0.1

> Installing beta-0.2 over an existing beta install keeps the IndexedDB
> database: the version 2 upgrade only adds a groups store. Every beta-0.2 and
> newer APK is signed with the same bundled beta key, so future updates also
> install in place.
>
> beta-0.1 CI builds used a runner-generated debug key. If Android rejects the
> install with a signature mismatch, export your data first, uninstall beta-0.1
> once, then install beta-0.2 and import the JSON backup. From beta-0.2 onward
> this one-time step is not needed.

## What changed from v1

The v1 app was a Node server with accounts, email forwarding, transaction
webhooks, Plaid, and server-side reminders. That stack cannot run on a phone and
required a hosted mailbox, so it was removed. Renewly is now a single client
app:

- No auth, sessions, CSRF, cookies, database server, or webhooks
- Manual entry (or catalog-assisted entry) is the only ingestion path
- Groups organize subscriptions into local lists such as Cars, with a count of
  which payment method pays which subscriptions in each list
- Android reminders are scheduled locally with the notification plugin, so they
  fire while the app is closed; the web build still only notifies while open
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

- Storage: IndexedDB database `renewly` (stores `subscriptions`, `groups`,
  `paymentMethods`, `settings`). Schema version 2 adds `groups` without touching
  existing records.
- App updates keep the database. The APK is signed with the same bundled beta
  key for every beta-0.2+ build, so Android upgrades the app in place.
- No network requests except opening a catalog source link you tap.
- Export produces a plain JSON file; Import replaces all data on the device.
- Erasing site data, clearing app storage, or uninstalling the APK deletes the
  database. Export first if you care about it.

## Notifications

- Android schedules one local notification per subscription per reminder day,
  at 09:00 device-local time. Schedules use Android's alarm manager with
  `allowWhileIdle`, so they fire even when Renewly is closed, and the plugin
  restores pending notifications after a reboot.
- Grant the notification permission from **Settings → Notifications** in the
  app. Android 13+ also asks for notification permission on first use; Android
  12+ may ask for alarm permission depending on the device.
- Reminders are rescheduled whenever subscriptions or settings change and on
  app launch. A long-closed app cannot know about data that changed elsewhere,
  because there is no server.
- The web/PWA build cannot wake itself in the background; notifications there
  only fire while the tab or installed PWA is open.

## Limits

- No email, bank, or Plaid ingestion by design.
- Web notifications only fire while the app is open; use the Android APK for
  closed-app reminders.
- Catalog prices are point-in-time snapshots and vary by region, plan, and
  promotions. Always confirm on the platform before paying.
- The web app needs a modern browser with IndexedDB. Private browsing may block
  storage.
- The bundled beta signing key is for sideload builds only. Use a private key
  from CI secrets or Play App Signing before publishing to a store.

## Project layout

```text
public/
  index.html             app shell
  js/app.js              router, actions, import/export, notification sync
  js/views.js            dashboard, form, groups, catalog, cards, settings
  js/db.js               IndexedDB backend + in-memory backend for tests
  js/store.js            validation, CRUD, groups, settings, summary math
  js/catalog.js          bundled catalog loader
  js/reminders.js        reminder occurrence computation
  js/notifications.js    Capacitor local-notification bridge
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
