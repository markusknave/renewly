# Renewly beta-1.2-hotfix

This is the security hotfix for the beta-1.2 audit. It rotates the APK signing
key, fixes CSV formula injection, and bounds the import parsers. It also adds
local and GitHub Actions security gates for future changes.

## One-time reinstall required

The old beta signing key was committed to the public repository and is retired.
Android will reject this APK as an in-place update of beta-1.2 or earlier with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. This is expected.

1. Export a JSON backup from **More → Settings**.
2. Uninstall Renewly once.
3. Install `renewly-beta-1.2-hotfix.apk`.
4. Restore the JSON backup.

New certificate SHA-256 fingerprint:

```text
33:8C:A3:F9:11:95:21:C8:3B:76:A1:75:0D:41:F5:90:E2:A3:7F:EF:6F:81:9A:C8:EC:34:56:88:A5:05:3D:E6
```

Verify the downloaded APK with:

```bash
apksigner verify --print-certs renewly-beta-1.2-hotfix.apk
sha256sum -c renewly-beta-1.2-hotfix.apk.sha256
```

## Security fixes

- **Signing key rotation.** The keystore and its passwords are removed from the
  repository. Release builds decode the new PKCS12 key from GitHub Actions
  secrets and sign only on `beta-*` tag pushes. Pull-request CI builds an
  unsigned debug APK and uploads no APK artifact.
- **CSV formula injection.** Text cells beginning with `=`, `+`, `-`, `@`, TAB,
  or CR are prefixed with an apostrophe before quoting. Amount cells stay
  numeric. This blocks spreadsheet formula execution from imported merchant and
  note text.
- **Import parser limits.** Import files are capped at 25 MB. SQLite record
  headers are validated, record serial types are bounded, overflow-page chains
  have a visited set and page cap, page sizes are validated, ZIP entry counts
  and decompressed bytes are capped, and PDF stream count/text size are capped.
  A crafted file can no longer loop the main thread or exhaust memory.
- **Workflow hardening.** Default workflow permission is `contents: read`;
  only the tag release job gets `contents: write`. Actions are pinned to commit
  SHAs, workflow files are linted with actionlint, and the current tree is
  scanned with gitleaks.

## Automation and testing

- Unit tests now run on **Vitest** with V8 coverage and enforced thresholds.
- A Husky `pre-commit` hook runs `npm run verify` (Vitest plus the local
  security check) before a commit is created.
- GitHub Actions on every pull request runs tests, coverage, npm audit,
  gitleaks, actionlint, Trivy, and CodeQL. The Android job builds an unsigned
  debug APK without release secrets.
- Main-branch protection requires the `test`, `security`, and `android` checks
  and a pull request before merge.
- A release tag runs the same gates, decodes the signing key from secrets,
  builds `assembleRelease`, verifies the signature with `apksigner`, writes a
  SHA-256 checksum, and publishes the APK.

## Verification

- `npm test`: 101 tests passing.
- `npm run test:coverage`: coverage thresholds pass.
- `npm run security:check`: no signing material, literal signing passwords, or
  dangerous workflow triggers.
- Browser smoke: CSV import, duplicate detection, breadcrumbs, widget route,
  offline shell, and CSV export neutralization.

## Install

Download `renewly-beta-1.2-hotfix.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Remember the one-time uninstall
and backup restore above.
