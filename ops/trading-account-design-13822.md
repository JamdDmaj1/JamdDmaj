# Trading account visual refresh — 1.38.22

User requested a clearer presentation after their real position appeared.
Web/display only: no signing, RPC transport, executor, journal, risk policy,
close behavior, balance calculation, server deployment/restart or trade action.
The existing live position must not be touched by verification or deployment.

Account header, three separate metric cards, read-only availability explanation,
position cards with side badge/exposure/collateral and expandable exact values.
No invented PnL, liquidation, leverage or price. Unknown/stale information stays
unknown; cards disappear when the verified snapshot expires. Full recent-activity
signatures remain expandable. Refresh dispatches only the existing refresh event.
User-collapsed position sections stay collapsed after refresh. Initially observed
positions are expanded once per selected account. The disabled Phantom-only close
panel is visually hidden for watch/bot accounts, not replaced with a financial
action. Actual bot close controls remain untouched in their existing panel.

Scoped stylesheet loads once per document, copied by the web build. Two-column
mobile metrics with full-width availability; desktop three-column metrics.
The redundant status card is condensed into a small integrity note. No new API.

18 tests passed across wallet-trading-state, terminal navigation, Discover and
actual published APK selection. Actual compiled panel/browser/CSS QA passed at
1280px and 390px with fixture data and blocked external network: side badge,
unknown availability, no overflow, preserved collapsed state, stale snapshots,
refresh-only event and no financial calls. Desktop/mobile renders inspected.
This is not a live-wallet end-to-end execution test. Full financial suite was
not rerun because financial code is unchanged from the tested prior release.

Discover HTML and English/Spanish fallback copy explain the separated display
and no invented missing values. Discover CSS/tour reviewed: existing responsive,
reduced-motion and navigation behavior retained. Web/source version 1.38.22;
highest actually published Android APK remains 1.38.17. No APK is claimed built.

Published from committed source b1579b1ab94d51d1bfe355501dcd2017b40489a9.
Clean source snapshot (468 tracked allowlisted inputs) built 32 web assets, with
the intended Vercel team/project independently verified. Staged production
dpl_6uCYC4mL8jJh2pWd1ViHoLtN3yTG reached READY. Protected-candidate status,
stylesheet, actual panel JavaScript and Discover matched the local build before
promotion. Promoted that same deployment without rebuilding.

Public www.jamddmaj.com status reports webVersion 1.38.22, latest APK 1.38.17.
Public CSS/panel JS/canonical Discover match the verified build (LF-normalized).
Bounded ten-minute deployment error scan returned zero records. No ongoing
monitoring was created. No VPS commands, service restarts, wallet sessions,
transaction signatures, financial submissions or live-position changes occurred.
