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
