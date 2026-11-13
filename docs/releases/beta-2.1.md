# Renewly beta-2.1

This release fixes account transfers, makes every dropdown focus the chosen
option, and gives the whole app a quieter, themeable interface.

## Highlights

- **Transfers work across every account type.** Debit cards, credit cards,
  prepaid cards, bank accounts, e-wallets, credit/BNPL lines, and cash can all be
  a source or destination. A debit-to-e-wallet move reduces the debit and raises
  the wallet by the same amount, and the total across accounts stays unchanged.
- **Transfers in imports.** The import preview now shows both a **From** and a
  **To** account for every transfer row. Rows that name only one side can use
  the default source account, and the commit step rejects a transfer that still
  lacks two distinct accounts instead of creating a fake expense.
- **Focused dropdowns.** Every select opens a list anchored to the field, moves
  keyboard focus into the list, highlights the current value, and scrolls it into
  view. Search stays available on account, provider, plan, and time-zone lists.
  Arrow keys, Home/End, Enter, and Escape work.
- **Grouped navigation.** The mobile bar is now Home, Activity, Cards, Plan, and
  More. More is split into Daily money, Recurring, Tools, and App, so Goals,
  Insights, import, groups, the plan catalog, appearance, and settings are one
  predictable step away.
- **Five themes and ten fonts.** Ivory, Linen, Bloom, Tide, and Midnight ship
  with complete palettes. Custom lets you choose the accent and background;
  surfaces and text contrast are derived automatically. The bundled fonts are
  Poppins, Inter, Roboto, Open Sans, Montserrat, Lato, Nunito Sans, DM Sans,
  Work Sans, and Manrope. They work offline.
- **Issuer-accurate card colours.** Existing card layouts are retained. Debit
  cards use everyday brand colours, credit cards use the darker premium
  finishes of the same Philippine issuers, e-wallets stay bright, and
  credit/BNPL providers such as Atome and BillEase have their own finishes.
- **Minimalist redesign.** Quieter paper surfaces, larger type, softer cards,
  stronger hierarchy, and one primary action per screen.

## Transfer fixes

A transfer is stored as one ledger row with a source and destination. It is
neutral in spending and income totals, both balances update, and editing or
deleting it recalculates both sides. The transfer dialog accepts every saved
payment method, including a debit card as the source and an e-wallet as the
destination.

## Updating

Install beta-2.1 over beta-1.5 or beta-1.3. The signing key and database schema
are unchanged, so no uninstall or backup restore is required. Users on beta-1.2
or older still need the one-time export, uninstall, install, and restore
migration described in the README.

## Verification

- `npm test`: 130 tests passing.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run security:check`: clean.
- Robolectric `AndroidShellTest`: activity launches the Capacitor WebView,
  packaged assets contain the beta-2.1 shell and bundled fonts, the quick-add
  widget builds the correct intent, and the manifest declares the launcher and
  widget receiver.
- Browser smoke: debit-to-e-wallet transfer, both balances after commit, focused
  dropdown list, live theme and font switching, and custom appearance save.

## Install

Download `renewly-beta-2.1.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-2.1.apk
```
