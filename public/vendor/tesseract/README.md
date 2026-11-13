# Bundled OCR assets

Renewly scans receipt photos entirely on the device. These files are shipped in
the app so OCR works with no network and no model download at runtime.

| File | Source | License |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | `tesseract.js` 7.0.0 | Apache-2.0 |
| `tesseract-core-lstm.wasm.js` | `tesseract.js-core` 6.1.2 | Apache-2.0 |
| `lang/eng.traineddata.gz` | `tessdata_fast` 4.0.0 (English) | Apache-2.0 |

Only the non-SIMD LSTM core is bundled: it runs on every WebView and modern
browser, and receipts are small enough that the slower path is acceptable.
The English model is the fast variant to keep the APK small.

Upgrade by replacing these files with the same names from the upstream
packages. Keep `ocr.js` pointed at `tesseract-core-lstm.wasm.js` unless the
core variant changes. The service worker precaches them.

The engine never uploads an image, text, or result. It reads the photo in a
Web Worker and returns text to the local parser in `public/js/receipt.js`.
