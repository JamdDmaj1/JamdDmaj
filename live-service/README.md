# JamdDmaj Live — multi-user exchange execution

Status: implementation in progress. This service is the isolated, multi-tenant
execution layer for JamdDmaj Live. It is separate from the existing single-owner
Bitget executor in `/opt/jamddmaj-scanner`.

## Non-negotiable safety rules

- Exchange API keys are accepted only for **read + trade**. The product never
  asks for withdrawal permission and cannot withdraw funds.
- Keys are encrypted with AES-256-GCM before storage. The master key never
  enters git, the browser, or logs.
- Every API request is authenticated with the existing JamdDmaj opaque session
  token through `https://www.jamddmaj.com/api/perps-identity`.
- One user can never read or mutate another user's connection, config,
  positions, orders, or share records.
- Live trading requires explicit risk consent. New connections start paused.
- Public launch requires a security review and legal review for the countries
  where the product is offered. This service ships behind a beta gate until
  those reviews are complete.

## Service layout

```
live-service/
  src/config.mjs       environment and master-key loading
  src/vault.mjs        authenticated encryption for exchange credentials
  src/store.mjs        SQLite schema and per-account queries
  src/auth.mjs         session-token verification and short cache
  src/adapters/ccxt.mjs exchange adapter interface
  src/server.mjs       authenticated HTTP API
  src/engine.mjs       signal execution and position reconciliation
  test/                unit tests
```

## API outline

Authenticated with `Authorization: Bearer <JamdDmaj session token>`:

- `GET  /live/me`
- `GET  /live/exchanges`
- `POST /live/connect`
- `GET  /live/status`
- `POST /live/connections/:id/refresh`
- `POST /live/connections/:id/config`
- `POST /live/connections/:id/live`
- `POST /live/connections/:id/delete`
- `POST /live/positions/:id/share`
- `GET  /live/share/:token` (public, explicit consent only)

## Data isolation

The account hash returned by the identity endpoint is the tenant key. Every
query includes it. Connection identifiers are random UUIDs, and the encryption
AAD binds ciphertext to `accountHash|connectionId|exchange`.

## Execution model

The engine consumes the same scanner/Telegram signal feed used by the owner
executor. It does not invent signals. For every active connection it:

1. checks the user's margin, leverage, max-open, protection and daily limits;
2. rejects stale, ineligible, unsupported or duplicate signals;
3. sizes the order from the user's margin and leverage;
4. submits an idempotent client order id to the exchange;
5. stores the exchange order/position and reconciles it on later cycles.

Bitget is the first adapter because it is already validated in production.
Binance, Bybit, OKX, KuCoin, Gate and MEXC use CCXT's unified futures API. An
exchange is shown only when its adapter and market metadata are verified.

## Emergency controls

- Per-user: turn live off in `live.html`; the engine stops opening new trades for
  that connection.
- Global: run `live-service/deploy/kill-switch.sh` as root. This leaves the API
  and position dashboard online but stops the execution engine.
- Resume only after reviewing: `live-service/deploy/resume-engine.sh`.

## Exchange verification

Only exchanges listed in `JAMDDMAJ_LIVE_VERIFIED_EXCHANGES` can turn real live
trading on. The default is `bitget`. After an exchange has been tested with a
dedicated account, add it to this comma-separated environment variable and
restart the service. Unverified exchanges remain available for read-only
connection and balance checks.

