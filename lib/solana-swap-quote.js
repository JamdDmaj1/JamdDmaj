import bs58 from 'bs58';

// Server-side, quote-only adapter. Never accepts a private key or requests a transaction.
const ENDPOINT = 'https://api.jup.ag/swap/v2/order';
const U64_MAX = (1n << 64n) - 1n;
function mint(value) {
  if (typeof value !== 'string' || value.length > 44) throw new Error('Invalid mint');
  const bytes = bs58.decode(value);
  if (bytes.length !== 32 || bs58.encode(bytes) !== value) throw new Error('Invalid mint');
  return value;
}
function units(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > U64_MAX) throw new Error('Invalid amount');
  return value;
}
export function createSolanaSwapQuoteService({ apiKey, fetchImpl = (...args) => fetch(...args), now = Date.now }) {
  return async function quote({ inputMint, outputMint, amount }) {
    let providerPhase = 'INPUT';
    let deadline;
    try {
    inputMint = mint(inputMint); outputMint = mint(outputMint); amount = units(amount);
    if (inputMint === outputMint) throw new Error('Choose different tokens');
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Swap provider not configured');
    if (!/^[\x21-\x7e]+$/.test(apiKey.trim())) throw new Error('Invalid provider credential format');
    const startedAt = now();
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ inputMint, outputMint, amount }).toString();
    providerPhase = 'FETCH';
    // AbortSignal.timeout is not available in every deployed Edge runtime.
    // Keep the deadline active through body consumption, not just headers.
    const controller = new AbortController();
    deadline = setTimeout(() => controller.abort(), 10000);
    const response = await fetchImpl(url.toString(), {
      // Some Edge fetch implementations reject redirect:'error' itself.
      // Manual returns the redirect without forwarding the credential; the
      // non-2xx check below rejects it instead of following Location.
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { 'x-api-key': apiKey.trim(), Accept: 'application/json' }
    });
    if (!response.ok) throw Object.assign(new Error('Swap quote unavailable'), { providerStatus: response.status });
    providerPhase = 'READ_BODY';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing quote response');
    const chunks = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 262144) throw new Error('Quote response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    providerPhase = 'DECODE_BODY';
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    providerPhase = 'VALIDATE_BODY';
    if (body.errorCode || body.error || body.transaction) throw new Error('Unexpected executable or failed quote');
    if (body.inputMint !== inputMint || body.outputMint !== outputMint || body.inAmount !== amount) throw new Error('Quote does not match request');
    const outAmount = units(body.outAmount);
    const receivedAt = now();
    if (receivedAt < startedAt || receivedAt - startedAt > 10000) throw new Error('Quote expired during request');
    // Indicative output is not a guaranteed minimum or an authorization to sign.
    return Object.freeze({ network: 'solana-mainnet-beta', inputMint, outputMint,
      inAmount: amount, outAmount, receivedAt, expiresAt: receivedAt + 15000,
      indicativeOnly: true, executable: false });
    } catch (error) {
      const wrapped = new Error(error?.message || 'Quote failure');
      wrapped.name = error?.name || 'Error';
      wrapped.providerStatus = error?.providerStatus;
      wrapped.providerPhase = providerPhase;
      throw wrapped;
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  };
}
