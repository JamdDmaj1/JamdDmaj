// Preparation only for the server-custodied wallet. Deliberately exports no
// signer or submission method until the durable custody/worker gate is wired.
import {createWebSwapEngine} from './web-swap-engine.js';
const SOL='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const METHODS=new Set(['getGenesisHash','getSlot','getLatestBlockhash','getMultipleAccounts','getBlockHeight','isBlockhashValid','getFeeForMessage','getMinimumBalanceForRentExemption','simulateTransaction']);
function fail(code='BOT_SWAP_REVIEW_UNAVAILABLE'){throw Error(code);}
export function botSwapAmountUnits(value,decimals){
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,10})(\.[0-9]+)?$/.test(value)||![6,9].includes(decimals))fail('BOT_SWAP_INVALID_AMOUNT');
 const [whole,fraction='']=value.split('.');if(fraction.length>decimals)fail('BOT_SWAP_INVALID_AMOUNT');
 const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
 if(units<=0n||units>18446744073709551615n)fail('BOT_SWAP_INVALID_AMOUNT');return units.toString();
}
export function createBotWalletSwapReviewer({controls,vault,readRequest,fetchImpl,readPending,now=Date.now}={}){
 if(typeof controls?.readForOwner!=='function'||typeof vault?.describe!=='function'||[readRequest,fetchImpl,readPending,now].some(fn=>typeof fn!=='function'))fail();
 async function identity(ownerAccountHash){
  if(typeof ownerAccountHash!=='string'||! /^[a-f0-9]{64}$/.test(ownerAccountHash))fail('BOT_SWAP_LOGIN_REQUIRED');
  const state=controls.readForOwner({ownerAccountHash});
  if(!state||typeof state.walletAddress!=='string'||typeof state.revision!=='number'&&typeof state.revision!=='string')fail('BOT_SWAP_WALLET_REQUIRED');
  if(state.enabled!==false||state.paused!==true)fail('BOT_SWAP_PAUSE_REQUIRED');
  const custody=vault.describe({ownerAccountHash,walletAddress:state.walletAddress});
  if(custody.ownerAccountHash!==ownerAccountHash||custody.walletAddress!==state.walletAddress||custody.exclusive!==true||custody.restoreReviewRequired===true)fail('BOT_SWAP_CUSTODY_UNAVAILABLE');
  const pending=await readPending({ownerAccountHash,walletAddress:state.walletAddress});
  if(!pending||pending.known!==true||!Array.isArray(pending.operations)||pending.operations.length)fail('BOT_SWAP_RECONCILIATION_REQUIRED');
  return {walletAddress:state.walletAddress,revision:state.revision};
 }
 // This entry point must receive the owner hash from the authenticated server
 // boundary, never from a request body. The target address is not client input.
 return Object.freeze({async prepare({ownerAccountHash,direction,amount}={}){
  if(!['SOL_TO_USDC','USDC_TO_SOL'].includes(direction))fail('BOT_SWAP_INVALID_PAIR');
  const nativeInput=direction==='SOL_TO_USDC',units=botSwapAmountUnits(amount,nativeInput?9:6),original=await identity(ownerAccountHash);
  const engine=createWebSwapEngine({now,fetchImpl:async(path,options)=>{
   // Fixed application builder; callers cannot select an RPC/builder URL.
   const relative=new URL(path,'https://www.jamddmaj.com');
   if(relative.origin!=='https://www.jamddmaj.com'||relative.pathname!=='/api/swap-build')fail();
   return fetchImpl(relative.href,options);
  },rpc:async(method,params)=>{if(!METHODS.has(method))fail('BOT_SWAP_READ_ONLY');return readRequest(method,params);},
  journal:{async read(address){const current=await identity(ownerAccountHash);if(current.walletAddress!==address||current.revision!==original.revision)fail('BOT_SWAP_SETTINGS_CHANGED');return null;},begin(){fail('BOT_SWAP_REVIEW_ONLY');},resolve(){fail('BOT_SWAP_REVIEW_ONLY');}}});
  const review=await engine.prepare({payer:original.walletAddress,inputMint:nativeInput?SOL:USDC,outputMint:nativeInput?USDC:SOL,amount:units,slippageBps:50});
  const current=await identity(ownerAccountHash);
  if(current.walletAddress!==original.walletAddress||current.revision!==original.revision||now()>=review.expiresAt)fail('BOT_SWAP_SETTINGS_CHANGED');
  return Object.freeze({stage:'BOT_SWAP_REVIEW_ONLY',walletAddress:original.walletAddress,controlRevision:original.revision,direction,
   inputUnits:review.input,minimumOutputUnits:review.minimum,simulatedOutputUnits:review.simulatedOutput,
   networkFeeLamports:review.fee,accountRentLamports:review.rent,expiresAt:review.expiresAt,slippageBps:50,
   readyForSigning:false,submitted:false});
 }});
}
