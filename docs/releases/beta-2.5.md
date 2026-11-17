# Renewly beta-2.5

This update fixes receipt scanning for photos taken with the phone camera and
makes a reopened add-expense dialog scan the next receipt instead of dropping
it.

## Highlights

- **Camera photos scan again.** Photos are decoded with their EXIF orientation,
  normalized to a 2400 px long edge instead of 1800 px, and handed to the OCR
  engine as JPEG. The long edge was the difference between a readable receipt
  and a block of text that dropped the shop name and the date.
- **Large frames are decoded at the target size.** The header supplies the
  dimensions and orientation, so `createImageBitmap` is asked for the 2400 px
  bitmap directly. A 12–200 megapixel camera frame no longer has to be
  materialised at full size before it is shrunk.
- **Sparse layouts keep every field.** Sparse-text page segmentation keeps the
  shop name, the label column, and the right-aligned amounts. A photographed
  restaurant receipt that used to fill `Burgos St, Makati City` as the merchant
  now fills `GOLDEN WOK`.
- **Split totals are paired.** When OCR puts `TOTAL` and `694.40` on separate
  lines, the parser pairs the label with the adjacent amount. Amounts next to
  cash, tendered, or change labels are skipped, so the tendered `1000.00` does
  not become the expense.
- **A reopened dialog scans the next receipt.** Every scan carries a run token.
  Closing the dialog invalidates the scan that was running, its progress and
  result are discarded, and the photo chosen after reopening fills the form.
  Previously the global busy flag silently rejected the second scan, and the
  first photo's result was written into the reopened form.
- **Scans cannot hang forever.** A recognition that does not finish within 60
  seconds stops with an error and terminates the worker. The next scan starts a
  fresh worker. Idle release is deferred while any scan is queued, so the
  90-second idle timer cannot terminate the engine mid-scan.
- **Unsupported photos explain themselves.** If the browser cannot decode the
  image, the dialog reports a JPEG or PNG hint instead of the engine's
  `Error attempting to read image`.

## Verification

- `npm test`: 149 tests passing, including new image-header tests and a sparse
  OCR label/amount pairing test.
- `npm run test:coverage`: thresholds pass. Statements 60.09%, branches 53.83%,
  functions 69.65%, lines 63.75%.
- `npm run security:check`: 177 tracked files and 3 workflows checked.
- Browser smoke with the bundled engine, 3024×4032 camera-style photo:
  - The add-expense scan filled `2026-11-16`, `694.40`, and `GOLDEN WOK`.
  - Closing the dialog while the first scan was still running, reopening it,
    and scanning a second receipt filled `245.59` and `JOLLIBEE` from the
    second photo; the first photo's `694.40` and `GOLDEN WOK` were discarded.
  - A non-image file reported “This photo could not be opened. Try a JPEG or
    PNG image.”, and the next valid photo scanned normally.
  - A portrait receipt stored as landscape pixels with EXIF orientation 6 also
    filled `2026-11-16`, `694.40`, and `GOLDEN WOK`, confirming the image is
    decoded upright before OCR.

## Updating

Install beta-2.5 over beta-2.4-hotfix-2, beta-2.4-hotfix, beta-2.4, or any
beta-1.x build. The signing key, IndexedDB schema version 3, and JSON backup
format 6 are unchanged, so no uninstall or backup restore is required. Receipt
scanning is local; no saved transaction, account, or setting is rewritten.

## Download

Download `renewly-beta-2.5.apk` from the release, tap it on the phone, and allow
**Install unknown apps** for the browser or file manager. For ADB:

```bash
adb install -r renewly-beta-2.5.apk
```
