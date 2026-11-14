# Renewly beta-2.2

This release rebuilds Activity around the three things people do every day,
centers every dialog on the phone, and adds income and custom categories.

## Highlights

- **Activity is the money home.** The top of the tab has three large buttons —
  **+ Expense**, **+ Income**, and **+ Transfer funds** — and keeps **Import**
  and **Export** in the top right. Import and Export open focused modals without
  leaving the tab.
- **The + tab.** The mobile bar is now Home, Cards, Activity, Plan, and More,
  with Activity in the middle behind a `+` icon.
- **Centered dialogs.** Every modal, including the expense form on a short
  screen, centers in the viewport, caps its height, and scrolls inside itself.
- **Import review that fits.** Parsed rows are cards with date, description,
  amount, type, category, account, and status. The review no longer uses a wide
  table and never scrolls horizontally; the analyst summary and stats wrap into
  the modal width.
- **Income categories.** Income entries can be Salary, Payments, Grants,
  Refunds, Investment, or Other income. Expenses gain Family and Social.
- **Custom categories.** Create an expense or income category with a name and an
  icon from the bundled glossary. Each category gets a color, shows up in the
  picker, labels saved rows, appears in Insights, and travels in JSON backups.
- **Expenses by category.** Insights opens with *Where your money goes*: a donut
  plus ranked rows with icon, amount, share, and progress bar for the month.
- **Back buttons, not breadcrumbs.** Screens under More use a `<` back button so
  the header stays short on phones.

## Categories and backups

Custom categories are stored in the settings record, so they survive restarts,
app updates, and JSON backups. The backup format is now version 6; beta-2.2
still imports formats 1 through 5. Existing ledger rows keep their category
keys, including rows created before income categories existed.

## Transfer and import fixes kept from beta-2.1

Transfers still work between any two saved accounts, imports still show From and
To pickers for transfers, and duplicate rows are still skipped before commit.

## Updating

Install beta-2.2 over beta-2.1 or any beta-1.x build. The signing key and
IndexedDB schema version 3 are unchanged, so no uninstall or backup restore is
required. Users on beta-1.2 or older still need the one-time export, uninstall,
install, and restore migration described in the README.

## Verification

- `npm test`: 132 tests passing.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run verify`: unit tests and `security:check` pass.
- Browser smoke at 390×844, 360×640, and desktop: centered expense and export
  dialogs, three Activity actions, import modal with no horizontal overflow,
  custom category create/select/persist/edit, income Salary entry, income
  category filtering, Insights category summary, back links, and a 5-row CSV
  import committed with an auto-created account.

## Install

Download `renewly-beta-2.2.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-2.2.apk
```
