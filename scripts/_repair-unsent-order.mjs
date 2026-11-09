// Operator repair: cancel an entry attempt that was signed but provably never
// reached the chain, so the PENDING gate stops blocking new entries.
//
// Safety: it first proves the signature is absent from the cluster, copies the
// journal, and only then marks the attempt CANCELLED and its workflow ABORTED.
import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'

const runtime = process.argv[2]
const attemptId = process.argv[3]
const rpcUrl = process.argv[4]
if (!runtime || !attemptId || !rpcUrl) {
  console.error('usage: node scripts/_repair-unsent-order.mjs <runtime> <attemptId> <rpcUrl>')
  process.exit(1)
}

const report = (stage, detail = {}) => console.log(JSON.stringify({stage, ...detail}))
const journalPath = join(runtime, 'phoenix.sqlite')
const db = new DatabaseSync(journalPath)

const row = db.prepare('SELECT * FROM phoenix_order_attempts WHERE id=?').get(attemptId)
if (!row) { report('NOT_FOUND'); process.exit(1) }
report('ATTEMPT', {state: row.state, kind: row.kind, hasSignature: row.signature !== null, hasSigned: row.signed !== null})
if (row.state !== 'SIGNED' || row.signature === null || row.kind !== 'OPEN') {
  report('REFUSED', {reason: 'only a SIGNED OPEN attempt can be repaired'})
  process.exit(1)
}

let id = 0
const rpc = async (method, params) => {
  const response = await fetch(rpcUrl, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, params})})
  const body = await response.json()
  if (body.error) throw Error(method + ': ' + JSON.stringify(body.error))
  return body.result
}
const status = await rpc('getSignatureStatuses', [[row.signature], {searchTransactionHistory: true}])
const onChain = status?.value?.[0] ?? null
report('CHAIN', {present: onChain !== null, slot: onChain?.slot ?? null})
if (onChain !== null) { report('REFUSED', {reason: 'signature exists on chain; reconcile instead of cancelling'}); process.exit(1) }

db.exec("VACUUM INTO '" + join(runtime, 'phoenix-before-unsent-repair.sqlite') + "'")
const now = Date.now()
db.exec('BEGIN IMMEDIATE')
try {
  db.prepare("UPDATE phoenix_order_attempts SET state='CANCELLED',updated=? WHERE id=?").run(now, attemptId)
  db.prepare("UPDATE phoenix_workflows SET state='ABORTED',updated=? WHERE id=?").run(now, row.workflow)
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK'); throw error
}
const after = db.prepare('SELECT state FROM phoenix_order_attempts WHERE id=?').get(attemptId)
const workflow = db.prepare('SELECT state FROM phoenix_workflows WHERE id=?').get(row.workflow)
const pending = db.prepare("SELECT COUNT(*) c FROM phoenix_order_attempts WHERE state IN('PREPARED','SIGNED','UNKNOWN')").get().c
report('REPAIRED', {attempt: after.state, workflow: workflow.state, pendingOrders: pending})
db.close()
