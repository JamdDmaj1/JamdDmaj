# JamdDmaj AI v1.24.0

Owner security, Android updates, and account foundation.

- Telegram controls are hidden unless Vercel confirms the current device is the configured owner device.
- Unauthorized client devices cannot test, enable, or manually send Telegram alerts.
- Android GitHub Actions now builds a permanently signed release APK.
- Added a Windows helper to generate the permanent Android signing key and GitHub secrets.
- Added Account and progress settings powered by the encrypted JamdDmaj Sync ID.
- Added Prepare update to sync progress and copy the Sync ID before the one-time debug-to-release transition.
- Encrypted backups now retain the private device ID used to authorize owner-only Telegram controls.
- Added placeholders for future Google, X, and Telegram account linking without pretending those OAuth providers are configured yet.

The first switch from the old debug APK to the new signed release APK requires one final uninstall. Future APKs signed with the same key can install over the existing app without deleting local data.
