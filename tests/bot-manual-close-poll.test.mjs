import test from 'node:test'
import assert from 'node:assert/strict'
import { pollCloseRecovery } from '../lib/bot-manual-positions-panel.js'

const wallet = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'
const id = 'manual-close:11111111-1111-4111-8111-111111111111'

test('advances a submitted close until it is terminal', async () => {
  const states = ['SIGNING', 'FIRST_LEG_FINALIZED', 'COMPLETED']
  const calls = [], ticks = []
  const final = await pollCloseRecovery({
    recover: async (seenWallet, seenId) => {
      calls.push([seenWallet, seenId])
      return { state: states[calls.length - 1], phase: 'CLOSE' }
    },
    walletAddress: wallet,
    id,
    initial: { state: 'PREPARED', phase: 'UNCERTAIN' },
    pollMs: 2,
    onTick: (seconds) => ticks.push(seconds),
  })
  assert.equal(final.state, 'COMPLETED')
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0], [wallet, id])
  assert.ok(ticks.length >= 1)
})

test('does nothing when the close is already terminal', async () => {
  let calls = 0
  const final = await pollCloseRecovery({
    recover: async () => { calls += 1; return { state: 'COMPLETED' } },
    walletAddress: wallet,
    id,
    initial: { state: 'CANCELLED' },
    pollMs: 2,
  })
  assert.equal(final.state, 'CANCELLED')
  assert.equal(calls, 0)
})

test('stops polling when the caller is disposed', async () => {
  let calls = 0
  const final = await pollCloseRecovery({
    recover: async () => { calls += 1; return { state: 'SIGNING' } },
    walletAddress: wallet,
    id,
    initial: { state: 'PREPARED' },
    pollMs: 2,
    stopped: () => true,
  })
  assert.equal(calls, 0)
  assert.equal(final.state, 'PREPARED')
})

test('refuses an incomplete configuration', async () => {
  await assert.rejects(pollCloseRecovery({ recover: null, walletAddress: wallet, id }), /POLL_CONFIGURATION/)
})
