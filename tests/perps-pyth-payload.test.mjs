import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {decodePerpsPythPayload,readSignedPerpsPythPayload,requirePerpsPythFeed} from '../lib/perps-pyth-payload.js';
import {PERPS_PYTH_LAZER,decodePerpsPythStorage} from '../lib/perps-pyth-storage.js';
import {pythStorageFixture} from './helpers/perps-pyth-storage-fixture.mjs';
import {pythPayloadFixture} from './helpers/perps-pyth-payload-fixture.mjs';
const now=1802865600,keys=['Ed25519SigVerify111111111111111111111111111','test-doves'];
// Test data from Pyth's primary standard.rs parse_payload test, not a financial
// transaction. Covers all 13 currently published standard payload properties.
const primary='75d3c7934077d115064b06000301010000000d009032fc171b060000014e3a0cff1a06000002bcda8a211b06000003120004f8ff05fc0b7159000000000600070008000900000aa06616362e0600000b804f93312e0600000c014077d115064b0600';
test('standard little-endian payload matches Pyth primary vector across all 13 property variants',()=>{
 const p=decodePerpsPythPayload(Buffer.from(primary,'hex').toString('base64')),v=p.feeds[0].properties;
 assert.equal(p.timestampUs,'1771339368200000');assert.equal(p.channelId,3);assert.equal(p.feeds[0].feedId,1);
 assert.deepEqual(v,{0:'6713436287632',1:'6713017907790',2:'6713596631740',3:18,4:-8,5:'1500580860',6:null,7:null,8:null,9:0,10:'6795545700000',11:'6795470000000',12:'1771339368200000'});
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.feeds)&&Object.isFrozen(v));
});
test('truncation, duplicates, bad magic/counts/tags/options and trailing or noncanonical bytes cannot be price evidence',()=>{
 const valid=pythPayloadFixture({timestampUs:BigInt(now)*1000000n});
 for(let n=0;n<valid.length;n++)assert.throws(()=>decodePerpsPythPayload(valid.subarray(0,n).toString('base64')));
 for(const mode of ['magic','zeroTime','zeroFeeds','manyFeeds','zeroId','zeroProps','manyProps','tag','duplicateProperty','trailing','base64','duplicateFeed','option']){
  let b=Buffer.from(valid);
  if(mode==='magic')b[0]^=1;
  if(mode==='zeroTime')b.fill(0,4,12);
  if(mode==='zeroFeeds')b[13]=0;
  if(mode==='manyFeeds')b[13]=33;
  if(mode==='zeroId')b.writeUInt32LE(0,14);
  if(mode==='zeroProps')b[18]=0;
  if(mode==='manyProps')b[18]=14;
  if(mode==='tag')b[19]=255;
  if(mode==='duplicateProperty'){b=Buffer.concat([b.subarray(0,28),b.subarray(19,28)]);b[28]=0;}
  if(mode==='trailing')b=Buffer.concat([b,Buffer.from([0])]);
  if(mode==='duplicateFeed'){b=Buffer.concat([b,b.subarray(14)]);b[13]=2;}
  if(mode==='option'){b=Buffer.concat([b.subarray(0,28),Buffer.from([6,2])]);}
  assert.throws(()=>decodePerpsPythPayload(b.toString('base64')+(mode==='base64'?'\n':'')),mode);
 }
});
function signedFixture(payload=pythPayloadFixture({timestampUs:BigInt(now-1)*1000000n})){
 const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32),ed=Buffer.alloc(16),data=Buffer.alloc(118+payload.length);ed[0]=1;
 for(const [at,n]of [[2,16],[4,1],[6,80],[8,1],[10,114],[12,payload.length],[14,1]])ed.writeUInt16LE(n,at);
 Buffer.from('cb3b5fb0ec154999','hex').copy(data);data.writeUInt32LE(102+payload.length,8);data.writeUInt32LE(2182742457,12);
 sign(null,payload,pair.privateKey).copy(data,16);key.copy(data,80);data.writeUInt16LE(payload.length,112);payload.copy(data,114);data[117+payload.length]=1;
 return {instructions:[{program:0,accounts:[],dataBase64:ed.toString('base64')},{program:1,accounts:[],dataBase64:data.toString('base64')}],storage:decodePerpsPythStorage(PERPS_PYTH_LAZER.storage,pythStorageFixture([{publicKeyHex:key.toString('hex'),expiresAtSeconds:now+100}]))};
}
test('signed payload requires exact valid cryptography, current native signer trust and bounded freshness before feed use',()=>{
 const f=signedFixture(),p=readSignedPerpsPythPayload(f.instructions,keys,1,{storage:f.storage,nowSeconds:now});
 assert.equal(requirePerpsPythFeed(p,1,0).priceUnits,'10000000000');
 for(const [id,ch]of [[2,0],[1,1]])assert.throws(()=>requirePerpsPythFeed(p,id,ch));
 assert.throws(()=>readSignedPerpsPythPayload(f.instructions,keys,1,{storage:{...f.storage},nowSeconds:now}));
 for(const timestamp of [BigInt(now-31)*1000000n,BigInt(now+2)*1000000n+1n]){
  const bad=signedFixture(pythPayloadFixture({timestampUs:timestamp}));
  assert.throws(()=>readSignedPerpsPythPayload(bad.instructions,keys,1,{storage:bad.storage,nowSeconds:now}),/STALE_PERPS_PYTH_PAYLOAD/);
 }
 const data=Buffer.from(f.instructions[1].dataBase64,'base64');data[134]^=1;f.instructions[1].dataBase64=data.toString('base64');
 assert.throws(()=>readSignedPerpsPythPayload(f.instructions,keys,1,{storage:f.storage,nowSeconds:now}));
});
test('spot feed cannot substitute zero or negative prices, missing exponent or out-of-range scaling',()=>{
 for(const options of [{priceUnits:'0'},{priceUnits:'-1'},{exponent:1},{exponent:-19}]){
  const p=decodePerpsPythPayload(pythPayloadFixture({timestampUs:BigInt(now)*1000000n,...options}).toString('base64'));
  assert.throws(()=>requirePerpsPythFeed(p,1,0));
 }
 const b=pythPayloadFixture({timestampUs:BigInt(now)*1000000n});b[18]=1;
 const p=decodePerpsPythPayload(b.subarray(0,28).toString('base64'));assert.throws(()=>requirePerpsPythFeed(p,1,0));
});
