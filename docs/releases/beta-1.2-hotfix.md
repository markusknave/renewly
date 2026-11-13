# Renewly beta-1.2-hotfix

This is the security hotfix for the beta-1.2 audit. It rotates the APK signing
key, fixes CSV formula injection, and bounds the import parsers.

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
  repository. Release builds use the new PKCS12 key and sign only tagged
  releases.
- **CSV formula injection.** Text cells beginning with `=`, `+`, `-`, `@`, TAB,
  or CR are prefixed with an apostrophe before quoting. Amount cells stay
  numeric. This blocks spreadsheet formula execution from imported merchant and
  note text.
- **Import parser limits.** Import files are capped at 25 MB. SQLite record
  headers are validated, record serial types are bounded, overflow-page chains
  have a visited set and page cap, page sizes are validated, ZIP entry counts
  and decompressed bytes are capped, and PDF stream count/text size are capped.
  A crafted file can no longer loop the main thread or exhaust memory.

## Install

Download `renewly-beta-1.2-hotfix.apk`, tap it on the phone, and allow **Install
unknown apps** for the browser or file manager. Remember the one-time uninstall
and backup restore above.
