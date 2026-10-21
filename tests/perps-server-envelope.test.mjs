import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {decodeServerPerpsEnvelope} from '../lib/perps-server-envelope.js';
import {inspectWebPerpsEnvelope} from '../lib/perps-web-envelope.js';
const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
const api=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32);
function fixture({versioned=false,tail=null,readonly=1,keys=null,program=3,accounts=[0],trailing=[]}={}){
 keys=keys||[Buffer.alloc(32,1),Buffer.alloc(32,2),api,Buffer.alloc(32,4)];
 const message=Buffer.concat([Buffer.from(versioned?[128,3,readonly,1,keys.length]:[3,readonly,1,keys.length]),...keys,
  Buffer.alloc(32,5),Buffer.from([1,program,accounts.length,...accounts,1,7]),Buffer.from(versioned?(tail||[0]):[]),Buffer.from(trailing)]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,privateKey),message]);
 return {wire,payer:bs58.encode(keys[0]),encoded:wire.toString('base64')};
}
test('server structurally decodes canonical legacy and v0 partial envelopes without approving signing',()=>{
 for(const versioned of [false,true]){
  const f=fixture({versioned}),value=decodeServerPerpsEnvelope(f.encoded,f.payer);
  assert.equal(value.version,versioned?0:-1);assert.equal(value.readyForSigning,false);assert.equal(value.stage,'STRUCTURE_ONLY');
  assert.equal(value.instructions[0].dataBase64,'Bw==');assert.deepEqual(value.instructions[0].accounts,[0]);
  assert.equal(Object.isFrozen(value.instructions[0].accounts),true);assert.equal(Object.isFrozen(value.staticKeys),true);
 }
});
test('lookup references remain unresolved and bound to canonical table/index metadata',()=>{
 const f=fixture({versioned:true,tail:[1,...Buffer.alloc(32,8),1,9,1,10],accounts:[0,4,5]});
 const value=decodeServerPerpsEnvelope(f.encoded,f.payer);
 assert.equal(value.accountCount,6);assert.deepEqual(value.lookups[0].writable,[9]);assert.deepEqual(value.lookups[0].readonly,[10]);
 assert.equal(value.readyForSigning,false);
});
test('server rejects malformed headers, duplicate keys, lookup aliases, account overflow and extra bytes',()=>{
 const bad=[fixture({readonly:3}),fixture({program:0}),fixture({program:4}),fixture({accounts:[4]}),fixture({trailing:[0]}),
  fixture({keys:[Buffer.alloc(32,1),Buffer.alloc(32,1),api,Buffer.alloc(32,4)]}),
  fixture({versioned:true,tail:[1,...Buffer.alloc(32,8),1,9,1,9]}),
  fixture({versioned:true,tail:[1,...Buffer.alloc(32,8),0,0]})];
 for(const f of bad)assert.throws(()=>decodeServerPerpsEnvelope(f.encoded,f.payer),/INVALID_PERPS_ENVELOPE/);
});
test('server rejects any filled owner/keeper slot, forged API signature, foreign payer or noncanonical encoding',()=>{
 for(const offset of [1,65,129,210]){
  const f=fixture();f.wire[offset]^=1;
  assert.throws(()=>decodeServerPerpsEnvelope(f.wire.toString('base64'),f.payer),/INVALID_PERPS_ENVELOPE/);
 }
 const f=fixture();assert.throws(()=>decodeServerPerpsEnvelope(f.encoded+'\n',f.payer),/INVALID_PERPS_ENVELOPE/);
 assert.throws(()=>decodeServerPerpsEnvelope(f.encoded,bs58.encode(Buffer.alloc(32,9))),/INVALID_PERPS_ENVELOPE/);
});

test('browser structural decoder matches the native server boundary for legacy and v0 without Node shims',()=>{
 for(const options of [{},{versioned:true},{readonly:2},{versioned:true,tail:[1,...Buffer.alloc(32,8),1,9,1,10],accounts:[0,4,5]}]){
  const f=fixture(options);assert.deepEqual(inspectWebPerpsEnvelope(f.encoded,f.payer),decodeServerPerpsEnvelope(f.encoded,f.payer));
 }
 for(const options of [{readonly:3},{program:0},{program:4},{accounts:[4]},{trailing:[0]},{versioned:true,tail:[1,...Buffer.alloc(32,8),1,9,1,9]}]){
  const f=fixture(options);assert.throws(()=>inspectWebPerpsEnvelope(f.encoded,f.payer));
 }
 for(const offset of [0,1,65,129,210]){const f=fixture();f.wire[offset]^=1;assert.throws(()=>inspectWebPerpsEnvelope(f.wire.toString('base64'),f.payer));}
 const f=fixture();assert.throws(()=>inspectWebPerpsEnvelope(f.encoded+'\n',f.payer));assert.throws(()=>inspectWebPerpsEnvelope(f.encoded,bs58.encode(Buffer.alloc(32,9))));
});
