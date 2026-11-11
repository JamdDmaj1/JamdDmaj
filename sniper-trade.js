import {Connection, VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';

const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
const SOL = 'So11111111111111111111111111111111111111112';
const LAMPORTS = 1_000_000_000;
const RPC_URL = 'https://api.mainnet-beta.solana.com';
let cachedConnection = null;
const connection = () => {
  if (!cachedConnection) cachedConnection = new Connection(RPC_URL, 'confirmed');
  return cachedConnection;
};

async function call(action, payload) {
  const response = await fetch(base + '/api/sniper-swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error?.message || 'swap-unavailable');
  return data;
}

function provider() {
  const phantom = globalThis.phantom?.solana;
  if (phantom?.isPhantom) return phantom;
  const injected = globalThis.solana;
  return injected?.isPhantom ? injected : null;
}

let publicKey = null;

async function connect() {
  const wallet = provider();
  if (!wallet) throw new Error('phantom-missing');
  const result = await wallet.connect();
  publicKey = String(result?.publicKey?.toString?.() || wallet.publicKey?.toString?.() || '');
  if (!publicKey) throw new Error('wallet-rejected');
  return publicKey;
}

function key() {
  if (publicKey) return publicKey;
  const wallet = provider();
  const current = wallet?.publicKey?.toString?.();
  if (current) publicKey = current;
  return publicKey;
}

async function quote({ mint, solAmount, slippageBps = 120, inputMint }) {
  const amount = Math.max(1, Math.round(Number(solAmount) * LAMPORTS));
  const payload = inputMint
    ? { inputMint, outputMint: SOL, amount, slippageBps }
    : { inputMint: SOL, outputMint: mint, amount, slippageBps };
  return call('quote', payload);
}

async function quoteToken({ mint, rawAmount, slippageBps = 150 }) {
  const amount = String(Math.floor(Number(rawAmount) || 0));
  if (!amount || amount === '0') throw new Error('no-balance');
  return call('quote', { inputMint: mint, outputMint: SOL, amount, slippageBps });
}

async function send(quoteResponse) {
  const owner = key() || await connect();
  const data = await call('swap', { quoteResponse, userPublicKey: owner });
  const transaction = VersionedTransaction.deserialize(bs58.decode(data.swapTransaction));
  const wallet = provider();
  if (!wallet) throw new Error('phantom-missing');
  if (typeof wallet.signAndSendTransaction === 'function') {
    try {
      const sent = await wallet.signAndSendTransaction(transaction, { skipPreflight: true, maxRetries: 2 });
      if (sent?.signature) return String(sent.signature);
    } catch (error) {
      // Fall through to the manual path below.
    }
  }
  if (typeof wallet.signTransaction === 'function') {
    const signed = await wallet.signTransaction(transaction);
    const signature = await connection().sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 2, encoding: 'base64' });
    return String(signature || '');
  }
  throw new Error('wallet-cannot-sign');
}

async function buy({ mint, solAmount, slippageBps = 120 }) {
  const data = await quote({ mint, solAmount, slippageBps });
  const signature = await send(data.quoteResponse);
  return { signature, outAmount: data.outAmount, priceImpactPct: data.priceImpactPct };
}

async function balance(mint) {
  const owner = key() || await connect();
  return call('balance', { owner, mint });
}

async function sellAll({ mint, slippageBps = 150 }) {
  const held = await balance(mint);
  const data = await quoteToken({ mint, rawAmount: held?.rawAmount, slippageBps });
  const signature = await send(data.quoteResponse);
  return { signature, outAmount: data.outAmount, rawAmount: String(held?.rawAmount || '') };
}

globalThis.JamdSniperTrade = { provider, connect, quote, buy, sellAll, balance, key };
