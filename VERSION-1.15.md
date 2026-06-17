# JamdDmaj AI v1.15.0

## Fixes

- Restores the Pro Signals layout style from the working 1.12 version: hero card with Scan/Back actions only.
- Moves manual crypto analysis into its own compact search bar below the hero so it no longer breaks the Pro screen on mobile.
- Adds a cached market-data fallback so SUI and other symbols can still generate an educational setup when live endpoints fail temporarily.
- Changes Learn reminders so Android notification blocking no longer feels like an app error. The reminder still works inside the app, and native notification is used only when Android allows it.

## Notes

- Pro Signals remains educational and does not execute orders.
- Learn native push notifications while the app is fully closed still require a future native scheduled-notification layer.
