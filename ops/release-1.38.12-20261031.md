# 1.38.12 — delayed closed-app test

Follows the 1.38.11 implementation with a test notice scheduled at least fifteen
seconds ahead, dispatched by the minute worker. This lets users close the app
before the notice is delivered. The UI says scheduled, not received or delivered.
Scheduled tests are rate-limited and expire after three minutes if not processed.
No wallet actions. Includes the notification and UX batch documented in 1.38.11.
Discover HTML cache key updated; JS instructions and existing responsive/reduced-
motion CSS reviewed and retained. Final publication receipts pending below.
