# JamdDmaj AI v1.22.0

Hidden Pro Signals Telegram update.

- Added secure Telegram alerts through a Vercel server endpoint.
- Bot token and chat ID stay private in Vercel and are never bundled into the APK.
- Added owner-device authorization for Telegram sending.
- Added Pro-mode controls to copy the device ID, test Telegram, and enable/disable alerts.
- Sends up to three new A/B scanner calls automatically while the Pro scanner is active.
- Added server-side duplicate protection so the same symbol/direction is not sent every minute.
- Resolved leftover Git conflict markers from the v1.20/v1.21 rebase.

Required Vercel variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `JAMDDMAJ_TELEGRAM_DEVICE_ID`

Educational alerts only. The app does not execute orders.
