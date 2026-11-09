// Operator runbook for the custody backup that Phoenix entries require.
//
// It creates NO wallet. It only reads the vault, writes one encrypted archive,
// restores it into a throwaway directory to prove it works, and records that
// proof in the backup registry. Run it with --execute to actually write.
//
// Usage:
//   node scripts/operator-phoenix-backup.mjs <runtimeDir> <operatorDir> [--execute]
import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {
  initializePerpsOperatorRecovery,
  createPerpsCustodyRecoveryArchive,
  restorePerpsCustodyRecoveryArchive,
} from '../lib/perps-custody-recovery.js'
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js'

const [, , runtimeArg, operatorArg, mode] = process.argv
if (!runtimeArg || !operatorArg) {
  console.error('usage: node scripts/operator-phoenix-backup.mjs <runtimeDir> <operatorDir> [--execute]')
  process.exit(1)
}
const runtime = resolve(runtimeArg)
const operator = resolve(operatorArg)
const execute = mode === '--execute'

// The worker keeps its control state outside the runtime directory (see
// JAMDDMAJ_PERPS_CONTROLS_DIRECTORY), so read that layout instead of guessing.
const controlsDirectory = process.env.JAMDDMAJ_PERPS_CONTROLS_DIRECTORY || runtime
const files = {
  controlsPath: join(controlsDirectory, 'controls.sqlite'),
  journalPath: join(runtime, 'journal.sqlite'),
  feesPath: join(runtime, 'fees.sqlite'),
  paymentsPath: join(runtime, 'payments.sqlite'),
  swapsPath: join(runtime, 'swaps.sqlite'),
  phoenixPath: join(runtime, 'phoenix.sqlite'),
}
const vaultDirectory = join(runtime, 'wallets')
const keyFile = join(runtime, 'keys', 'master.key')
const registryPath = join(runtime, 'backup.sqlite')

const missing = [...Object.values(files), keyFile, vaultDirectory].filter((path) => !existsSync(path))
if (missing.length) {
  console.error('missing required state:\n  ' + missing.join('\n  '))
  process.exit(1)
}

const report = (stage, detail = {}) => console.log(JSON.stringify({stage, ...detail}))

report('PREFLIGHT', {
  runtime,
  operator,
  execute,
  vaultDirectory,
  databases: Object.values(files).length,
})

if (!execute) {
  report('DRY_RUN_COMPLETE', {next: 'run again with --execute to create, prove and register the backup'})
  process.exit(0)
}

const keys = await initializePerpsOperatorRecovery({directory: operator})
report('OPERATOR_KEYS_READY', {created: keys.created, recipient: keys.recipient})

// The snapshot helper refuses a temporary parent that is not an existing private
// directory, so create it first with the right mode.
const temporaryDirectory = join(runtime, 'tmp-backup')
mkdirSync(temporaryDirectory, {recursive: true, mode: 0o700})

const archive = await createPerpsCustodyRecoveryArchive({
  directory: vaultDirectory,
  keyFile,
  recipient: keys.recipient,
  explicitOperatorApproval: true,
  requireRestoreProof: true,
  runtimePaths: {...files, temporaryDirectory},
})
report('ARCHIVE_CREATED', {
  archiveSha256: archive.sha256,
  walletCount: archive.walletCount,
  runtimeStateIncluded: archive.runtimeStateIncluded,
})

const scratch = mkdtempSync(join(tmpdir(), 'jamd-restore-proof-'))
try {
  const restored = await restorePerpsCustodyRecoveryArchive({
    ciphertext: Buffer.from(archive.ciphertext),
    operatorDirectory: operator,
    destinationDirectory: join(scratch, 'restore'),
    explicitOperatorApproval: true,
  })
  report('RESTORE_PROVEN', {
    archiveSha256: restored.archiveSha256,
    wallets: restored.walletAddresses.length,
    runtimeStateIncluded: restored.runtimeStateIncluded,
  })

  const registry = openPerpsBackupRegistry(registryPath, {allowNonPosixForTests: false})
  try {
    const registered = await registry.registerArchive(archive, {explicitOperatorApproval: true})
    report('ARCHIVE_REGISTERED', {stage: registered.stage, archiveSha256: registered.archiveSha256})
    const accepted = registry.acceptRestoreProof({
      proofFile: restored.proofFile,
      expectedArchiveSha256: archive.sha256,
      explicitOperatorApproval: true,
    })
    report('BACKUP_VERIFIED', {stage: accepted.stage, walletCount: accepted.walletCount})
  } finally {
    registry.close()
  }
} finally {
  rmSync(scratch, {recursive: true, force: true})
}
