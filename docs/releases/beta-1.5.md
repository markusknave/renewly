# Renewly beta-1.5

This release makes account pickers searchable, adds credit and BNPL providers
such as Atome, and creates missing cards or wallets directly from imported
statements. Transfers already worked between any two saved accounts; the label
and copy now make bank-to-e-wallet and e-wallet-to-bank transfers explicit.

## Highlights

- **Any account pair can transfer.** A transfer can move money from a bank to an
  e-wallet, an e-wallet to a bank, or between two accounts of the same type. The
  entry stores a source and destination, debits one and credits the other, and
  keeps the transfer out of spending and income totals.
- **"Bank account" instead of "Bank transfer."** The payment-method type is now
  **Bank account**. Transfers are separate ledger entries, not a payment-method
  type, so the old label no longer implies a transfer-only account.
- **Searchable account pickers.** Bank, wallet, credit, platform, plan, and
  time-zone dropdowns open a search field. Type part of a name, such as `bpi`,
  `maya`, or `atome`, and pick the filtered match. The native select stays in
  the form, so existing data and exports are unchanged.
- **Credit / BNPL accounts.** A new **Credit / BNPL** payment type covers Atome,
  BillEase, Home Credit, Salmon, Tala, Cashalo, Akulaku, JuanHand, UnaCash, Maya
  Credit, GLoan, SPayLater, and LazPayLater. Credit accounts default to the
  Credit instrument and have their own card fallback and themes.
- **More Philippine banks.** Added PBCom, Philtrust, CTBC, Bank of China
  (Manila), MUFG Manila, Philippine Veterans Bank, Producers Bank, First
  Consolidated Bank, and Al-Amanah, alongside the existing bank and wallet list.
- **Automatic accounts from imports.** When a statement names a card or wallet
  that is not saved, the import preview lists it under **Create missing
  accounts**. The checked-by-default option creates the method with an inferred
  type (bank account, e-wallet, card, or Credit / BNPL) and an opening balance
  of zero, then assigns the imported rows to it. Clear the checkbox to use the
  default account instead.
- **New accounts report.** The import result names the accounts it created, for
  example `Imported 3 expenses and created BillEase, GCash`.

## Behavior details

- Auto-creation uses the statement's Account/Card/Wallet column, Money Manager
  asset names, or Renewly backup payment-method names. It does not invent
  accounts from merchant descriptions.
- Created methods use the earliest imported row date as their balance date and
  a zero starting balance. Edit the method afterward if the statement began at
  a non-zero balance.
- Duplicate import rows and existing methods are matched before creating
  anything, so re-importing the same statement does not add duplicates.
- The searchable pickers are progressive enhancement: forms still submit the
  original select values, and keyboard users can type to filter, use the arrow
  keys, Enter to choose, and Escape to close.

## Upgrading

Install beta-1.5 over beta-1.4. It uses the same signing key and IndexedDB
schema version 3, so no uninstall or backup restore is required. Existing
`bank` payment methods keep working and now display as **Bank account**. JSON
backup format 5 still imports and now accepts `credit` payment kinds.

## Install

Download `renewly-beta-1.5.apk`, tap it on the phone, and allow **Install unknown
apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-1.5.apk
```
