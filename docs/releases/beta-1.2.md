# Renewly beta-1.2

This release adds statement import, breadcrumb navigation for the More modules,
and an Android home-screen quick-add widget.

## Highlights

- **Import expenses** — read CSV/TSV, text-based PDF, Excel `.xlsx`, JSON, and
  Realbyte Money Manager `.mbak`/`.mmbak` backups. The import screen previews
  every recognized row, shows the local analyst's totals and top categories,
  marks duplicates, and lets you pick a default payment method before committing.
- **Analyst-assisted matching** — categories are inferred from the file's
  category column or the local analyst's keywords. Account and card names are
  matched to saved payment methods. Credits, deposits, and income rows are
  skipped because the import is expense-focused.
- **Breadcrumbs** — Subscriptions, Cards & wallets, Groups, Catalog, Settings,
  and Import expenses now show `More / Module` with a link back to the More hub.
- **Android widget** — a 2×1 Renewly widget opens the expense tracker and the
  add-expense dialog from the home screen.
- **Current bank name** — SeaBank Philippines is now MariBank; the provider list
  and card theme use the current name.
- **Cleaner About** — removed the CSS-card note from the in-app About panel.

## Import limits

- PDF import reads selectable text. Scanned image statements need OCR first.
- Legacy `.xls` files are not supported; save them as `.xlsx` or CSV.
- `.mbak`/`.mmbak` must be Realbyte Money Manager backups with a readable
  `ZINOUTCOME` table.
- Duplicate detection uses date, amount, normalized merchant, and payment method.

## Upgrading

Installing beta-1.2 over beta-1.1 keeps the IndexedDB database. There is no
schema change. JSON backups from earlier betas still import.

## Install

Download `renewly-beta-1.2.apk`, tap it on the phone, and allow **Install unknown
apps** for the browser or file manager. Or:

```bash
adb install -r renewly-beta-1.2.apk
```
