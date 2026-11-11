import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Fast swap helper for Sniper: quote, build transaction and read a token balance.
const JUP = 'https://lite-api.jup.ag/swap/v1';
const SOL = 'So11111111111111111111111111111111111111112';
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function readJson(url, options = {}, timeout = 9000) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) { return { ok: false, status: 0, data: null }; }
}

function isMint(value) { return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value); }

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const action = String(body?.action || '');

  if (action === 'quote') {
    const inputMint = body?.inputMint === 'SOL' ? SOL : String(body?.inputMint || '');
    const outputMint = String(body?.outputMint || '');
    const amount = String(Math.floor(Number(body?.amount) || 0));
    const slippageBps = Math.max(10, Math.min(500, Math.floor(Number(body?.slippageBps) || 100)));
    if (!isMint(inputMint) || !isMint(outputMint) || amount === '0') return jsonResponse(request, { error: { message: 'Invalid quote request' } }, 400);
    const query = new URLSearchParams({ inputMint, outputMint, amount, slippageBps: String(slippageBps), restrictIntermediateTokens: 'true' });
    const result = await readJson(JUP + '/quote?' + query.toString());
    if (!result.ok || !result.data) return jsonResponse(request, { error: { message: 'No route' } }, 502);
    const quote = result.data;
    return jsonResponse(request, {
      quoteResponse: quote,
      outAmount: String(quote.outAmount || ''),
      inAmount: String(quote.inAmount || ''),
      priceImpactPct: num(quote.priceImpactPct) ?? 0,
      slippageBps,
      routes: Array.isArray(quote.routePlan) ? quote.routePlan.map(step => String(step?.swapInfo?.label || '')).filter(Boolean).slice(0, 4) : []
    });
  }

  if (action === 'swap') {
    const quoteResponse = body?.quoteResponse;
    const userPublicKey = String(body?.userPublicKey || '');
    if (!quoteResponse || typeof quoteResponse !== 'object' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(userPublicKey)) return jsonResponse(request, { error: { message: 'Invalid swap request' } }, 400);
    const result = await readJson(JUP + '/swap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: 'high' } }
      })
    }, 12000);
    if (!result.ok || !result.data?.swapTransaction) return jsonResponse(request, { error: { message: 'No transaction' } }, 502);
    return jsonResponse(request, { swapTransaction: String(result.data.swapTransaction), lastValidBlockHeight: result.data.lastValidBlockHeight ?? null });
  }

  if (action === 'balance') {
    const owner = String(body?.owner || '');
    const mint = String(body?.mint || '');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner) || !isMint(mint)) return jsonResponse(request, { error: { message: 'Invalid balance request' } }, 400);
    for (const rpc of RPC) {
      const result = await readJson(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { mint }, { encoding: 'jsonParsed' }] })
      }, 8000);
      const accounts = result.data?.result?.value;
      if (Array.isArray(accounts)) {
        let total = 0;
        for (const account of accounts) {
          const amount = account?.account?.data?.parsed?.info?.tokenAmount;
          const value = num(amount?.uiAmountString ?? amount?.uiAmount);
          if (value) total += value;
        }
        return jsonResponse(request, { mint, uiAmount: total, rawAmount: accounts.length ? String(accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0') : '0' });
      }
    }
    return jsonResponse(request, { error: { message: 'Balance unavailable' } }, 502);
  }

  return jsonResponse(request, { error: { message: 'Unknown action' } }, 400);
}
