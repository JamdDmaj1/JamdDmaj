# Notification settings visibility

Adds a device-specific status badge, saved signal preference and price-alert
details, last-save and expiry times, read-only refresh, pending-edit notice and
separate renewal/save labels. A price-push opt-out is independent of Telegram
signal selection. Existing registration is read on entry without permission
requests, registration writes or automatic changes to the user's preferences.

Enrollment remains 30 days from saving. Displayed activation describes saved
enrollment, not proof that a real signal reached the device. Blocked browser
permission is shown separately. No trading or bot activation changes.

GET status is authenticated and account/device-scoped. It exposes only the
user's saved preferences and timestamps, never the FCM delivery target.

Unit tests and a real Edge browser with synthetic data verified status, saved
signal/count details, expiry, unsaved changes and read-only refresh. Web build
passed. Discover HTML/JS updated; CSS and tour CSS reviewed, no layout change
needed for this settings update. Android APK publication is not claimed here.
