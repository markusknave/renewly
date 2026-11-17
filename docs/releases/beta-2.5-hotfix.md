# Renewly beta-2.5-hotfix

This hotfix makes receipt scanning complete in the Android build. The scanner
was stuck at “Reading the photo…” because Android strips the `.gz` suffix from
packaged assets, so Tesseract requested `eng.traineddata.gz` while the APK only
contained `eng.traineddata`. Worker creation never produced a usable result.

## Highlights

- **The language model matches the packaged APK.** The English model ships
  uncompressed as `eng.traineddata`, Tesseract is configured with
  `gzip: false`, and the service worker precaches the same path.
- **Initialization progress is visible.** Progress events are active before
  worker creation, so the dialog shows “Starting the offline OCR engine…”,
  “Loading the offline English model…”, and “Reading the text…” instead of
  sitting on the initial “Reading the photo…” text.
- **Initialization cannot hang forever.** Worker creation has a 45-second
  timeout, separate from the 60-second recognition timeout. A failed start
  reports an error and releases the worker for the next scan.
- **Split totals prefer the next amount.** For sparse OCR such as:
  ```text
  TOTAL
  244.00
  CASH
  1000.00
  CHANGE
  755.60
  ```
  the parser fills 244.00, not the last item price or cash tendered.
- **Dates below noisy OCR lines are found.** Receipt dates that appear below
  several unreadable lines are still parsed instead of silently falling back
  to today.
- **Packaging regression coverage.** A test asserts the model is not gzipped
  and the service worker references `eng.traineddata`; the release workflow
  checks the built APK contains that asset.

## Verification

- `npm test`: 152 tests passing, including new split-total, amount-above-label,
  late-date, and OCR model packaging tests.
- `npm run test:coverage`: thresholds pass.
- `npm run verify`: unit tests and `security:check` pass.
- Browser scan of the reported Jollibee receipt at 390×844:
  - Before the fix: the dialog stayed at “Reading the photo…”.
  - After the fix: progress advanced through engine start and text recognition,
    then filled `2026-11-17`, `244.00`, and the merchant name from the photo.
- The same scan was run from `android/app/src/main/assets/public`, the tree
  Capacitor packages into the APK, and completed with the same date and amount.
- The 4,113,088-byte model is served and loaded without requesting a `.gz` URL.

## Updating

Install beta-2.5-hotfix over beta-2.5, beta-2.4-hotfix-2, beta-2.4-hotfix, or
any beta-1.x build. The signing key, IndexedDB schema version 3, and JSON backup
format 6 are unchanged, so no uninstall or backup restore is required. Saved
transactions, accounts, and settings are not rewritten.

## Download

Download `renewly-beta-2.5-hotfix.apk` from the release, tap it on the phone,
and allow **Install unknown apps** for the browser or file manager. For ADB:

```bash
adb install -r renewly-beta-2.5-hotfix.apk
```
