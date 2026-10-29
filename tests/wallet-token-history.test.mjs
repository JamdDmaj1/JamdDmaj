import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenHistoryEntry,summarizeTokenHistory,createTokenHistoryReader} from '../lib/wallet-token-history.js';
const wallet='11111111111111111111111111111111',mint='So11111111111111111111111111111111111111112',sig='1'.repeat(64),usd='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
function fixture(){const balance=(m,a)=>({owner:wallet,mint:m,uiTokenAmount:{amount:String(a),decimals:6}});return{blockTime:1700000000,transaction:{signatures:[sig],message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:[{programId:'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'}]}},meta:{err:null,preTokenBalances:[balance(mint,0),balance(usd,10000000)],postTokenBalances:[balance(mint,2000000),balance(usd,4000000)]}};}
test('prices observed USDC swap, separates transfer, fails closed and deduplicates',()=>{
 const tx=fixture(),e=tokenHistoryEntry(tx,wallet,mint,sig);assert.equal(e.kind,'buy');assert.equal(e.quantity,2);assert.equal(e.totalUsdc,6);assert.equal(e.priceUsdc,3);
 assert.deepEqual(summarizeTokenHistory([e,e]),{buys:1,sells:0,spentUsdc:6,averageUsdc:3});
 tx.transaction.message.instructions=[];assert.equal(tokenHistoryEntry(tx,wallet,mint,sig).kind,'in');
 tx.meta.err={bad:true};assert.equal(tokenHistoryEntry(tx,wallet,mint,sig),null);
 assert.equal(tokenHistoryEntry(fixture(),'bad',mint,sig),null);assert.equal(tokenHistoryEntry(fixture(),wallet,mint,'2'.repeat(64)),null);
});
test('reader only uses read RPC methods and binds results to wallet and mint',async()=>{
 const methods=[],reader=createTokenHistoryReader(async(url,opts)=>{const req=JSON.parse(opts.body);methods.push(req.method);const result=req.method==='getGenesisHash'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':req.method==='getSignaturesForAddress'?[{signature:sig,err:null,confirmationStatus:'finalized'}]:fixture();return Response.json({jsonrpc:'2.0',id:req.id,result});});
 const r=await reader(wallet,mint,null,new AbortController().signal);assert.equal(r.entries.length,1);assert.equal(r.wallet,wallet);assert.equal(r.mint,mint);assert.equal(r.before,null);assert.deepEqual(methods,['getGenesisHash','getSignaturesForAddress','getTransaction']);
});
