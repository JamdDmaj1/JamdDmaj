# Manual web boundary — 2026-10-23

Scope: production wiring, not live financial activation. Bot execution remains
maintenance-only; manual web execution remains `false`. Android publication and
funded user acceptance are not covered by this checkpoint.

## Installed boundary

- `jamddmaj-perps-web.service`: loopback `127.0.0.1:8789`, shared private
  controls/risk journals, dedicated permanent web submission and policy stores.
- Fixed HTTPS paths: `/api/perps-manual-policy`, `/api/perps-signing-review`,
  `/api/perps-submit`, `/api/perps-operation-status`.
- The public web relays only to the operator-approved fixed TLS server. It does
  not select destinations from request data, forward cookies or open SQLite.
- Manual limits are authenticated account + selected wallet scoped. No bot
  settings, bot funds or default approval are inherited.
- Unsigned reviews are account-bound and expire. Signed/uncertain submission
  records never expire or become automatically retryable.
- Real entry preparation/submission is gated off. The service loads no custody
  seed or server signer. Fixture signing/sends are not financial acceptance.

## Preserved state

Existing controls/risk schemas were inspected before opening. Three new empty
stores were explicitly initialized, without migrations or replacement:
`web-submissions.sqlite`, `manual-policy.sqlite`, `web-reviews.sqlite`.
The initialization audit marker is retained; initialization refuses to overwrite
existing or partially initialized state.

A drained five-database checkpoint (controls, shared risk, permanent web
submissions, manual policy/audit, unsigned cache) was encrypted to the existing
operator public recovery recipient. Private recovery identity remained on the PC.

- Archive SHA-256:
  `1809bc111bfb18caab19cb6e14d5ce9c57e62db0aaaa4816358c0a4afefe4103`
- VPS private rollback directory:
  `/var/lib/private/jamddmaj-perps-runtime/manual-checkpoint-20261023`
- PC encrypted archive:
  `C:/Users/JamdDmaj/AppData/Local/JamdDmaj-Recovery/manual-production-20261023/manual-runtime.age`
- Offline restore verified in new `restored-QUARANTINED`, including integrity,
  foreign keys and exact database bytes/checksums. Never auto-activate a restore.

This additive archive has **no custody keys**. Keep the prior verified encrypted
custody recovery archive as well. Neither replaces the other. Neither authorizes
overwriting newer financial facts. Before future live activation, establish a
fresh complete stopped-state checkpoint and exercise recovery with pending work.

## Rollback constraints

Previous TLS configuration is preserved at
`/opt/jamddmaj-perps/checks/manual-web-20261023/previous-Caddyfile`.
Disabling the new service/routes does not erase its databases. Never roll back
financial journals to an older snapshot after a signature/submission. Reconcile
the latest permanent records before choosing compatible binaries/state.

Linux isolated tests verified the composed disabled service and encrypted
checkpoint/restore with no network or funded keys. Public release verification
must distinguish unauthenticated 401 checks from an actual user's authenticated
policy read. A public route response alone does not prove funded trading works.
