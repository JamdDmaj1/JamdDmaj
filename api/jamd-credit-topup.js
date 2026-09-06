import { corsHeaders, jsonResponse } from "../lib/server.js";
import { authenticateTrial } from "../lib/web-trial-session.js";
import { grantPaidCredits } from "../lib/account-credits.js";
import { normalizePublicKey } from "../lib/solana-account-codecs.js";

export const config = { runtime: "edge" };
export const DEVNET_MINT = "3hGv2JJ8Hfktw5LMPoSN6R4enoAAZMPvPtS3TcwgGV61";
export const DEVNET_TREASURY = "4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr";
export const PAYMENT_BASE_UNITS = 10_000_000_000n;
export const PACKAGE_CREDITS = 20;
const RPC = "https://api.devnet.solana.com";

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  if (request.method !== "POST") return jsonResponse(request,{error:{code:"method"}},405);
  try {
    const accountHash = await authenticateTrial(request);
    const body = await request.json();
    const signature = String(body?.signature || "").trim();
    const wallet = normalizePublicKey(body?.wallet || "");
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) return jsonResponse(request,{error:{code:"signature"}},400);
    const transaction = await getFinalizedTransaction(signature);
    if (!transaction) return jsonResponse(request,{error:{code:"pending"}},409);
    verifyPayment(transaction, signature, wallet);
    const grant = await grantPaidCredits(accountHash, `devnet:${signature}`, PACKAGE_CREDITS);
    return jsonResponse(request,{ok:true,network:"solana:devnet",created:grant.created,paidCredits:grant.credits});
  } catch (error) {
    const status = error?.status === 401 ? 401 : /invalid|payment|transaction|signature|wallet/i.test(String(error?.message)) ? 400 : 503;
    return jsonResponse(request,{error:{code:status===401?"login":status===400?"invalid-payment":"unavailable"}},status);
  }
}

async function getFinalizedTransaction(signature) {
  const response = await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    jsonrpc:"2.0",id:1,method:"getTransaction",params:[signature,{encoding:"jsonParsed",commitment:"finalized",maxSupportedTransactionVersion:0}]
  }),signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error("transaction-unavailable");
  const data = await response.json();
  if (data.error) throw new Error("transaction-unavailable");
  return data.result;
}

export function verifyPayment(transaction, signature, wallet, now = Math.floor(Date.now()/1000)) {
  if (transaction?.meta?.err || transaction?.transaction?.signatures?.[0] !== signature) throw new Error("invalid-transaction");
  if (!Number.isSafeInteger(transaction.blockTime) || transaction.blockTime < now-1800 || transaction.blockTime > now+60) throw new Error("invalid-payment-time");
  const keys = transaction.transaction?.message?.accountKeys || [];
  if (!keys.some(key => String(key?.pubkey || key) === wallet && key?.signer === true)) throw new Error("wallet-did-not-sign");
  const amountFor = (items, owner) => (items || []).filter(item => item.mint === DEVNET_MINT && item.owner === owner)
    .reduce((sum,item)=>sum+BigInt(item.uiTokenAmount?.amount || 0),0n);
  const preTreasury = amountFor(transaction.meta.preTokenBalances,DEVNET_TREASURY);
  const postTreasury = amountFor(transaction.meta.postTokenBalances,DEVNET_TREASURY);
  const preWallet = amountFor(transaction.meta.preTokenBalances,wallet);
  const postWallet = amountFor(transaction.meta.postTokenBalances,wallet);
  if (postTreasury-preTreasury !== PAYMENT_BASE_UNITS || preWallet-postWallet !== PAYMENT_BASE_UNITS) throw new Error("invalid-payment-amount");
  return true;
}
