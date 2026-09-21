# Manual entry source update — prepared, not deployed

This change adds `JAMDDMAJ_ENTRY_SOURCE=manual-only` to the existing executor.
It does not add a real trading terminal, withdrawals, deposits, or change the
global `livePaused` control. The default remains `all` for compatibility.

## Verified server baseline

The user's server file, with Linux LF line endings, has SHA256:
`ca5eb4d02833bd3dc2c7c6ab4e73f93ad4c332c8f9ff5711c86f0cf951f13be2`.
This matches the original local file after CRLF normalization.

## Behavior

- Source filtering occurs before ranking and per-cycle capacity selection.
- Only entries from the executor's manual queue, with both internal manual
  markers, pass in manual-only mode. Markers are not authentication; the queue
  still relies on the existing server authentication.
- Invalid source configuration rejects every new entry.
- Global pause, exit safety, daily risk checks and exchange checks remain intact.
- Existing exit management can run while new entries are paused.

## Deployment prerequisites

The remote console is not accessible to the agent. No VPS files were changed.
Before installing, obtain authenticated server access, verify the baseline hash,
back up the executor, and check the effective configuration without printing
credentials. Install the validated file atomically and configure manual-only.
Do not unpause trading as part of installation. Verify the installed checksum,
syntax, effective source mode and heartbeat. Preserve `.env`, state and existing
exit management. Keep the backup for rollback.

Before any later live activation, inspect and clear or expire old manual intents
with the user's authorization. Validate queue authentication, freshness and
idempotency and an end-to-end non-financial test. Four source-filter unit tests
alone do not establish live trading readiness.
