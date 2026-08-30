import { corsHeaders, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

const SOLANA_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com"
];
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const FETCH_TIMEOUT_MS = 6000;
const RPC_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 20 * 1000;
const cache = new Map();

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);

  const address = validSolanaAddress(new URL(request.url).searchParams.get("address"));
  if (!address) return jsonResponse(request, { error: { message: "A valid Solana public address is required." } }, 400);

  const cached = cache.get(address);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return jsonResponse(request, cached.payload, 200, privateCacheHeaders());
  }

  try {
    const [balanceResult, classicResult, token2022Result, solPriceResult] = await Promise.allSettled([
      rpc("getBalance", [address, { commitment: "confirmed" }]),
      tokenAccounts(address, TOKEN_PROGRAM),
      tokenAccounts(address, TOKEN_2022_PROGRAM),
      fetchSolPrice()
    ]);
    if (balanceResult.status !== "fulfilled") throw balanceResult.reason;

    const sol = finiteNumber(balanceResult.value?.value) / 1_000_000_000;
    const solPriceUsd = solPriceResult.status === "fulfilled" ? solPriceResult.value : 0;
    const rawTokens = [
      ...(classicResult.status === "fulfilled" ? classicResult.value : []),
      ...(token2022Result.status === "fulfilled" ? token2022Result.value : [])
    ];
    const tokens = await enrichTokens(aggregateTokens(rawTokens));
    const tokensUsd = tokens.reduce((sum, token) => sum + token.valueUsd, 0);
    const payload = {
      ok: true,
      address,
      network: "solana:mainnet",
      updatedAt: new Date().toISOString(),
      sol: { amount: sol, priceUsd: solPriceUsd, valueUsd: sol * solPriceUsd },
      tokens,
      estimatedValueUsd: sol * solPriceUsd + tokensUsd,
      valuationCoverage: tokens.length ? tokens.filter((token) => token.priceUsd > 0).length / tokens.length : 1,
      partial: classicResult.status !== "fulfilled" || token2022Result.status !== "fulfilled" || solPriceResult.status !== "fulfilled"
    };
    cache.set(address, { savedAt: Date.now(), payload });
    return jsonResponse(request, payload, 200, privateCacheHeaders());
  } catch {
    return jsonResponse(request, { error: { message: "The public Solana balance is temporarily unavailable." } }, 502);
  }
}

async function tokenAccounts(owner, programId) {
  const result = await rpc("getTokenAccountsByOwner", [
    owner,
    { programId },
    { commitment: "confirmed", encoding: "jsonParsed" }
  ]);
  return Array.isArray(result?.value) ? result.value : [];
}

async function rpc(method, params) {
  let lastError = new Error("Solana RPC is unavailable.");
  for (const endpoint of SOLANA_RPCS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      if (!response.ok) throw new Error(`Solana RPC returned ${response.status}`);
      const data = await response.json();
      if (data?.error || !data?.result) throw new Error("Solana RPC returned an invalid result.");
      return data.result;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function aggregateTokens(accounts) {
  const byMint = new Map();
  for (const item of accounts) {
    const info = item?.account?.data?.parsed?.info;
    const mint = validSolanaAddress(info?.mint);
    const amount = finiteNumber(info?.tokenAmount?.uiAmountString);
    const decimals = Math.max(0, Math.min(18, Number(info?.tokenAmount?.decimals) || 0));
    if (!mint || amount <= 0) continue;
    const prior = byMint.get(mint) || { mint, amount: 0, decimals };
    prior.amount += amount;
    byMint.set(mint, prior);
  }
  return [...byMint.values()].sort((left, right) => right.amount - left.amount).slice(0, 100);
}

async function enrichTokens(tokens) {
  if (!tokens.length) return [];
  const pairByMint = new Map();
  for (let index = 0; index < tokens.length; index += 30) {
    const chunk = tokens.slice(index, index + 30).map((token) => token.mint).join(",");
    try {
      const encodedMints = chunk.split(",").map(encodeURIComponent).join(",");
      const pairs = await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${encodedMints}`);
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        const mint = validSolanaAddress(pair?.baseToken?.address);
        if (!mint || !tokens.some((token) => token.mint === mint)) continue;
        const current = pairByMint.get(mint);
        if (!current || finiteNumber(pair?.liquidity?.usd) > finiteNumber(current?.liquidity?.usd)) pairByMint.set(mint, pair);
      }
    } catch {
      // An unpriced token still remains visible with its on-chain amount.
    }
  }
  return tokens.map((token) => {
    const pair = pairByMint.get(token.mint);
    const priceUsd = finiteNumber(pair?.priceUsd);
    return {
      mint: token.mint,
      symbol: safeSymbol(pair?.baseToken?.symbol) || `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}`,
      name: safeText(pair?.baseToken?.name, 60),
      amount: token.amount,
      decimals: token.decimals,
      priceUsd,
      valueUsd: token.amount * priceUsd
    };
  }).sort((left, right) => right.valueUsd - left.valueUsd || right.amount - left.amount);
}

async function fetchSolPrice() {
  const data = await fetchJson("https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES&symbol=SOLUSDT");
  return finiteNumber(data?.data?.[0]?.lastPrice);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/json", "User-Agent": "JamdDmaj-Portfolio/1.37.67" } });
    if (!response.ok) throw new Error(`Public data source returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validSolanaAddress(value) {
  const address = String(value || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ? address : "";
}

function safeSymbol(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 20);
}

function safeText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function privateCacheHeaders() {
  return { "Cache-Control": "private, max-age=15", "Vary": "Origin" };
}
