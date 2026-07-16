# JamdDmaj AI v1.37.0

Pro executor visibility and manual Bitget test.

- Adds an owner-only "Test Bitget" button in Pro.
- Queues a small manual executor test from the best currently open Pro call.
- Adds a private executor-test endpoint for the VPS to pick up and consume the pending test.
- Updates the VPS executor to merge manual tests into its next cycle while keeping risk limits active.
- Shows pending Bitget tests and clearer executor rejection context in the Pro panel.
- Keeps the APK version at 1.36.7; this is a server/VPS script upgrade.
