# Running Renewly on Android

Renewly already ships as an installable **PWA** and as a **Capacitor Android app**.
Both use the same server-rendered UI, so you do not maintain two frontends.

> **Important:** the Android SDK is installed on a **computer**, not on the phone.
> The phone only installs the finished `.apk` (or the PWA). If you only have a
> phone, use the PWA route below.

Renewly needs its Node.js server reachable from the phone. The Android app is a
thin native shell around `RENEWLY_BASE_URL`, so deploy the server first (for
example `https://renewly.yourdomain.com`) and make sure it uses HTTPS.

## Option A - Install the PWA (no SDK, works from the phone)

This is the fastest path and gives you a home-screen app with its own icon and
standalone window.

1. Deploy Renewly behind HTTPS and set `RENEWLY_BASE_URL=https://your-domain`.
2. Open the site in **Chrome on Android** and sign in once.
3. Tap the **three-dot menu** and choose **Install app** (older Chrome:
   **Add to Home screen**).
4. Confirm. The Renewly icon is added to your home screen and app drawer.

Chrome requires HTTPS for installation. `http://localhost` works only on the same
device, not over your Wi-Fi.

To update: deploy the server changes. The installed app picks them up on the next
visit; no APK rebuild is needed.

## Option B - Build an APK with Android Studio

The native project is in `android/`. It uses Capacitor and expects the Renewly
server URL from `capacitor.config.json`.

### 1. Install the Android SDK on your computer

1. Download **Android Studio** from <https://developer.android.com/studio> and run
   the installer. It includes the Android SDK, `adb`, and an emulator.
2. On first launch, accept the setup wizard and install:
   - Android SDK Platform **36**
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools
   - Java 21 (bundled with current Android Studio)
3. Verify from a terminal:

   ```bash
   java -version
   adb version
   ```

   If `adb` is not found, add the SDK `platform-tools` directory to your `PATH`.

### 2. Point the app at your server

Edit `capacitor.config.json` and replace the placeholder:

```json
"server": {
  "url": "https://renewly.yourdomain.com",
  "androidScheme": "https",
  "cleartext": false
}
```

Use the same public URL as `RENEWLY_BASE_URL` on the server. A mismatch causes
login/CSRF failures because the cookie and origin checks are strict.

For an Android emulator talking to a server on the same computer, use
`http://10.0.2.2:8787` and set `"cleartext": true` temporarily. Do not ship a
release build with cleartext enabled.

### 3. Sync the web app into the native project

```bash
npm install
npm run android:sync
```

`android:sync` copies `public/` and `capacitor.config.json` into `android/`. Run it
again after changing web assets, icons, or the server URL.

### 4. Build and install

Open the native project:

```bash
npm run android:open
```

In Android Studio:

- **Run** with a USB-connected phone or an emulator, or
- **Build > Build App Bundle(s) / APK(s) > Build APK(s)**.

The debug APK is written to:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on the phone by either:

- connecting the phone with USB debugging enabled and running
  `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, or
- copying the APK to the phone and tapping it, then allowing
  **Install unknown apps** for your file manager/browser.

For a Play Store release, use **Build > Generate Signed Bundle / APK**, create a
keystore, and build a release `.aab`.

Command-line equivalent (after the SDK is installed and `ANDROID_HOME` is set):

```bash
npm run android:build
```

## Option C - Build in the cloud (no local SDK)

If you cannot install Android Studio, use the included GitHub Actions workflow.

1. Push the project to GitHub.
2. In the repository, open **Settings > Secrets and variables > Actions >
   Variables** and add `RENEWLY_APP_URL` with your HTTPS Renewly URL.
3. Open the **Actions** tab, choose **Build Android APK**, and run the workflow.
4. When it finishes, open the run and download the **renewly-debug-apk** artifact
   from the **Artifacts** section.
5. Unzip it on the phone (or transfer the APK) and tap the APK to install. Allow
   **Install unknown apps** for your file manager/browser when prompted.

The Android SDK still runs in GitHub's cloud, not on the phone; you download only
the finished APK.

## Phone and tablet sizing

The native project and the PWA are already tuned for Android screens:

- The viewport uses `viewport-fit=cover` and CSS safe-area insets, so content is
  not hidden by notches, punch-holes, gesture bars, or rounded corners.
- Phones get a stacked subscription-card layout, 44 px touch targets, and 16 px
  form inputs to stop Chrome from zooming on focus.
- Tablets and landscape layouts use wider containers and a four-column summary
  grid; orientation is unrestricted, and `resizeableActivity` is enabled for
  split-screen and foldables.
- Launcher icons are generated for `mdpi` through `xxxhdpi`, including adaptive
  foreground/background layers, round icons, and orientation-specific splash
  images.

Regenerate all PWA and Android artwork after changing the brand:

```bash
npm run icons
```

## Security defaults in the Android shell

- `usesCleartextTraffic="false"` - HTTPS only in release builds.
- `allowBackup="false"` - the WebView session is not backed up.
- Mixed content is disabled, and WebView debugging is off.
- The app loads the same HTTPS origin as the server, so existing
  `HttpOnly`/`SameSite=Strict` cookies and CSRF checks keep working.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| White/blank screen | The `server.url` is unreachable or uses a bad certificate. Open the URL in Chrome on the phone first. |
| Login works in Chrome but not the APK | `server.url` and `RENEWLY_BASE_URL` differ, so cookies/CSRF are rejected. Make the origins identical. |
| "Install app" missing in Chrome | The site is not HTTPS, the manifest/icons failed to load, or Renewly is already installed. |
| Build fails with missing SDK | Install Android SDK Platform 36 and Build-Tools in Android Studio's SDK Manager. |
| Phone cannot reach a local server | Use your computer's LAN IP (not `localhost`) and HTTPS, or use an emulator with `10.0.2.2`. |
| App updates but old UI remains | Close the app fully, or bump the `CACHE_NAME` in `public/sw.js` for the PWA. |
