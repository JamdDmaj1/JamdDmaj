# JamdDmaj AI v1.37.15

- Fixed executor retry behavior so skipped open signals are not blocked forever as already seen.
- Added a retry cooldown for skipped signals instead of permanently burning them.
- The executor now counts live orders opened during the same run when enforcing max open positions.
- Telegram protection events now deduplicate SECURE and PROFIT_LOCKED for the same signal to avoid repeated protection messages.
- Manual Bitget closes now clear the executor seen marker so the bot can take the next valid setup.
