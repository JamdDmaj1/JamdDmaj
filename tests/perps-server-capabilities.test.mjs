import test from 'node:test';
import assert from 'node:assert/strict';
import {checkServerPerpsCapabilities} from '../lib/perps-server-capabilities.js';
const COMPUTE='ComputeBudget111111111111111111111111111111',PERPS='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
const DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e',ED='Ed25519SigVerify111111111111111111111111111';
function fixture({units=100000,price=10001n}={}){
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(units,1);
 const fee=Buffer.alloc(9);fee[0]=3;fee.writeBigUInt64LE(price,1);
 const instruction=(program,data,accounts=[])=>({program,dataBase64:Buffer.from(data).toString('base64'),accounts});
 const envelope={stage:'STRUCTURE_ONLY',readonlyUnsigned:4,staticKeys:['owner','keeper','api',COMPUTE,DOVES,ED,PERPS],instructions:[instruction(3,limit),instruction(3,fee),instruction(4,[1],[1]),instruction(5,[1]),instruction(6,Buffer.from('a47e44b6dfa640b7','hex'))]};
 return {envelope,instruction};
}
test('server bounds explicit compute fee using ceiling integer lamports without authorizing a trade',()=>{
 const {envelope}=fixture(),result=checkServerPerpsCapabilities(envelope);
 assert.equal(result.priorityFeeLamports,'1001');assert.equal(result.computeUnitLimit,'100000');assert.equal(result.readyForSigning,false);
 assert.equal(checkServerPerpsCapabilities(fixture({units:1000000,price:1000000n}).envelope).priorityFeeLamports,'1000000');
});
test('server rejects excessive fees, missing or duplicate compute settings, defaults and late budget changes',()=>{
 for(const config of [{units:0},{units:1400001},{units:1000000,price:1000001n},{price:18446744073709551615n}]){
  assert.throws(()=>checkServerPerpsCapabilities(fixture(config).envelope));
 }
 for(const change of [
  e=>e.instructions.shift(),e=>e.instructions.splice(1,1),e=>e.instructions.unshift(e.instructions[0]),
  e=>e.instructions.push(e.instructions[0]),e=>e.instructions[0].accounts.push(0),
  e=>e.instructions.splice(2)
 ]){const {envelope}=fixture();change(envelope);assert.throws(()=>checkServerPerpsCapabilities(envelope));}
});
test('server rejects writable/signer programs, system transfers and unreviewed program invocation',()=>{
 for(const mutate of [
  e=>e.readonlyUnsigned=3,e=>e.instructions[0].program=0,
  e=>e.staticKeys[6]='11111111111111111111111111111111',
  e=>e.staticKeys[6]='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
 ]){const {envelope}=fixture();mutate(envelope);assert.throws(()=>checkServerPerpsCapabilities(envelope));}
});
test('oracle updates cannot access the payer or run after an opening; Ed25519 has no account authority',()=>{
 for(const mutate of [
  e=>e.instructions[2].accounts=[0],e=>e.instructions[3].accounts=[1],
  e=>e.instructions.push(e.instructions[2]),e=>e.instructions.push(e.instructions[3])
 ]){const {envelope}=fixture();mutate(envelope);assert.throws(()=>checkServerPerpsCapabilities(envelope));}
});
