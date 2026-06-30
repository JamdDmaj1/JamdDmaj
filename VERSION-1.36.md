# JamdDmaj AI v1.36

## Pro Observability

- Owner Pro panel now shows executor health: mode, executable signal count, rejections, Bitget sync and recent dry-run/live actions.
- VPS executor reports decision summaries, rejection reasons, recent orders and exit-manager readiness in every heartbeat.
- Dry-run summaries can be sent to Telegram with throttling so idle cycles do not spam the channel.

## Exit Manager Prep

- Executor order records now include entry, TP1, suggested invalidation and an exit-plan readiness flag.
- Live position reconciliation remains active before new orders.
- Full automatic close management remains guarded; live entries still require explicit VPS live configuration.

## Client Demo

- Paper simulation controls are available in the Pro panel for local demo use while owner-only server controls remain protected.
