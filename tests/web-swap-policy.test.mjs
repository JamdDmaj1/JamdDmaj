import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWebSwapPreparation,SWAP_IDS as I,to64,associated} from '../lib/web-swap-policy.js';
import {inspectSwapEvidence} from '../lib/web-swap-evidence.js';
import {swapFixture,little,token,encoded} from './fixtures/web-swap.mjs';
import bs58 from 'bs58';
const payer='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy'; // Public identity only; never signs.
test('v0 compilation resolves only validated table entries and keeps payer and invoked programs static',async()=>{
 const f=await swapFixture(payer),legacy=await inspectWebSwapPreparation(f.preparation,f.intent);
 const table={address:bs58.encode(new Uint8Array(32).fill(77)),addresses:[legacy.source,legacy.destination,f.intent.inputMint,f.intent.outputMint]};
 const v0=await inspectWebSwapPreparation(f.preparation,f.intent,Date.now(),[table]);assert.equal(v0.message[0],128);assert.ok(v0.message.length<legacy.message.length);assert.equal(v0.keys[0].address,payer);assert.equal(v0.keys.find(k=>k.address===legacy.source).writable,true);
 const evidence=await inspectSwapEvidence(v0,f.rpc);assert.equal(evidence.fee,'5000');
});
for(const nativeInput of [true,false])test('SOL USDC policy and effects agree for '+(nativeInput?'SOL input':'USDC input'),async()=>{
 const f=await swapFixture(payer,{nativeInput}),c=await inspectWebSwapPreparation(f.preparation,f.intent);
 const result=await inspectSwapEvidence(c,f.rpc);assert.equal(result.output,f.preparation.outAmount);assert.equal(result.fee,'5000');assert.equal(c.message[0],1);assert.ok(c.message.length+65<=1232);assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('rejects asset replacement, arbitrary transfers, delegates, mismatched minimums and expired reviews',async()=>{
 const f=await swapFixture(payer);
 for(const mutation of [p=>p.inputMint=I.USDC,p=>p.minimumOut='1',p=>p.expiresAt=Date.now()-1,p=>p.instructions.push({programId:I.SYSTEM,accounts:[],data:to64(little(2,4))}),p=>p.instructions.find(i=>i.programId===I.SYSTEM).accounts[1].pubkey=payer]){
  const p=structuredClone(f.preparation);mutation(p);await assert.rejects(inspectWebSwapPreparation(p,f.intent));
 }
 const c=await inspectWebSwapPreparation(f.preparation,f.intent);
 f.after[2].data[0]=to64(new Uint8Array(165));await assert.rejects(inspectSwapEvidence(c,f.rpc));
});
test('simulation failures, excess SOL debit and stale bank evidence never become approval',async()=>{
 for(const kind of ['debit','simulation','network','fee']){
  const f=await swapFixture(payer),c=await inspectWebSwapPreparation(f.preparation,f.intent);
  const rpc=async(method,params)=>{const v=await f.rpc(method,params);if(kind==='network'&&method==='getGenesisHash')return 'devnet';if(kind==='fee'&&method==='getFeeForMessage')return {...v,value:1000001};if(method==='simulateTransaction'){if(kind==='debit')v.value.accounts[0].lamports--;if(kind==='simulation')v.value.err={InstructionError:[1,'failure']};}return v;};
  await assert.rejects(inspectSwapEvidence(c,rpc));
 }
});
test('expired blockhash and stale simulation slots cannot authorize a swap',async()=>{
 for(const kind of ['blockhash','slot']){const f=await swapFixture(payer),c=await inspectWebSwapPreparation(f.preparation,f.intent);await assert.rejects(inspectSwapEvidence(c,async(m,p)=>{const v=await f.rpc(m,p);if(kind==='blockhash'&&m==='isBlockhashValid')return {...v,value:false};if(kind==='slot'&&m==='simulateTransaction')return {...v,context:{slot:99}};return v;}));}
});
test('intermediate accounts must start and end empty and their rent is explicitly reviewed',async()=>{
 const f=await swapFixture(payer),mint=bs58.encode(new Uint8Array(32).fill(31)),address=await associated(payer,mint);
 const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
 f.preparation.instructions.splice(1,0,{programId:I.ATA,data:'AQ==',accounts:[meta(payer,true,true),meta(address,true),meta(payer),meta(mint),meta(I.SYSTEM),meta(I.TOKEN)]});
 f.preparation.instructions.find(i=>i.programId===I.JUPITER).accounts.push(meta(address,true),meta(mint));
 const data=new Uint8Array(82);data[44]=6;data[45]=1;f.before.set(mint,{owner:I.TOKEN,executable:false,lamports:f.rent,data:encoded(data)});f.before.set(address,null);
 f.after.push(token(payer,mint,0n));f.after[0].lamports-=f.rent;
 const c=await inspectWebSwapPreparation(f.preparation,f.intent),e=await inspectSwapEvidence(c,f.rpc);assert.equal(e.rent,String(f.rent*2));
 f.before.set(address,token(payer,mint,1n));await assert.rejects(inspectSwapEvidence(c,f.rpc));f.before.set(address,null);f.after[3]=token(payer,mint,1n);await assert.rejects(inspectSwapEvidence(c,f.rpc));
});
test('public RPC account reads are batched to at most ten without dropping state checks',async()=>{
 const f=await swapFixture(payer),route=f.preparation.instructions.find(i=>i.programId===I.JUPITER);
 for(let i=40;i<48;i++)route.accounts.push({pubkey:bs58.encode(new Uint8Array(32).fill(i)),isSigner:false,isWritable:true});
 const c=await inspectWebSwapPreparation(f.preparation,f.intent);await inspectSwapEvidence(c,f.rpc);
 const reads=f.calls.filter(v=>v.method==='getMultipleAccounts');assert.ok(reads.length>=2);assert.ok(reads.every(r=>r.params[0].length<=10));
});
