# JamdDmaj AI v1.35

## Pro Live Safety

- Owner Pro panel adds a live pause switch for the VPS executor.
- VPS executor sends heartbeat/status to `/api/pro-executor`.
- Server config now carries daily loss, daily trade and consecutive-loss limits.
- Bitget live entries include preset TP1 and suggested invalidation when supported by Bitget.
- The executor reconciles open Bitget positions before opening another live order.

## Pro Demo

- Non-owner Pro users can start/reset local paper simulation from the app.
- The 7-tap private device code is blocked unless the owner device is already authorized.

## Market Context

- Pro news now includes market regime, trending tokens, catalyst groups and headline impact labels.
