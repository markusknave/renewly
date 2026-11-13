# Renewly beta-0.3

This beta fixes data export and import, adds safeguards against duplicate
subscriptions, replaces free-text payment labels with Philippine bank and
e-wallet choices, and expands the plan catalog.

## Export and import now work in the Android app

- **Export JSON** previously relied on a browser download, which Android's
  WebView silently ignores, so the button did nothing. Native builds now write
  the backup through the Capacitor filesystem and open the Android share sheet,
  so the file can be saved to Files, Drive, or sent anywhere.
- On the web, Export uses the browser's save picker when it is available and
  falls back to a normal download. Every export now reports what happened
  instead of failing silently.
- **Import JSON** opens a dialog with a visible file field and a paste box, so
  it no longer depends on a hidden input being programmatically clicked. Errors
  appear inside the dialog.
- The export format moves to version 3. Version 1 and 2 backups still import;
  imported names are clamped to the new limits and unknown values fall back to
  safe defaults.
- Export, Import, and Erase all data stay on one row at every screen width.

## Duplicate subscriptions and shared trackers

- Renewly refuses a second tracker for the same service, plan, and owner.
- When an add would duplicate an existing subscription, the form shows a notice
  and asks whether the subscription is for another individual or group. The
  **Tracked for** field becomes required; saving with a name tracks that
  person's or group's subscription separately.
- **Tracked for** is shown on subscription rows, in groups, and in the
  dashboard empty-state text, and it is included in exports and imports.
- The same rule is enforced in the data layer, so imports cannot create
  duplicate trackers either.

## Names are capped at 25 characters

- Subscription names, `Tracked for` labels, and group names are limited to 25
  characters in the forms, in validation, and on import. Long names no longer
  stretch group chips, table rows, or group headers.
- Group and payment-method forms keep their fields and buttons aligned in one
  row.

## Payment methods

- The free-text label is replaced by **Bank / E-wallet** lists for the selected
  type:
  - **Card** and **Bank account** list Philippine banks (BDO, BPI, Metrobank,
    Landbank, UnionBank, Security Bank, RCBC, Chinabank, EastWest, HSBC,
    Citibank, Maybank, PNB, PSBank, AUB, CIMB, Maya Bank, GoTyme, SeaBank,
    Tonik, Komo, DiskarTech, and more).
  - **E-wallet** lists GCash, Maya, GrabPay, ShopeePay, Lazada Wallet, coins.ph,
    PalawanPay, JuanCash, PayPal, Wise, and others.
  - **Cash** and **Other** keep a single generic choice.
- **Other / custom…** is still available for anything not listed, and existing
  free-text labels remain editable.

## Time zone

- Time zone is now a dropdown of the full IANA list, labeled with the current
  UTC offset. Because offsets are computed for today, daylight-saving zones show
  their summer or winter offset (for example `America/New_York (UTC-04:00)`).
  A saved zone that is not in the platform list is still selectable.

## Groups and filters

- The **Ungrouped** filter chip stays available while a named group is selected,
  so switching between a group and Ungrouped no longer requires going through
  **All groups**.
- **Paid with** and the "No subscriptions in this group yet" message are
  vertically aligned in the group header.

## Catalog

The bundled catalog grows to 26 platforms. New entries, all with PHP prices and
source links:

| Platform | Plans | Verified source |
| --- | --- | --- |
| Apple Arcade | ₱369/month, ₱2,490/year | apple.com/ph |
| Apple Fitness+ | ₱149/month, ₱1,190/year | apple.com/ph |
| Viu | ₱149/30 days, ₱79/7 days | dito.ph partner page |
| iQIYI | ₱145/month | dito.ph partner page |
| WeTV | ₱149/month | dito.ph partner page |
| MUBI | ₱399/month, ₱3,588/year, ₱299/month student | mubi.com/en/ph |
| Strava | ₱1,500/year, ₱4,499/year family, ₱750/year student | strava.com/subscribe |

Each plan has a matching entry in `scripts/plans.sources.json` with its source.

## Interface

- Header tabs are a spaced pill bar: right-aligned on desktop, evenly
  distributed and scrollable on phones.
- The dashboard rows keep **Edit** on the left and **Delete** on the right of
  the same row.
- Layout is responsive from 320 px phones to wide desktop: fluid page gutters,
  wrapping toolbars, single-column forms on narrow screens, card-style tables
  on phones, and a wider container on large displays.

## Data preserved across updates

- The database schema is unchanged at version 2; the new `trackedFor` field is
  stored on existing records, so an in-place update keeps everything.
- Export format version 3 is additive. beta-0.2 backups import unchanged.

## Install

Download `renewly-beta-0.3.apk` below and install it over beta-0.2, or use:

```bash
adb install -r renewly-beta-0.3.apk
```

The APK is beta-signed with the same key as beta-0.2, so it upgrades in place.
