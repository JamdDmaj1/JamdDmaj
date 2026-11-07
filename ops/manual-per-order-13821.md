# Explicit manual per-order mode

Requested: remove mandatory personal risk-cap configuration for user-confirmed
manual orders, fix unsuccessful/unclear saves, preserve automation settings.

New exact persisted policy `{mode:'perOrder'}` requires an explicit owner-scoped,
revision-bound save. Existing legacy policies are not auto-migrated. UI exposes
one deliberate per-order-mode acceptance for the selected bot wallet; advanced
caps remain optional. No order or automation activation is authorized by saving.

Journal permits this policy only for `manual:<same reservation ID>`. The four
personal caps are not applied for this explicit mode. Automated and external-web
namespaces cannot use it. Actual funds/fee holds, stale/foreign/partial evidence,
pending reconciliation, ownership, paused automation, backups, one-use signatures,
the exact 50-bps bound and all send/recovery gates remain enforced. Existing
automation and capped-manual tests remain in place. No database schema change.

Saving fixes: validate before discarding the known revision; display a specific
non-save reason; do not silently overwrite unsaved edits during automatic order
preparation; clear consent after edits; render the checkbox at its native size.
An explicit user read can discard edits. Lost saves still require a fresh read.

Focused policy/journal/API/panel tests passed (22). Per-order opening native
fixture authorization/send-once test passed. BTC/ETH/SOL protected conversion ->
opening native fixture flows passed (3); all sends/network/signing use fixtures,
never funded user identities. Compiled actual browser panel passed desktop and
mobile, with mocked financial dependencies, and opening/close consent diagnostic
passed. Full suite is running; do not publish until its result is verified.

Discover HTML and English/Spanish copy updated with explicit acceptance, optional
caps, full-margin loss, independent automation, separate Long approvals and no
automatic replay. Existing responsive CSS/tour reviewed and retained. No claim
of actual funded execution. Version 1.38.21 is web/source only; APK feed remains
the highest actually published release (1.38.17).

Installer uses exact old/new worker and web hashes, exclusive binary backups,
paused/empty financial-state guards, policy-row equality checks and all-unit
health checks. It never modifies policies/controls/database/schema or restores
a stale database. Do not invoke while a user has a pending financial operation.

Full suite completed: 1469 tests, 1449 passed, 20 skipped, zero failures. Three
additional BTC/ETH/SOL per-order conversion/opening fixture cases passed after
their addition, plus the specific per-order signing test. Subsequent heading and
release-copy edits passed panel/Discover checks and compiled desktop/mobile QA.

First staged production candidate dpl_9K2fwENe4X4hg9KB1HjTVnUoDQ4N failed the
build because the secret-free source exporter omitted robots.txt (ENOENT). It
was not promoted and the public site/server were not changed. Corrected the
exporter to include public TXT/XML build inputs in a new exclusive r2 directory.

## Publication verified

R2 source 1a2ad81fef5d72362e29e990eaff91e1e81ae119 (financial source e1f56a0)
exported 466 committed allowlisted inputs, built successfully in the isolated
snapshot, then reached READY production deployment
dpl_DEJPgojE4YsT4acCuf2q18T3f5D8. Authenticated protected-candidate checks verified
1.38.21 status, actual compiled policy JS and Discover before promotion.

Exact guarded server installation succeeded for both worker and web binaries;
all services independently healthy, stored policies/controls/schema unchanged,
financialSends=0. Preserved old binaries privately. No user mode was enabled by
the operator. Public trusted health succeeded; unauthenticated automation POST
still returns 401.

Promoted that same tested production deployment without rebuilding. Public
www.jamddmaj.com /api/status reports webVersion 1.38.21, latest APK 1.38.17.
Main HTML, compiled policy JS and canonical Discover independently verified.
No real user trade/signature/transfer/bot activation performed by the agent.
The user must explicitly choose the per-order mode once in the new interface;
until then the existing saved personal caps remain unchanged and enforced.
