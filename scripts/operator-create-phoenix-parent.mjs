// Operator action: create the Phoenix parent account for one wallet.
//
// It uses the same service, journal and vault path as the app, so the result is
// identical to the owner pressing the button. It signs and sends exactly one
// registration transaction; it creates no wallet and touches no funds beyond
// rent and the network fee.
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
import {preparePhoenixOrderReview} from '../lib/phoenix-order-review.js'
import {readPhoenixNativeMarket} from '../lib/phoenix-native-market.js'
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js'
import {preparePhoenixParentOnboarding, simulatePhoenixParentOnboarding} from '../lib/phoenix-parent-onboarding.js'
import {createPhoenixParentService} from '../lib/phoenix-parent-service.js'

const runtime = process.argv[2]
const controlsDirectory = process.argv[3]
const rpcUrl = process.argv[4] || process.env.JAMDDMAJ_PERPS_RPC_URL
const ownerAccountHash = process.argv[5]
const walletAddress = process.argv[6]
const symbol = process.argv[7] || 'DOGE'
if (!runtime || !controlsDirectory || !rpcUrl || !ownerAccountHash || !walletAddress) {
  console.error('usage: node scripts/operator-create-phoenix-parent.mjs <runtime> <controlsDir> <rpcUrl> <ownerAccountHash> <wallet> [symbol]')
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

const assertUncontended = (who) => {
  if (journal.pending(who.walletAddress).length || journal.pendingPositionCloses(who.walletAddress).length ||
      journal.pendingExitCancellations(who.walletAddress).length || journal.pendingPlatformFeePayments(who.walletAddress).length ||
      swapJournal.pending(who.walletAddress).length || phoenixJournal.pending(who.walletAddress).length) {
    throw Error('UNCONTENDED_FAILED')
  }
}

const prepareNative = async ({walletAddress: wallet, symbol: market}) => {
  const review = await preparePhoenixOrderReview({walletAddress: wallet, symbol: market, side: 'LONG', marginUsdcUnits: '10000000', leverageTenths: 30,
    isolatedSubaccountIndex: 1, clientOrderId: String(Math.floor(Date.now() / 1000))},
    {publicClient: phoenixPublicClient, readSlot: () => rpcRequest('getSlot', [{commitment: 'confirmed'}]), now})
  const native = await readPhoenixNativeMarket(review.plan, {exchangeKeys: await phoenixClient.api.exchange().getKeys(), request: rpcRequest, now, monotonicNow})
  const account = await readPhoenixChainAccount({walletAddress: wallet, subaccountIndices: [1]}, {request: rpcRequest, now, monotonicNow})
  const built = await phoenixClient.api.exchange().buildRegisterIxs({traderAuthority: wallet, txFeePayer: wallet, maxPositions: 32})
  const latest = await rpcRequest('getLatestBlockhash', [{commitment: 'confirmed'}])
  const preparation = await preparePhoenixParentOnboarding({plan: review.plan, native, account, built,
    blockhash: latest.value.blockhash, lastValidBlockHeight: latest.value.lastValidBlockHeight}, {request: rpcRequest, now})
  const simulation = await simulatePhoenixParentOnboarding(preparation)
  return {preparation, simulation}
}

const service = createPhoenixParentService({
  controls, vault, journal: phoenixJournal, riskJournal: journal, swapJournal, backupRegistry,
  request: rpcRequest, assertUncontended, isRunning: () => true, now, prepareNative,
  sendRegisterIxs: ({transaction, traderAuthority, txFeePayer, maxPositions, traderPdaIndex, traderSubaccountIndex}) =>
    phoenixClient.api.exchange().sendRegisterIxs({transaction, traderAuthority, txFeePayer, maxPositions, traderPdaIndex, traderSubaccountIndex}),
})

const who = {ownerAccountHash, walletAddress}
const status = await service.status(who)
report('STATUS', {available: status.available, operations: status.operations.length})

const review = await service.prepare({ownerAccountHash, walletAddress, symbol})
report('REVIEW', {id: review.id, parentAddress: review.parentAddress, maximumLamports: review.maximumLamports})

const operation = await service.confirm({ownerAccountHash, walletAddress, id: review.id, explicitApproval: true})
report('CONFIRMED', {state: operation.state, signature: operation.signature, providerAcknowledged: operation.providerAcknowledged})

let current = operation
for (let attempt = 0; attempt < 20; attempt += 1) {
  if (current.state === 'FINALIZED' || current.state === 'CANCELLED') break
  await new Promise((resolve) => setTimeout(resolve, 3000))
  current = await service.recover({ownerAccountHash, walletAddress, id: review.id})
  report('RECOVER', {state: current.state})
}
report('FINAL', {state: current.state, registered: current.registered, signature: current.signature})

for (const store of [phoenixJournal, swapJournal, journal, controls, backupRegistry]) {
  try { store.close() } catch {}
}
