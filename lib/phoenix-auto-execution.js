// Automatic Phoenix order lifecycle. The service owns market lookup, sizing,
// simulation, journaling and server-vault signing; this adapter only supplies
// the stored automation limits and the signal direction.
const SYMBOL = /^[A-Za-z0-9_-]{1,32}$/;

function input(value) {
  if (!value || typeof value !== 'object' || typeof value.service !== 'object') throw Error('PHOENIX_AUTO_CONFIGURATION');
  if (typeof value.ownerAccountHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.ownerAccountHash)) throw Error('PHOENIX_AUTO_OWNERSHIP');
  if (typeof value.walletAddress !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.walletAddress)) throw Error('PHOENIX_AUTO_WALLET');
  return value;
}

export async function openAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, symbol, side}) {
  input({service, ownerAccountHash, walletAddress});
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol) || !['LONG', 'SHORT'].includes(side)) throw Error('PHOENIX_AUTO_SIGNAL');
  const state = await service.status({ownerAccountHash, walletAddress});
  if (state?.stage !== 'PHOENIX_MANUAL_STATUS' || state.entryAvailable !== true) throw Error('PHOENIX_AUTO_ENTRY_UNAVAILABLE');
  const review = await service.prepareEntry({ownerAccountHash, walletAddress, symbol, side, automation: true});
  if (review?.stage !== 'PHOENIX_MANUAL_ENTRY_REVIEW' || review.walletAddress !== walletAddress || review.symbol !== symbol || review.side !== side) {
    throw Error('PHOENIX_AUTO_REVIEW');
  }
  return service.confirmEntry({ownerAccountHash, walletAddress, id: review.id, explicitApproval: true});
}

export async function closeAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, workflowId}) {
  input({service, ownerAccountHash, walletAddress});
  if (typeof workflowId !== 'string' || !/^[a-f0-9]{64}$/.test(workflowId)) throw Error('PHOENIX_AUTO_WORKFLOW');
  const review = await service.prepareClose({ownerAccountHash, walletAddress, workflowId, closePercent: 100, automation: true});
  if (review?.stage !== 'PHOENIX_MANUAL_CLOSE_REVIEW' || review.walletAddress !== walletAddress || review.workflowId !== workflowId) {
    throw Error('PHOENIX_AUTO_CLOSE_REVIEW');
  }
  return service.confirmClose({ownerAccountHash, walletAddress, id: review.id, explicitApproval: true});
}
