import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotWalletTransferClient} from '../lib/bot-wallet-transfer-client.js';
const wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',recipient='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',id='d'.repeat(64);
function fixture(){let clock=Date.now(),token='a'.repeat(64),confirms=0,wrong=false;const client=createBotWalletTransferClient({now:()=>clock,readSessionToken:()=>token,fetchImpl:async(url,o)=>{const b=JSON.parse(o.body);let v;
 if(b.action==='botTransferPrepare')v={stage:'BOT_TRANSFER_REVIEW',walletAddress:wallet,recipient:wrong?wallet:recipient,mint:'SOL',decimals:9,id,inputUnits:'80000000',networkFeeLamports:'5000',accountRentLamports:'0',expiresAt:clock+60000,submitted:false};
 else{confirms++;v={walletAddress:wallet,id,state:'UNKNOWN',signature:'1'.repeat(64),readyForRetry:false};}return Response.json({ok:true,botSwap:v});}});
 return {client,confirms:()=>confirms,expire:()=>{clock+=60001;},changeSession:()=>{token='b'.repeat(64);},wrong:()=>{wrong=true;}};
}
test('Send requires the exact reviewed object, explicit consent and unchanged session',async()=>{
 const f=fixture(),r=await f.client.prepare(wallet,recipient,'SOL','0.08');assert.equal(f.confirms(),0);
 await assert.rejects(f.client.confirm({...r},true));await assert.rejects(f.client.confirm(r,false));assert.equal(f.confirms(),0);
 await f.client.confirm(r,true);assert.equal(f.confirms(),1);await assert.rejects(f.client.confirm(r,true));assert.equal(f.confirms(),1);
 for(const kind of ['expire','changeSession']){const g=fixture(),v=await g.client.prepare(wallet,recipient,'SOL','0.08');g[kind]();await assert.rejects(g.client.confirm(v,true));assert.equal(g.confirms(),0);}
});
test('a mismatched recipient response never creates an approvable send',async()=>{const f=fixture();f.wrong();await assert.rejects(f.client.prepare(wallet,recipient,'SOL','0.08'));assert.equal(f.confirms(),0);});
