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

For a Play Store release, use Android Studio's **Generate Signed Bundle / APK**.

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
- Data lives in the app's IndexedDB. Uninstalling the app or clearing storage
  deletes it; use **Settings → Export JSON** first.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| White/blank screen | Run `npm run android:sync` after changing `public/`, then rebuild. |
| Old UI after an update | Fully close the app; bump `CACHE_NAME` in `public/sw.js`; rebuild the APK. |
| Catalog is empty | Confirm `public/data/plans.json` exists and was copied by `android:sync`. |
| Data disappeared | App storage was cleared or the APK was uninstalled. Restore from an exported JSON file. |
| Build fails with missing SDK | Install Android SDK Platform 36 and Build-Tools in Android Studio. |
| PWA install option missing | The page is not HTTPS or `localhost`. Use the APK or an HTTPS host. |
