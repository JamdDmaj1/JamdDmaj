import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import bs58 from 'bs58';

const SOL='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Read-only provider check. Never signs, simulates a signed wire, or submits.
export async function checkLiveSwapPreparation(taker,{fetchImpl=fetch,now=Date.now}={}) {
  assert.equal(bs58.decode(taker).length,32,'A public Solana address is required');
  assert.equal(bs58.encode(bs58.decode(taker)),taker);
  const intent={inputMint:SOL,outputMint:USDC,amount:'1000000',taker,slippageBps:'50'};
  const response=await fetchImpl('https://www.jamddmaj.com/api/swap-build?'+new URLSearchParams(intent),{
    method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)
  });
  assert.equal(response.status,200,'Swap preparation service unavailable');
  const raw=await response.text();
  assert.ok(raw.length<=262144,'Oversized preparation');
  const body=JSON.parse(raw),p=body.preparation;
  assert.equal(body.ok,true);
  assert.equal(p.network,'solana-mainnet-beta');
  assert.equal(p.executable,false);
  assert.equal(p.requiresNativeValidation,true);
  for(const key of ['transaction','signature','signedTransaction'])assert.equal(key in p,false);
  for(const key of ['inputMint','outputMint','taker'])assert.equal(p[key],intent[key]);
  assert.equal(p.inAmount,intent.amount);
  assert.equal(p.slippageBps,50);
  assert.ok(/^[1-9]\d{0,19}$/.test(p.outAmount));
  assert.ok(/^[1-9]\d{0,19}$/.test(p.minimumOut));
  assert.ok(BigInt(p.minimumOut)<=BigInt(p.outAmount));
  assert.ok(BigInt(p.minimumOut)>=(BigInt(p.outAmount)*9950n+9999n)/10000n);
  assert.ok(Number.isSafeInteger(p.receivedAt)&&Number.isSafeInteger(p.expiresAt));
  assert.equal(p.expiresAt-p.receivedAt,15000);
  assert.ok(p.receivedAt<=now()&&p.expiresAt>now(),'Preparation expired or clock mismatch');
  assert.ok(Array.isArray(p.instructions)&&p.instructions.length>0&&p.instructions.length<=64);
  return Object.freeze({providerPreparation:'passed',nativeValidation:'not-tested',
    signing:'not-tested',submission:'not-tested',confirmation:'not-tested',fundsMoved:false});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try { console.log(JSON.stringify(await checkLiveSwapPreparation(process.argv[2]))); }
  catch { console.error('Preparation check failed. No transaction was signed or submitted.');process.exitCode=1; }
}
