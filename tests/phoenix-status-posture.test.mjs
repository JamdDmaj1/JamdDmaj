import test from 'node:test'
import assert from 'node:assert/strict'
import {createPhoenixManualClient} from '../lib/phoenix-manual-client.js'

const wallet = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'
const token = 'f'.repeat(64)

function clientWith(phoenix) {
  return createPhoenixManualClient({
    fetchImpl: async () => new Response(JSON.stringify({ok: true, phoenix}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    readSessionToken: () => token,
  })
}

const base = {stage: 'PHOENIX_MANUAL_STATUS', walletAddress: wallet, venue: 'phoenix', closeAvailable: true, closeReason: null, operations: []}

test('accepts the current disabled posture with its gate reason', async () => {
  const status = await clientWith({...base, entryAvailable: false, entryReason: 'PHOENIX_RELEASE_GATES_PENDING'}).status(wallet)
  assert.equal(status.entryAvailable, false)
  assert.equal(status.entryReason, 'PHOENIX_RELEASE_GATES_PENDING')
})

test('accepts a future enabled posture without a reason', async () => {
  const status = await clientWith({...base, entryAvailable: true, entryReason: null}).status(wallet)
  assert.equal(status.entryAvailable, true)
})

test('accepts a new bounded gate reason instead of breaking the client', async () => {
  const status = await clientWith({...base, entryAvailable: false, entryReason: 'MARKET_NOT_YET_RELEASED'}).status(wallet)
  assert.equal(status.entryReason, 'MARKET_NOT_YET_RELEASED')
})

test('still fails closed on an invented shape', async () => {
  await assert.rejects(clientWith({...base, entryAvailable: true, entryReason: 'WHY'}).status(wallet), /phoenix-status-unverified/)
  await assert.rejects(clientWith({...base, entryAvailable: false, entryReason: 42}).status(wallet), /phoenix-status-unverified/)
  await assert.rejects(clientWith({...base, entryAvailable: 'yes', entryReason: null}).status(wallet), /phoenix-status-unverified/)
})
