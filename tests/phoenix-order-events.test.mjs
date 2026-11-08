import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {decodePhoenixOrderEvents} from '../lib/phoenix-order-events.js';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {officialPhoenixOrderEvents as f} from './helpers/phoenix-official-order-events.mjs';
import {phoenixTestKey} from './helpers/phoenix-chain-account-fixture.mjs';
function sample(){return {
 staticAccountKeys:[ID.program],outerInstructionIndex:5,
 innerInstructions:[{index:5,instructions:[f.lengthsBase64,f.logBase64].map(s=>({programIdIndex:0,data:bs58.encode(Buffer.from(s,'base64'))}))}],
 expected:{...f,orderPacketBase64:Buffer.from(f.orderBase64,'base64').subarray(8).toString('base64'),clientOrderId:'0'}
};}
function editLog(args,fn){const ix=args.innerInstructions[0].instructions[1],b=Buffer.from(bs58.decode(ix.data));fn(b);ix.data=bs58.encode(b);}
test('official published native transaction decodes exact packet, fill, fee and post-position',()=>{
 const p=decodePhoenixOrderEvents(sample());assert.equal(p.readyForSigning,false);assert.equal(p.outcome,'FILLED');assert.equal(p.eventCount,9);
 assert.equal(p.summary.trader,f.traderAddress);assert.equal(p.summary.side,'SHORT');assert.equal(p.summary.baseLotsFilled,'63650');
 assert.equal(p.summary.quoteLotsFilled,'9967379700');assert.equal(p.summary.feeUnits,'3139725');assert.equal(p.summary.postBaseLots,'-63650');
 assert.equal(p.requiresExactFinalizedTransaction,true);
});
test('another wallet, trader, symbol, market identity, quote precision or order packet never matches',()=>{
 for(const patch of [{walletAddress:phoenixTestKey(99)},{traderAddress:phoenixTestKey(99)},{symbol:'BTC'},{assetId:1},{tickSize:'11'},{baseLotsDecimals:2},{slot:f.slot+1}]){
  const a=sample();a.expected={...a.expected,...patch};assert.throws(()=>decodePhoenixOrderEvents(a));
 }
 const a=sample(),packet=Buffer.from(a.expected.orderPacketBase64,'base64');packet[2]^=1;a.expected.orderPacketBase64=packet.toString('base64');assert.throws(()=>decodePhoenixOrderEvents(a),/PACKET/);
});
test('truncated data, unpaired batches, wrong outer instruction and spoofed program reject',()=>{
 const a=sample();a.innerInstructions[0].instructions.pop();assert.throws(()=>decodePhoenixOrderEvents(a),/UNPAIRED/);
 const b=sample();b.innerInstructions[0].instructions.shift();assert.throws(()=>decodePhoenixOrderEvents(b),/UNPAIRED/);
 const c=sample();editLog(c,b=>{b[b.length-1]^=1;}); // unrelated MarketSummary bytes do not create a fill or alter its values
 assert.equal(decodePhoenixOrderEvents(c).summary.baseLotsFilled,'63650');
 const d=sample();d.innerInstructions[0].instructions[1].data=bs58.encode(Buffer.from(f.logBase64,'base64').subarray(0,100));assert.throws(()=>decodePhoenixOrderEvents(d),/TRUNCATED/);
 const e=sample();e.outerInstructionIndex=4;assert.throws(()=>decodePhoenixOrderEvents(e),/GROUP/);
 const g=sample();g.staticAccountKeys=[phoenixTestKey(99)];assert.throws(()=>decodePhoenixOrderEvents(g),/MISSING/);
 const h=sample();h.innerInstructions.push(h.innerInstructions[0]);assert.throws(()=>decodePhoenixOrderEvents(h),/GROUP/);
});
test('explicit native rejection is nonce-bound and never reported as a fill',()=>{
 const a=sample(),original=Buffer.from(f.logBase64,'base64'),lengths=Buffer.from(f.lengthsBase64,'base64');
 const selected=[];let cursor=16;
 for(let i=0;i<lengths.readUInt32LE(12);i++){const n=lengths.readUInt16LE(16+i*2),b=original.subarray(cursor,cursor+n);if([0,1,44].includes(b[0]))selected.push(b);cursor+=n;}
 const rejection=Buffer.alloc(70);rejection[0]=4;rejection[29]=1;rejection.write('OutsideExecutionPriceBand',38,'ascii');selected.push(rejection);
 const prefix=name=>createHash('sha256').update('global:'+name).digest().subarray(0,8);
 const table=Buffer.alloc(16+selected.length*2);prefix('log_event_lengths').copy(table);table.writeUInt32LE(selected.length,12);selected.forEach((b,i)=>table.writeUInt16LE(b.length,16+i*2));
 const head=Buffer.alloc(16);prefix('log').copy(head);head.writeUInt32LE(selected.length,12);
 a.innerInstructions[0].instructions=[table,Buffer.concat([head,...selected])].map(b=>({programIdIndex:0,data:bs58.encode(b)}));
 assert.equal(decodePhoenixOrderEvents(a).outcome,'REJECTED');a.expected.clientOrderId='1';assert.throws(()=>decodePhoenixOrderEvents(a),/REJECTION/);
});
