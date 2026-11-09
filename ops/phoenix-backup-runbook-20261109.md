# Phoenix entry backup: operator runbook

Phoenix entries stay closed until the custody registry holds a verified restore
proof whose scopes include the Phoenix state. That proof is produced by an
operator run, not by any screen in the app.

## What it does

1. Reuses or creates the operator age keypair in `<operatorDir>` (encryption
   keys only: no wallet, no seed, no address, no funds).
2. Encrypts the custody records plus the runtime databases (controls, journal,
   fees, payments, swaps, phoenix) into one archive.
3. Restores that archive into a throwaway directory to prove it works.
4. Registers the archive and accepts its restore proof in `backup.sqlite`.

## Command

Run from the release checkout, as the worker user, inside the worker mount
namespace so `/var/lib/private` resolves:

```
nsenter -t "$(systemctl show -p MainPID --value jamddmaj-perps-worker)" -m -- \
  setpriv --reuid=64438 --regid=64438 --clear-groups \
  node scripts/operator-phoenix-backup.mjs \
    /var/lib/private/jamddmaj-perps-runtime \
    /var/lib/private/jamddmaj-perps-runtime/operator-recovery
```

Without `--execute` it only runs the preflight and exits: use that first.

## What the run needs from this host

- `JAMDDMAJ_PERPS_CONTROLS_DIRECTORY` (currently
  `/var/lib/private/jamddmaj-perps-controls`): the control database does not live
  in the runtime directory, so pass it when running by hand.
- The recovery schema table in `lib/perps-runtime-recovery.js` must know the
  `swaps` and `phoenix` databases; without their hashes the snapshot refuses.
- A cancelled close must not keep an execution row. If an abandoned unsigned
  attempt is still stored, remove it after copying the journal. The strict
  validator stays strict on purpose.

## Expected output

```
{"stage":"PREFLIGHT",...}
{"stage":"OPERATOR_KEYS_READY","created":true,...}
{"stage":"ARCHIVE_CREATED","archiveSha256":"...","runtimeStateIncluded":true}
{"stage":"RESTORE_PROVEN","wallets":1,"runtimeStateIncluded":true}
{"stage":"ARCHIVE_REGISTERED",...}
{"stage":"BACKUP_VERIFIED","walletCount":1}
```

`BACKUP_VERIFIED` is the state the service needs. Then the entry flow accepts
`Revisar entrada` again and the ticket offers `Preparar cuenta`.

## Notes

- Back up `backup.sqlite` before the run; the registry is small and safe to copy.
- A failed run leaves at most a `PENDING` challenge row; it never touches funds.
- The archive and the restore proof are secrets: never paste their contents.
