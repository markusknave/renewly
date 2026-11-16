# Renewly beta-2.3

This release checks imported accounts before anything is committed and fixes the
Android system back button so it returns to the previous tab.

## Highlights

- **Account check before import.** After a CSV, Excel, PDF, JSON, or Money
  Manager file is read, the local analyst compares every account named by the
  file with the accounts saved on the device. Missing accounts open in a
  **Check the accounts** modal before the transaction review.
- **Editable, one row at a time.** The modal shows the detected account type and
  how many rows use it. Each name is editable, so an account can be created with
  its detected name or renamed first. Unchecking skips it.
- **No duplicate accounts.** Renaming a detected account to an existing label
  links the imported rows to that account instead of creating a second record.
  Confirmed accounts start at zero on the earliest transaction date.
- **Transfer destinations included.** Names such as `InstaPay to GCash` join the
  account check when the destination is not saved yet.
- **Re-linked review.** After accounts are created, preview rows are re-assigned
  and duplicate checks are re-run before the review opens.
- **Android back returns to the previous tab.** The hardware back button now
  walks the WebView history. It only closes the app at the first screen instead
  of exiting immediately.

## Import flow

1. Choose or drop a statement.
2. If the file names accounts that are not saved, review them in **Check the
   accounts**. Keep, rename, or uncheck each one.
3. Confirm to create the accounts and open the transaction review.
4. Correct types, categories, and transfer accounts, then import.

Files that do not name an account go straight to the review. When the tracker
has no accounts at all, the review warns that rows will import unassigned.

## Updating

Install beta-2.3 over beta-2.2 or any beta-1.x build. The signing key, IndexedDB
schema version 3, and JSON backup format 6 are unchanged, so no uninstall or
backup restore is required. Users on beta-1.2 or older still need the one-time
export, uninstall, install, and restore migration described in the README.

## Verification

- `npm test`: 136 tests passing.
- `npm run verify`: unit tests and `security:check` pass.
- Robolectric `AndroidShellTest`: back at a non-root history entry calls
  `WebView.goBack()` without finishing the activity; back at the root finishes
  it.
- Browser smoke at 390×844: a no-account CSV listed Atome, BPI Debit, and GCash;
  Atome was renamed to Atome Card; all rows were linked in the review. A second
  file listed only Maya, which was renamed to Maya Wallet and imported.

## Install

Download `renewly-beta-2.3.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-2.3.apk
```
