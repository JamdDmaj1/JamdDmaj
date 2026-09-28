import bs58 from 'bs58';

const ENDPOINT = 'https://api.jup.ag/swap/v2/build';
const U64 = (1n << 64n) - 1n;
function address(value) {
  if (typeof value !== 'string' || value.length > 44) throw new Error('Invalid address');
  const decoded = bs58.decode(value);
  if (decoded.length !== 32 || bs58.encode(decoded) !== value) throw new Error('Invalid address');
  return value;
}
function units(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > U64) throw new Error('Invalid amount');
  return value;
}
function instruction(value, taker) {
  if (!value || !Array.isArray(value.accounts) || value.accounts.length > 256 || typeof value.data !== 'string'
      || value.data.length > 1644 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data))
    throw new Error('Invalid swap instruction');
  const decoded = atob(value.data);
  if (decoded.length > 1232 || btoa(decoded) !== value.data) throw new Error('Invalid swap instruction');
  return Object.freeze({ programId: address(value.programId), data: value.data,
    accounts: Object.freeze(value.accounts.map(account => {
      if (typeof account?.isSigner !== 'boolean' || typeof account?.isWritable !== 'boolean') throw new Error('Invalid account flags');
      const pubkey = address(account.pubkey);
      if (account.isSigner && pubkey !== taker) throw new Error('Unexpected additional signer');
      return Object.freeze({ pubkey, isSigner: account.isSigner, isWritable: account.isWritable });
    })) });
}
/** Produces untrusted preparation material only. The native wallet must decode,
 * resolve chain accounts, enforce its swap policy and obtain explicit approval.
 * No private keys, signatures, transactions or submission routes are accepted.
 */
export function createSolanaSwapBuildService({ apiKey, fetchImpl = (...args) => fetch(...args), now = Date.now }) {
  return async function build({ inputMint, outputMint, amount, taker, slippageBps }) {
    inputMint = address(inputMint); outputMint = address(outputMint); taker = address(taker); amount = units(amount);
    if (inputMint === outputMint || !Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new Error('Invalid swap intent');
    if (typeof apiKey !== 'string' || !/^[\x21-\x7e]+$/.test(apiKey.trim())) throw new Error('Swap provider not configured');
    const start = now(), controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10000);
    try {
      const url = ENDPOINT + '?' + new URLSearchParams({ inputMint, outputMint, amount, taker, slippageBps: String(slippageBps) });
      const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { 'x-api-key': apiKey.trim(), Accept: 'application/json' } });
      if (!response.ok) throw new Error('Swap preparation unavailable');
      const reader = response.body?.getReader(); if (!reader) throw new Error('Missing preparation');
      const chunks = []; let size = 0;
      try {
        for (;;) { const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 262144) throw new Error('Oversized preparation'); chunks.push(value); }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8',{ fatal:true }).decode(bytes));
      if (body.error || body.errorCode || body.transaction || body.inputMint !== inputMint || body.outputMint !== outputMint
          || body.inAmount !== amount || body.swapMode !== 'ExactIn' || body.slippageBps !== slippageBps)
        throw new Error('Preparation does not match request');
      const outAmount = units(body.outAmount), minimumOut = units(body.otherAmountThreshold);
      const minimum = (BigInt(outAmount) * BigInt(10000 - slippageBps) + 9999n) / 10000n;
      if (BigInt(minimumOut) < minimum || BigInt(minimumOut) > BigInt(outAmount)) throw new Error('Unexpected minimum output');
      for (const key of ['computeBudgetInstructions','setupInstructions','otherInstructions'])
        if (!Array.isArray(body[key]) || body[key].length > 32) throw new Error('Invalid instruction list');
      // Tips are intentionally not requested. Any tip must have separate review support.
      if (body.tipInstruction) throw new Error('Unrequested tip');
      const instructions = [...body.computeBudgetInstructions, ...body.setupInstructions, body.swapInstruction,
        ...(body.cleanupInstruction ? [body.cleanupInstruction] : []), ...body.otherInstructions];
      if (instructions.length > 64) throw new Error('Too many instructions');
      const prepared = Object.freeze(instructions.map(value => instruction(value,taker)));
      const meta = body.blockhashWithMetadata;
      if (!meta || !Array.isArray(meta.blockhash) || meta.blockhash.length !== 32
          || meta.blockhash.some(n => !Number.isInteger(n) || n < 0 || n > 255)
          || !Number.isSafeInteger(meta.lastValidBlockHeight) || meta.lastValidBlockHeight < 1) throw new Error('Invalid blockhash metadata');
      const tables = body.addressesByLookupTableAddress;
      if (tables !== null && tables !== undefined && (typeof tables !== 'object' || Array.isArray(tables))) throw new Error('Invalid lookup tables');
      const lookupTableAddresses = Object.keys(tables || {});
      if (lookupTableAddresses.length > 32) throw new Error('Too many lookup tables');
      lookupTableAddresses.forEach(address);
      // Never return provider-supplied resolved addresses as trusted chain state.
      const receivedAt = now(); if (receivedAt < start || receivedAt - start > 10000) throw new Error('Preparation expired');
      return Object.freeze({ network:'solana-mainnet-beta', inputMint, outputMint, taker, inAmount:amount, outAmount,
        minimumOut, slippageBps, instructions:prepared, lookupTableAddresses:Object.freeze(lookupTableAddresses),
        blockhash:bs58.encode(Uint8Array.from(meta.blockhash)), lastValidBlockHeight:String(meta.lastValidBlockHeight),
        receivedAt, expiresAt:receivedAt+15000, requiresNativeValidation:true, executable:false });
    } finally { clearTimeout(deadline); }
  };
}
