import { corsHeaders, jsonResponse, getClientIp, hashIdentifier, redisRequest } from '../lib/server.js';
import { createSolanaSwapQuoteService } from '../lib/solana-swap-quote.js';
export const config = { runtime: 'edge' };

// Public indicative prices, not authorization or a transaction-submission route.
export function createHandler({ env = process.env, quote, limit, diagnostic = data => console.warn('swap_quote_failure', JSON.stringify(data)) } = {}) {
  return async function handler(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (request.method !== 'GET') return jsonResponse(request, { error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!env.JUPITER_API_KEY || !env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)
      return jsonResponse(request, { error: 'SWAP_NOT_CONFIGURED', executable: false }, 503);
    const params = new URL(request.url).searchParams;
    const allowed = ['inputMint', 'outputMint', 'amount'];
    if ([...params.keys()].some(key => !allowed.includes(key)) || allowed.some(key => params.getAll(key).length !== 1) || request.url.length > 600)
      return jsonResponse(request, { error: 'INVALID_QUOTE_REQUEST' }, 400);
    let stage = 'quota';
    try {
      await (limit || enforceQuoteLimit)(request);
      stage = 'provider';
      const getQuote = quote || createSolanaSwapQuoteService({ apiKey: env.JUPITER_API_KEY });
      return jsonResponse(request, { ok: true, quote: await getQuote(Object.fromEntries(params)) });
    } catch (error) {
      // Never log error messages, URLs, response bodies, API keys or request data.
      const known = new Map([
        ['Invalid provider credential format', 'CREDENTIAL_FORMAT'],
        ['Illegal invocation', 'FETCH_BINDING'],
        ['fetch failed', 'FETCH_FAILED'],
        ['Failed to fetch', 'FETCH_FAILED'],
        ['Unexpected executable or failed quote', 'UNEXPECTED_QUOTE'],
        ['Quote does not match request', 'QUOTE_MISMATCH'],
        ['Invalid amount', 'INVALID_AMOUNT'],
        ['Missing quote response', 'MISSING_BODY'],
        ['Quote response too large', 'OVERSIZED_BODY'],
        ['Quote expired during request', 'EXPIRED'],
        ['Swap quote unavailable', 'HTTP_ERROR']
      ]);
      const message = String(error?.message || '');
      const transportReason = /redirect/i.test(message) ? 'REDIRECT_FAILURE'
        : /url|RequestInfo/i.test(message) ? 'URL_INPUT_FAILURE'
        : /header|ByteString/i.test(message) ? 'HEADER_FAILURE'
        : /signal|abort/i.test(message) ? 'ABORT_FAILURE'
        : /invocation|receiver|this/i.test(message) ? 'RUNTIME_BINDING_FAILURE' : 'TRANSPORT_OR_RUNTIME';
      const reason = known.get(message) || (error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.name === 'SyntaxError' ? 'INVALID_JSON' : transportReason);
      const phase = ['INPUT','FETCH','READ_BODY','DECODE_BODY','VALIDATE_BODY'].includes(error?.providerPhase) ? error.providerPhase : null;
      const kind = ['TypeError','TimeoutError','AbortError','SyntaxError','Error'].includes(error?.name) ? error.name : 'Other';
      diagnostic({ stage, reason, phase, kind, providerStatus: Number.isInteger(error?.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599 ? error.providerStatus : null });
      return jsonResponse(request, { error: error?.status === 429 ? 'QUOTE_RATE_LIMIT' : 'QUOTE_UNAVAILABLE', executable: false }, error?.status === 429 ? 429 : 502);
    }
  };
}
export async function enforceQuoteLimit(request) {
  const ip = await hashIdentifier(getClientIp(request));
  const window = Math.floor(Date.now() / 60000);
  const script = 'local a=redis.call("INCR",KEYS[1]); if a==1 then redis.call("EXPIRE",KEYS[1],120) end; local b=redis.call("INCR",KEYS[2]); if b==1 then redis.call("EXPIRE",KEYS[2],120) end; return {a,b}';
  const results = await redisRequest('pipeline', [['EVAL', script, 2, `jamd:swap:ip:${ip}:${window}`, `jamd:swap:global:${window}`]]);
  const counts = results[0]?.result;
  if (!Array.isArray(counts) || counts.length !== 2 || counts.some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid quota response');
  if (counts[0] > 20 || counts[1] > 200) { const error = new Error('Quota exceeded'); error.status = 429; throw error; }
}
export default createHandler();
