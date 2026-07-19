# JamdDmaj AI v1.37.16

- Fixed stale ordered markers so old orders no longer block automatic Bitget entries after the real Bitget position is closed.
- The executor now compares seen orders against live Bitget symbols before rejecting a signal as already ordered.
- Closed or manually removed positions clear their seen marker during reconciliation.
- Skipped signal retry cooldown now defaults to 5 minutes for faster automatic recovery.
