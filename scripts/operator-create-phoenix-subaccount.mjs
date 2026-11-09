// Operator action: create the isolated Phoenix subaccount for one market plan.
//
// Same service and journal as the app: one registration transaction, no wallet
// created, no deposit and no order.
import {join} from 'node:path'
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js'
import {openPerpsCustodyVault} from '../lib/perps-custody-vault.js'
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js'
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js'
import {openPhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js'
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js'
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js'
import {createPhoenixClient} from '@ellipsis-labs/rise'
import {createPhoenixPublicClient} from '../lib/phoenix-public-client.js'
import {createPhoenixManualService} from '../lib/phoenix-manual-service.js'

const runtime = process.argv[2]
const controlsDirectory = process.argv[3]
const rpcUrl = process.argv[4] || process.env.JAMDDMAJ_PERPS_RPC_URL
const ownerAccountHash = process.argv[5]
const walletAddress = process.argv[6]
const symbol = process.argv[7] || 'DOGE'
if (!runtime || !controlsDirectory || !rpcUrl || !ownerAccountHash || !walletAddress) {
  console.error('usage: node scripts/operator-create-phoenix-subaccount.mjs <runtime> <controlsDir> <rpcUrl> <ownerAccountHash> <wallet> [symbol]')
  process.exit(1)
}

const now = Date.now
const monotonicNow = () => performance.now()
const report = (stage, detail = {}) => console.log(JSON.stringify({stage, ...detail}))

const controls = openPerpsAutomationControls(join(controlsDirectory, 'controls.sqlite'), {
  now, monotonicNow, authorizeActivation: () => { throw Error('OPERATOR_SCRIPT_NO_ACTIVATION') },
})
const vault = openPerpsCustodyVault({directory: join(runtime, 'wallets'), keyFile: join(runtime, 'keys', 'master.key')})
const journal = openPerpsExecutionJournal(join(runtime, 'journal.sqlite'))
const swapJournal = openBotSwapJournal(join(runtime, 'swaps.sqlite'))
const phoenixJournal = openPhoenixExecutionJournal(join(runtime, 'phoenix.sqlite'))
const backupRegistry = openPerpsBackupRegistry(join(runtime, 'backup.sqlite'))
const rpcRequest = createServerPerpsReadOnlyRpc({url: rpcUrl, fetchImpl: fetch})
const phoenixClient = createPhoenixClient({phoenixEnv: 'prod', apiUrl: 'https://perp-api.phoenix.trade', rpcUrl, ws: false, exchangeMetadata: {stream: false}})
const phoenixPublicClient = createPhoenixPublicClient({now})

let sendId = 0
const sendRequest = async (method, params) => {
  if (method !== 'sendTransaction') throw Error('OPERATOR_SCRIPT_SEND_ONLY')
  const response = await fetch(rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: ++sendId, method, params})})
  const body = await response.json()
  if (body.error) throw Error('SEND_FAILED ' + JSON.stringify(body.error))
  return body.result
}

const assertUncontended = (who) => {
  const phoenix = phoenixJournal.pending(who.walletAddress).filter((row) => row.phase !== 'CHILD').length
  if (journal.pending(who.walletAddress).length || journal.pendingPositionCloses(who.walletAddress).length ||
      journal.pendingExitCancellations(who.walletAddress).length || journal.pendingPlatformFeePayments(who.walletAddress).length ||
      swapJournal.pending(who.walletAddress).length || phoenix) {
    throw Error('UNCONTENDED_FAILED')
  }
}

const service = createPhoenixManualService({
  controls, vault, journal: phoenixJournal, riskJournal: journal, swapJournal, backupRegistry,
  publicClient: phoenixPublicClient, client: phoenixClient,
  readExchangeKeys: async () => phoenixClient.api.exchange().getKeys(),
  rpcRequest, sendRequest, assertUncontended, isRunning: () => true, now, monotonicNow,
})

const who = {ownerAccountHash, walletAddress}
report('STATUS', await service.status(who))

const created = await service.setupAccount({ownerAccountHash, walletAddress, symbol, side: 'LONG',
  marginUsdcUnits: '10000000', leverageTenths: 30, explicitApproval: true})
report('CREATED', {id: created.id, subaccountIndex: created.subaccountIndex, trader: created.traderAddress, signature: created.signature, state: created.state})

let current = created
for (let attempt = 0; attempt < 20; attempt += 1) {
  if (current.state === 'FINALIZED' || current.state === 'CANCELLED') break
  await new Promise((resolve) => setTimeout(resolve, 3000))
  current = await service.recoverChildSetup({ownerAccountHash, walletAddress, id: created.id})
  report('RECOVER', {state: current.state})
}

const account = await service.status(who)
report('FINAL', {state: current.state, entryAvailable: account.entryAvailable})

for (const store of [phoenixJournal, swapJournal, journal, controls, backupRegistry]) {
  try { store.close() } catch {}
}
