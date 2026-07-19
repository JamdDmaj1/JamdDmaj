# JamdDmaj AI v1.37.26

- Added a private VPS option for owner accounts: `JAMDDMAJ_EXIT_CLOSE_AT_ROE`.
- When configured, the Bitget exit manager closes the full live position once the trade reaches the configured ROE target.
- Left the default client behavior unchanged; clients keep the existing protection/lock workflow unless this option is explicitly enabled.
