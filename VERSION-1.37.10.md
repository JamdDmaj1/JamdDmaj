# JamdDmaj AI v1.37.10

- Fixed live Bitget daily trade policy so the app's "Trades max. por dia" value is respected.
- Auto risk still calculates account-aware margin and open-position limits, but no longer silently caps daily trades by equity.
- This prevents the VPS from staying blocked on "daily trade limit" when the app is configured for one trade at a time with a higher daily allowance.