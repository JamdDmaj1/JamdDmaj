# Beta perps integration investigation — not shipped

User approved 1% maximum tolerance for new Beta markets only and accepts absent
TP/SL. Existing BTC/ETH/SOL retain their 0.5% policy. This approval does not
authorize a trade, deposit, wallet migration or automatic execution.

Official sources checked 2026-11-07:
- https://docs.jup.ag/user-docs/trade/perps/beta-markets
- https://docs.gum.ag/llms.txt
- https://docs.gum.ag/perps/overview.md
- https://docs.gum.ag/perps/orders.md
- https://docs.gum.ag/trading-api/overview.md
- https://api.gum.ag/app/v1/openapi.json

Jupiter lists JUP/HYPE/ZEC and three stock-reference Beta markets, using GUM
order books rather than JLP. Different accounts, collateral and position rules
require a separate adapter and verified open/read/close/recovery support.

Verified GET of public OpenAPI 3.1.0 currently lists balances, chains, deposit
addresses/events, history, swaps and withdrawals. No paths for perps, positions,
orders, margin or funding were present. User documentation describes trading
but is not an integration contract. No verified public perps SDK or order/close
API was located in the checked official materials. This is a documentation /
integration blocker, not proof that no private or other public API exists.

Do not invent endpoints or reuse the JLP transaction decoder for GUM. Do not
mark assets executable merely because an external venue lists them. Need an
official integration contract/SDK or a separately approved alternative venue
before implementing live trading. No website release or financial code changed.
Discover HTML/JS/CSS/tour need no change for this internal-only investigation.

User also reported current full-close review returning controls-unavailable.
That is unresolved and separate from this Beta investigation. User explicitly
asked to continue the Beta task first. No close/retry/confirmation was performed.
