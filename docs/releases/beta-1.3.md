# Renewly beta-1.3

This release makes the ledger distinguish income from expenses. Imported bank
rows, salary deposits, refunds, and credits are now stored as income instead of
being skipped or counted as negative expenses.

## Highlights

- **Income-aware imports.** CSV/TSV, Excel, text PDF, JSON, and Realbyte Money
  Manager backups now classify rows as `expense` or `income`.
  - Debit, withdrawal, and expense rows become expenses.
  - Credit, deposit, salary, refund, and income rows become income.
  - Separate `Debit`/`Credit` columns work, including rows where the unused
    column contains `0.00`.
  - Positive amounts with no explicit type still default to expense, preserving
    older imports.
- **Manual income entry.** The add/edit dialog has an **Expense / Income**
  selector. Income adds to the selected card or wallet; expenses subtract.
- **Transaction filters.** The Expenses screen has an **All types / Expenses /
  Income** filter and shows expense, income, and net totals for the visible
  range.
- **Correct balances and reports.** Income increases payment-method balances,
  expenses decrease them, and CSV/XLSX/PDF reports keep income positive.
- **Import preview.** The review screen shows Type, expense and income counts,
  separate totals, net, and analyst categories before committing. Each preview
  row has a Type selector so an ambiguous positive amount can be corrected
  before it is imported.
- **Backups and Money Manager.** Renewly JSON backups and MMBAK/MMBAK SQLite
  rows preserve income instead of dropping it.

## Existing imports

Rows imported before beta-1.3 keep their old type. Open an affected entry and
switch it to **Income**, or delete the old rows and re-import the statement with
the corrected Type column. Type is part of duplicate matching, so re-importing
without removing an old expense creates a separate income row.

## Upgrading

Install beta-1.3 over beta-1.2-hotfix. It uses the same rotated signing key and
the same IndexedDB schema, so no uninstall or backup restore is required.

Users still on beta-1.2 or older must follow the beta-1.2-hotfix one-time
export/uninstall/install/restore migration because that release rotated the
signing key.

## Verification

- `npm test`: 105 tests passing.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run security:check` and `npm run security:audit`: clean.
- Browser smoke: income CSV preview, commit, type filter, manual income entry,
  and balance/report direction.
- GitHub Actions: test, security, Android, and CodeQL checks must pass before
  merge; the release tag builds and verifies the signed APK.

## Install

Download `renewly-beta-1.3.apk`, tap it on the phone, and allow **Install unknown
apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-1.3.apk
```
