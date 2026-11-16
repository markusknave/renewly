# Renewly beta-2.4-hotfix

This hotfix makes imported account pairs deterministic: `GCash->MariBank` means
one transfer from GCash to MariBank, not an account named after both.

## Highlights

- **Account pairs are transfers.** An account or description value such as
  `GCash->MariBank` sets the row type to Transfer, with GCash as the source and
  MariBank as the destination.
- **No combined account.** The pre-import account check lists GCash and
  MariBank separately. The combined string is never offered as a missing
  account name.
- **One missing side stays specific.** If GCash is saved and MariBank is not,
  only MariBank appears in **Check the accounts**.
- **Several forms map the same way.** `GCash->MariBank`, `GCash -> MariBank`,
  `GCash → MariBank`, `GCash=>MariBank`, and `GCash to MariBank` are accepted in
  account columns. Arrow forms are also read from descriptions and PDF lines.
- **Money Manager transfers.** A `.mbak`/`.mmbak` asset named
  `BPI Debit->Maya` becomes a transfer between those accounts, counted in the
  transfer totals instead of being skipped.
- **Review stays ready.** Pair rows show Transfer with From and To already
  selected. Rows are re-linked after the account check creates or renames either
  side, and transfer/exclude duplicate checks use both accounts.

## Parsing rules

- The left side of an arrow is the source; the right side is the destination.
- A spaced `to`/`into` is split only in an account column, so ordinary
  descriptions are not treated as pairs.
- Each side is matched against saved accounts independently. Unmatched sides
  keep their short name for the account check.
- Generic words such as `transfer`, `instapay`, or `payment` are not treated as
  account names.

## Updating

Install beta-2.4-hotfix over beta-2.3 or any beta-1.x build. The signing key,
IndexedDB schema version 3, and JSON backup format 6 are unchanged, so no
uninstall or backup restore is required. Existing saved data is not rewritten.

## Verification

- `npm test`: 139 tests passing, including CSV account pairs, spaced/word pairs,
  description pairs, PDF pair lines, and Money Manager pair assets.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run verify`: unit tests and `security:check` pass.
- Browser smoke at 390×844: a fresh tracker listed GCash and MariBank separately
  for `GCash->MariBank`, created both, showed the review row as Transfer with
  From GCash and To MariBank, and imported it as a transfer after same-day funds
  were added.

## Install

Download `renewly-beta-2.4-hotfix.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-2.4-hotfix.apk
```
