# Renewly beta-1.4

This release adds transfers between your own accounts and lets you fill an
expense, income, or transfer from a photo of a receipt, payslip, or bank
transfer confirmation. OCR runs on the device with a bundled English model:
photos are never uploaded.

## Highlights

- **Transfers between accounts.** Add a transaction, choose **Transfer between
  accounts**, pick the source and destination, and save. Both balances update on
  the entry date and the total across accounts stays unchanged. Transfers are
  available from the add dialog, the Cards & wallets screen, the home quick
  actions, and the ledger's Type filter.
- **Transfers in statements.** CSV, Excel, PDF, JSON, and Money Manager imports
  recognize Transfer, InstaPay, PESONet, and "sent to"/"received from" rows.
  The account named in the statement is matched to a saved payment method, and
  the other side is matched from the description when possible. If it cannot be
  matched, the preview marks the row **Needs account** and gives you a picker;
  rows without both sides are not imported, so money is never created.
- **Receipt scanning.** The add/edit dialog has **Scan receipt**. Photograph a
  receipt, payslip, or transfer note, and Renewly reads the date, merchant or
  employer, total or net pay, category, income/expense/transfer type, and the
  matching account. Every field stays editable and the form warns when the
  total or date could not be read.
- **Offline OCR.** Tesseract, its LSTM core, and the English `tessdata_fast`
  model are bundled under `public/vendor/tesseract` and precached by the service
  worker. There is no CDN, no model download at runtime, and no network request
  while scanning.
- **Transfers in backups and reports.** Renewly JSON backups move to format
  version 5 and keep both account references. Older backups still import. CSV,
  Excel, and PDF reports list transfers with `Source → Destination` and exclude
  them from expense and income totals.

## Behavior details

- A transfer is stored as one ledger row with `paymentMethodId` (source) and
  `toPaymentMethodId` (destination). It does not count as spending or income.
- The source account must have enough balance on the transfer date. Editing a
  transfer rechecks the balance against the other rows, not against itself.
- Deleting either account removes the transfers that involve it. Keeping one
  side would mint or destroy money; other spending history is preserved.
- Interest accrual uses each account's side of a transfer, so an incoming
  transfer increases that account's interest base and an outgoing transfer
  decreases it.
- Duplicate detection includes both accounts for transfers. Re-importing the
  same transfer is skipped like any other duplicate.

## Scanning accuracy

OCR is best with a flat, well-lit photo where the total is clearly printed. The
parser prefers **Grand total**, **Total amount due**, **Amount due**, **Net
pay**, **Net income**, and **Take home pay** labels, and ignores subtotal, VAT,
cash tendered, change, and deductions. It still relies on the photo quality;
review every field before saving. Scans are processed in a Web Worker and the
image is discarded after the text is read.

## Upgrading

Install beta-1.4 over beta-1.3. It uses the same signing key and IndexedDB
schema version 3, so no uninstall or backup restore is required. The JSON backup
format moves from 4 to 5; beta-1.4 imports versions 1 through 5, and older
builds do not understand version 5 files.

Users still on beta-1.2 or older must follow the beta-1.2-hotfix one-time
export/uninstall/install/restore migration because that release rotated the
signing key.

## Install

Download `renewly-beta-1.4.apk`, tap it on the phone, and allow **Install unknown
apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-1.4.apk
```
