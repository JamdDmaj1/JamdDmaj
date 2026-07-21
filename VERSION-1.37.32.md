# JamdDmaj AI v1.37.32

## Daily SL and loss learning

- Sends recent scanner outcome events from the VPS to the executor learning endpoint.
- Tracks daily wins, losses, SL/invalidation losses, reversal losses, and profit givebacks without double counting repeated VPS cycles.
- Adds loss reasons and loss examples to the pinned Bitget daily learning report.
- Uses those outcomes in AI self-improvement requests, so the report can ask for better trend, volume, entry drift, or momentum reversal checks after losing trades.
- Keeps current entry, risk, and exit execution behavior unchanged.
