# Operator-authorized execution availability — 2026-10-24

The owner explicitly requested enabling execution after publication of 1.38.1.
This supersedes the disabled-platform state recorded in the release report; it
does not turn the owner's paused automation account into an active one.

## Changed configuration

- `/etc/systemd/system/jamddmaj-perps-worker.service.d/40-execution.conf`:
  worker mode `execute`, explicit execution approval `true`.
- `/etc/systemd/system/jamddmaj-perps-web.service.d/40-execution.conf`:
  manual web execution approval `true`.
- Existing account authentication, separate manual policy limits, explicit
  wallet signatures, backup verification, daily risk gates, original journals,
  private permissions and recovery rules remain unchanged. No control row was
  activated, saved, edited or reset through SQL or an impersonated session.
- All three services were restarted/drained as required by their dependencies
  and are active. No error-level worker/manual-service entries in the bounded
  post-change scan.

## Read-only evidence

- Public health: HTTP 200, `mode:execute`, `executionAvailable:true`.
  `tradingEnabled:false` is retained by this global capability response; it
  never promises that an individual account is enabled.
- Actual worker cycle: `WORKER_CYCLE_COMPLETE`, mode `execute`, one account
  checked, result `AUTOMATION_INACTIVE:1`.
- Exact controls, risk, web submission and manual-policy checksums remain the
  same as the 1.38.1 release report. Active automation accounts: zero.
- Existing bot custody backup attestation is ACCEPTED. Only public wallet
  balance RPC calls were made: its exclusive wallet has zero payer lamports
  and zero USDC units at the time of inspection.
- Manual policy rows: zero. Each selected wallet still requires its own
  authenticated manual limits and owner approval before an order can proceed.
- Existing configured signal-feed access was checked in an isolated temporary
  service using its existing credential without printing or copying it. Feed
  validation succeeded, remote pause false, zero eligible candidates; five
  unsupported markets were rejected. No publication or trading endpoint was
  invoked by this check. Supported bot markets remain BTC/ETH/SOL only.

## Owner choices still required

The stored 50/30/1/10/3/5 values were previously described as trial numbers.
On being asked to confirm them for real use, the owner requested customizable
settings rather than accepting those amounts. They remain editable in the app;
this operation did not treat them as fresh financial consent or raise limits.

The bot account therefore stays paused pending the owner's actual settings,
assigned capital and authenticated review/activation. The dedicated wallet is
separate from main/native/Phantom balances; no funds were assigned or moved.
Manual transactions still require the selected owner's wallet signature.

Reverting platform availability means removing only these two reviewed drop-ins
and restarting the services in dependency order. It never means rolling back or
deleting financial journals, bypassing pending records or enabling legacy Bitget.
