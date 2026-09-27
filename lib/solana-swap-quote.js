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
export function createSolanaSwapQuoteService({ apiKey, fetchImpl = fetch, now = Date.now }) {
  return async function quote({ inputMint, outputMint, amount }) {
    inputMint = mint(inputMint); outputMint = mint(outputMint); amount = units(amount);
    if (inputMint === outputMint) throw new Error('Choose different tokens');
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('Swap provider not configured');
    const startedAt = now();
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ inputMint, outputMint, amount }).toString();
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'x-api-key': apiKey, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Swap quote unavailable');
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
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.errorCode || body.error || body.transaction) throw new Error('Unexpected executable or failed quote');
    if (body.inputMint !== inputMint || body.outputMint !== outputMint || body.inAmount !== amount) throw new Error('Quote does not match request');
    const outAmount = units(body.outAmount);
    const receivedAt = now();
    if (receivedAt < startedAt || receivedAt - startedAt > 10000) throw new Error('Quote expired during request');
    // Indicative output is not a guaranteed minimum or an authorization to sign.
    return Object.freeze({ network: 'solana-mainnet-beta', inputMint, outputMint,
      inAmount: amount, outAmount, receivedAt, expiresAt: receivedAt + 15000,
      indicativeOnly: true, executable: false });
  };
}
