// Atomically reserve a confirmation ID and the single-slot manual queue.
// A duplicate remains a duplicate after consumption; never silently resubmit.
export const ENQUEUE_MANUAL_ORDER = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'duplicate' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'busy' end
redis.call('SET', KEYS[1], 'reserved', 'EX', 86400)
redis.call('SET', KEYS[2], ARGV[1], 'EX', 120)
return 'queued'
`;

export function requireManualConfirmation(value = {}) {
  if (value.confirmLiveOrder !== true) throw new Error('Explicit live order confirmation is required.');
  const id = String(value.requestId || '');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw new Error('A unique confirmation ID is required.');
  }
  return id.toLowerCase();
}

export async function enqueueManualOrder(redis, queueKey, requestId, payload) {
  const result = await redis('pipeline', [[
    'EVAL', ENQUEUE_MANUAL_ORDER, 2, `jamd:pro:manual-confirmation:${requestId}`,
    queueKey, JSON.stringify(payload)
  ]]);
  const status = result?.[0]?.result;
  if (status === 'duplicate') throw new Error('This confirmation was already used. Check order status; do not resubmit.');
  if (status === 'busy') throw new Error('A manual order is already pending.');
  if (status !== 'queued') throw new Error('Queue outcome is unconfirmed. Check status before retrying with the same confirmation ID.');
}
