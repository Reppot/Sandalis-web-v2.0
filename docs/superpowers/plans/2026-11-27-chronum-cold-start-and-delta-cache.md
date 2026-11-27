# Chronum cold-start and update-cache plan

## Goal

Make the desktop client tolerate Render's free-service wake-up, correlate client/API requests safely, and preserve one verified installer base so later NSIS updates can stay differential. Surface the weak production JWT configuration without breaking the live service before its secret is rotated.

## Work

1. Raise cold-start-sensitive API timeouts, retry only safe transient reads, prevent overlapping profile checks, and retry Discord login navigation after transport resets.
2. Send a validated request ID through the desktop API proxy and log the ID, status, duration, and credential-presence booleans on the backend without logging secrets.
3. Cache one current NSIS installer plus its blockmap in electron-updater's expected cache directory, clean completed pending downloads after an updated app restarts, and remove the cache on a real uninstall.
4. Warn clearly at backend startup when the production HMAC key is shorter than 32 bytes. Rotate the Render secret separately because it invalidates existing sessions and requires Render dashboard access.
5. Build Chronum 0.1.42, inspect the release outputs, and publish one offline installer with updater sidecars.

## Constraints

- Keep the single-file manual installer and ten installer locales.
- Keep the initial update from 0.1.41 allowed to fall back to the full installer; 0.1.41 did not cache its base installer. 0.1.42 seeds the base for subsequent differential updates.
- Keep one base installer in `%LOCALAPPDATA%` (replaced on updates, removed on uninstall); clear only the transient `pending` update directory after a successful update restart.
- Do not print or commit secrets; do not run the test suite unless explicitly requested.

## Verification

- Build the desktop renderer and Windows NSIS installer.
- Inspect the installer, `latest.yml`, `.blockmap`, and package version.
- Review the final Git diff and leave unrelated workspace files untouched.
