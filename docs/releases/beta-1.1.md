# Renewly beta-1.1

Renewly is now an expense tracker as well as a subscription tracker. This release
adds daily spending, simulated card balances and interest, in-app goals, CSV /
Excel / PDF reports, and a strictly offline analyst.

## Highlights

- **Expense tracker** — log purchases, bills, and fees with a date, category,
  notes, and payment method. Filter by preset ranges or a custom date range,
  category, method, or search text.
- **Card dashboard** — stylised Philippine card designs for BPI, BDO, Metrobank,
  UnionBank, RCBC, Security Bank, Chinabank, LANDBANK, PNB, CIMB, Maya, GCash,
  GoTyme, Tonik, MariBank, Netbank, UNO, UnionDigital, Komo,
  DiskarTech, GrabPay, ShopeePay, PayPal, Wise, American Express, Citi, HSBC,
  Standard Chartered, and Maybank, plus clean fallbacks for other accounts. Each
  card records whether it is debit, credit, prepaid, an account, a wallet, or
  cash.
- **Interest that compounds** — enter an annual rate and choose daily or monthly
  compounding. Completed months post one automatic `Interest earned` row; the
  current month shows as pending interest on the card and is included in the
  balance.
- **Goals** — create a target and deadline, then move money from any card or
  wallet into the goal. Withdrawals return it. Progress, monthly pace, required
  monthly amount, and projected finish date are computed locally.
- **Reports** — export the current filtered view as CSV, a real XLSX workbook, or
  a paginated PDF. Reports include expenses, interest, and goal transfers in the
  selected range.
- **Local analyst** — forecasts month-end and 30-day spending, highlights
  category shifts, checks goal feasibility, and answers questions in a chat.
  It has no internet access, no telemetry, no training, and no persisted chat.
- **New UI** — phone bottom navigation, desktop navigation, dark mode, card
  carousel, donut chart, sparkline, progress rings, and a redesigned
  subscription tracker under **More**.

## Upgrading

- Installing beta-1.1 over beta-0.3 keeps the IndexedDB database. The schema
  moves from 2 to 3 and only adds the `transactions` and `goals` stores.
- Existing payment methods start with a zero opening balance and no interest
  until you edit them. Existing subscriptions, groups, and settings are
  untouched.
- JSON backups from beta-0.1 through beta-0.3 still import. New backups use
  format version 4 and include ledger entries, goals, card balances, and rates.

## Verification

- `npm test` covers finance math (balances, daily/monthly compounding,
  idempotent accrual, goals), report writers, the local analyst and chat, backup
  round-trips, store validation, and view rendering.
- Browser smoke tests cover adding a card with interest, logging expenses,
  creating and funding a goal, asking the chat, JSON export/import, and
  downloading CSV, Excel, and PDF files.

## Known limits

- Interest is gross of the 20% final tax on Philippine deposit interest and does
  not model promotional tiers, missions, or balance caps.
- Balances are simulations over the values you enter; Renewly is not connected to
  any bank.
- Card artwork is an original CSS recreation inspired by public brand colours,
  not official bank artwork.
- The APK is beta-signed for sideloading, not Play Store distribution.

## Install

Download `renewly-beta-1.1.apk`, tap it on the phone, and allow **Install unknown
apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-1.1.apk
```
