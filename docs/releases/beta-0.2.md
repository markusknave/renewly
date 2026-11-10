# Renewly beta-0.2

This beta adds subscription groups, reminders that fire while the app is closed,
and an in-place upgrade path that keeps your data.

## Subscription groups

- New **Groups** tab. Create lists such as **Cars**, **Home**, or **Family**, and
  rename or delete them later.
- Every subscription has an optional group. The dashboard shows group filter
  chips and recomputes the monthly/yearly totals for the selected list.
- Each group shows which payment methods pay its subscriptions, with a count per
  method and the subscription names in the tooltip, followed by the full list.
- Deleting a group keeps its subscriptions and moves them to **Ungrouped**.

## Reminders while the app is closed

- Android builds now use local notifications scheduled through the alarm
  manager. One notification is scheduled per subscription per reminder day at
  09:00 device-local time, with `allowWhileIdle` so it fires with the app
  closed.
- Pending reminders are restored after a reboot and rescheduled whenever
  subscriptions or settings change or the app starts.
- Notifications open the matching subscription when tapped.
- Grant notification permission under **Settings → Notifications**. Android 13+
  shows the system prompt; Android 12+ may also ask for alarm permission. The
  app asks on first launch when subscriptions already exist, and after saving a
  subscription if permission is still undecided.
- The web/PWA build still only notifies while it is open, because browsers
  cannot wake a closed app.

## Data preserved across updates

- The database moves to schema version 2. The upgrade only creates the `groups`
  store; existing subscriptions, payment methods, and settings are untouched.
- Every beta-0.2+ APK is signed with the same bundled beta key, so Android
  installs updates in place instead of requiring an uninstall.
- **If you installed beta-0.1:** that CI build used a runner-generated debug key.
  If Android rejects beta-0.2 with a signature mismatch, export your JSON (if the
  app still opens), uninstall beta-0.1 once, install beta-0.2, and import the
  backup. This one-time step is not needed for later beta updates.

## Capitalization

- Payment-method type dropdowns now show **Card**, **E-wallet**, **Bank
  transfer**, **Cash**, and **Other** instead of raw lowercase values.
- Catalog category selectors use proper labels, and method types shown on
  subscription rows are capitalized.

## Other

- Export format version 2 includes groups and group membership. Version 1
  exports still import; their subscriptions land in **Ungrouped**.
- Service worker cache bumped to `renewly-shell-v4`.

## Install

Download `renewly-beta-0.2.apk` below and install it, or use:

```bash
adb install -r renewly-beta-0.2.apk
```

The APK is beta-signed and built by the `Build Android APK` workflow. Verify the
signer with:

```bash
apksigner verify --print-certs renewly-beta-0.2.apk
```
