# Send sizing controls — verified locally, publication pending

Observed token balance existed but percentage controls required signing
availability. That incorrectly prevented display-only sizing for disconnected
Phantom/watch/native contexts. Now controls require a fresh matching portfolio,
valid quantity/precision and no busy operation, not signing capability.

Added explicitly estimated available quantity, synchronized 0–100 range/output,
existing percentage buttons and text entry. Native SOL sizing retains provisional
0.005 SOL reserve. Invalid/unsafe/stale quantities disable automatic sizing with
an explanation rather than guessing precision. Review still requires signing
availability; confirmation, journal, consent, funding and fee checks unchanged.
Freshness rechecked each second while open; no funds moved or signatures requested.

Unit test covers user's 805977.175052 quantity at 50%, arbitrary 37%, bounds,
rounding down and SOL reserve. Browser mocked portfolio verifies disconnected
Phantom can choose percentage/range while Review send stays disabled. Web build
passed. Discover HTML/JS/CSS/tour CSS reviewed: existing wallet send description
remains accurate, no new public capability or authorization claim warranted.
