# JamdDmaj AI v1.37.21

- Added a live-entry freshness gate so the VPS will not open stale queued signals after a Bitget slot becomes free.
- Signals older than 30 minutes, or past their own expiration time, are rejected instead of executed.
- Added `JAMDDMAJ_MAX_EXECUTION_SIGNAL_AGE_MINUTES` to the VPS/client connector setup so fresh-only execution is automatic.
- Restored a bounded retry window for skipped signals so old rejections do not linger forever.
