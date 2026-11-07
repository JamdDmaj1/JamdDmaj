# Public wallet preference and easier full close

Web 1.38.24: remember source/address only in browser storage. Restore only
when account/provider panels register that same identity. Never restore funds,
login, signing session or trading consent. An explicit current-page selection
wins over late startup registrations. Account-link session changes clear the
active identity but preserve the public preference; only a matching newly
validated account restores it. Explicit disconnection clears the preference.
Storage denial does not break use.

Full-close review now reads a fresh public Jupiter price rather than requiring
typing it; identity/revision are checked again after awaiting. Review and
unchecked consent remain separate from confirmation. No server executor or
financial policies changed; 0.5% protections retained. Full close has no UI PnL
gate; network/custody/pending/fee/price gates still apply. No unconditional
anytime-fill guarantee. No live position, signature, send or VPS change made.

Existing futures connector and official jup-ag CLI docs support BTC/ETH/SOL.
Other market listings are public information, not executable futures. Explain
this in Futures and Discover, not fabricate broader support. Partial close and
post-open TP/SL remain pending. Include prior locally tested compact position
layout, observed leverage badge and small-PnL precision improvement.

Tests: storage reload/order/blocked storage; desktop/mobile browser full close
with automatic reference, separate consent and mocked execution. Additional
native close/signing/intent suite: 88 tests, 87 passed, 1 skipped, 0 failed.
Discover HTML/en/es updated; CSS/tour reviewed unchanged. No APK built.

Publication verification pending.
