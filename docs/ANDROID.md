# Running Renewly on Android

Renewly ships two ways to run on a phone, and both are self-contained:

- **PWA**: the web app installed from a browser.
- **APK**: a Capacitor shell that bundles `public/` inside the app.

There is no server URL, no login, and no network requirement. Data is stored in
IndexedDB inside the browser profile or the app's WebView.

> The Android SDK is installed on a **computer**, not on the phone. The phone only
> installs the finished `.apk`.

## Option A - PWA (no SDK)

Chrome requires HTTPS (or `localhost`) to offer installation.

1. Serve `public/` over HTTPS, or open the app on the same computer at
   `http://localhost:8080` after `npm run serve`.
2. In Chrome, open the site and choose **Install app** / **Add to Home screen**.
3. Launch it from the home screen.

For a phone on your LAN, `HOST=0.0.0.0 npm run serve` exposes the dev server, but
plain HTTP will not trigger the install prompt. Use the APK, or put the static
files behind HTTPS.

To update: deploy the new `public/` files. The service worker refreshes the
shell on the next visit; bump `CACHE_NAME` in `public/sw.js` when you need to
force it.

## Option B - Build an APK

The Capacitor project lives in `android/`. `capacitor.config.json` has no
`server` block, so the WebView loads the bundled `public/` assets.

### 1. Install the Android SDK

1. Install **Android Studio** from <https://developer.android.com/studio>.
2. Accept the setup wizard and install:
   - Android SDK Platform **36**
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Java 21 (bundled with current Android Studio)
3. Verify:

   ```bash
   java -version
   adb version
   ```

### 2. Sync the web app

```bash
npm ci
npm run android:sync
```

Run `android:sync` again after changing anything under `public/`.

### 3. Build

```bash
npm run android:build
```

The debug APK is written to:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it with:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the phone, tap it, and allow **Install unknown apps** for the
file manager.

`android/app/build.gradle` signs both debug and release builds with
`android/keystore/renewly-beta.p12` (alias `renewly-beta`, password
`renewly-beta`). That key is committed on purpose so every beta APK upgrades in
place and keeps the WebView IndexedDB data. It is a beta-only key: do not use it
for a Play Store release.

### Home-screen widget

The native `QuickAddWidget` provider adds a 2×1 widget. Long-press the home
screen, choose **Widgets → Renewly**, and place it. Tapping it starts
`MainActivity` with a quick-add extra; the activity loads the app at
`#/expenses?new=1`, so the expense tracker opens with the add-expense dialog.
The widget has no background service and stores no data.

### App updates and data

- `public/js/db.js` opens IndexedDB version 3. The upgrade creates the
  `transactions` and `goals` stores and leaves existing subscriptions, payment
  methods, groups, and settings alone.
- Android updates an app in place when the package name, version code, and
  signing key match. Version code 5 and the stable beta key guarantee that for
  beta-0.3 and newer builds.
- Sideloading a package signed by a different key fails with
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`; the only workaround is a one-time
  uninstall, which erases app data. Export JSON first if you hit this with an
  older build.

### Export and import

Android's WebView ignores `<a download>` for blob URLs, so the app does not rely
on it. **Settings → Your data → Export JSON** writes
`renewly-YYYY-MM-DD.json` to the app cache with `@capacitor/filesystem` and opens
the system share sheet through `@capacitor/share`, so the file can be saved to
Files, Drive, or another app. **Import JSON** opens an in-app dialog with a file
field and a paste box, and validates the backup before replacing local data.

CSV, Excel, and PDF reports use the same Filesystem + Share path. On Android the
report is written to the cache as UTF-8 (CSV) or base64 (XLSX/PDF) and handed to
the share sheet. In a browser the app uses the save picker or a normal download.

### Notifications

Renewly uses `@capacitor/local-notifications`. On first use (Settings →
Notifications, first launch with existing subscriptions, or after saving a
subscription) Android may ask for notification and alarm permissions. Once
granted, the app schedules reminders through the alarm manager, so they fire
while the app is closed and are restored after a reboot. Battery optimizations
can still delay a notification on some vendors; allow Renewly to run without
restrictions if reminders arrive late.

The web/PWA build cannot schedule a background wake-up, so it only raises a
notification while it is open.

### Option C - Build in the cloud

The included workflow `.github/workflows/android.yml` runs manually
(`workflow_dispatch`). It installs Node and the Android SDK, runs the tests,
syncs Capacitor, builds the debug APK, and uploads the `renewly-debug-apk`
artifact. No repository variables are required.

## Phone and tablet sizing

- `viewport-fit=cover` plus safe-area insets keep content clear of notches and
  gesture bars.
- Phones use stacked subscription cards, 44 px targets, and 16 px inputs so
  Chrome does not zoom on focus.
- Tablets and landscape use wider containers; orientation is unrestricted and
  `resizeableActivity` is enabled.

Regenerate artwork after a brand change:

```bash
npm run icons
```

## Security and data

- `usesCleartextTraffic="false"`, mixed content disabled, WebView debugging off.
- `allowBackup="false"`, so the WebView database is not backed up by Android.
- Data lives in the app's IndexedDB. Schema upgrades are additive, and beta APKs
  share one signing key, so installing a newer beta keeps the database. Clearing
  storage or uninstalling still deletes it; use **Settings → Export JSON** first.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| White/blank screen | Run `npm run android:sync` after changing `public/`, then rebuild. |
| Old UI after an update | Fully close the app; bump `CACHE_NAME` in `public/sw.js`; rebuild the APK. |
| Catalog is empty | Confirm `public/data/plans.json` exists and was copied by `android:sync`. |
| Data disappeared | App storage was cleared or the APK was uninstalled. Restore from an exported JSON file. |
| Install says signature mismatch | The old APK used a different key. Export data, uninstall once, install beta-1.2, then import the JSON file. |
| No notification when closed | Grant notification/alarm permission in Android settings and allow Renewly to run without battery restrictions. |
| Build fails with missing SDK | Install Android SDK Platform 36 and Build-Tools in Android Studio. |
| PWA install option missing | The page is not HTTPS or `localhost`. Use the APK or an HTTPS host. |
