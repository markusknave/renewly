# Renewly beta-2.4-hotfix-2

This second 2.4 hotfix makes imported accounts outside the usual card, e-wallet,
bank, and credit types first-class, adds a default account to the pre-import
account check, and gives stacked panels a consistent gap.

## Highlights

- **Cash accounts.** `Cash on Hand`, `Petty Cash`, and `Cash` import as Cash
  accounts instead of Other. `Cashalo` still resolves as a credit account.
- **Other accounts.** `GBonds`, `GFunds`, `Insurance`, `Binance`, and any other
  name Renewly cannot classify are still created, under the Other type. The
  account check shows Cash or Other before the account is created.
- **Default account before review.** When missing accounts are found, the
  **Check the accounts** modal now includes a searchable Default account
  selector. Rows with no account text use it.
- **Unchecked accounts fall back.** Unchecking a missing account links its rows
  to the selected default instead of blocking the import. If no default is
  chosen, at least one account must still be added.
- **The review default is authoritative.** Changing Default account in the
  review updates every row that did not name an account, and the selected
  account is used when the rows are committed. Explicit account names and
  transfer destinations are untouched.
- **Container gutters.** Stacked panels on Cards, Settings, Insights, and other
  screens now keep a 14px gap between their borders. Grids keep their existing
  gaps, so cards inside a grid do not gain extra margins.

## Account type rules

The statement account name is normalized and checked in this order: card words
such as Visa or Mastercard, BNPL and loan providers, known e-wallets and banks,
cash words, then Other. A name that includes cash, petty cash, on hand, cash
box, or cashier becomes Cash. Everything else that is not recognized as a card,
e-wallet, bank, or credit line becomes Other.

## Updating

Install beta-2.4-hotfix-2 over beta-2.4-hotfix, beta-2.3, beta-2.2, or any
beta-1.x build. The signing key, IndexedDB schema version 3, and JSON backup
format 6 are unchanged, so no uninstall or backup restore is required. The new
type inference and default selector affect new imports only; saved accounts are
not rewritten. Assigning a different type to an existing account is still done
from **Cards → Edit**.

## Verification

- `npm test`: 141 tests passing, including Cash and Other account inference,
  cash/other account creation, default-account reapplication, and cleared
  default behavior.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run verify`: unit tests and `security:check` pass.
- Browser smoke at 390×844:
  - A fresh tracker imported `Cash on Hand` as Cash and `GBonds`, `GFunds`,
    `Insurance`, and `Binance` as Other.
  - The account check showed the inferred types and created all five accounts.
  - A second import found a missing account, selected `Cash on Hand` as the
    default, and showed the blank-account row on Cash on Hand in review.
  - Switching the review default changed the blank row, restored it, and the
    committed transactions used the selected accounts.
  - Unchecking the only missing account and keeping `Cash on Hand` as default
    imported the row to Cash on Hand.
  - Cards and Settings panels each measured a 14px gap between borders.

## Install

Download `renewly-beta-2.4-hotfix-2.apk`, tap it on the phone, and allow
**Install unknown apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-2.4-hotfix-2.apk
```
