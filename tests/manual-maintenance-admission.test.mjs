import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStoppedServiceRecord,SOURCE_SCHEMA,OLD_WORKER_HASH,UNITS} from '../ops/manual-13820-admission.js';
const at=1794067200000;
const fixture=()=>({stage:'MANUAL_13820_STOPPED_SERVICES',createdAt:at,journalSchema:SOURCE_SCHEMA,workerHash:OLD_WORKER_HASH,units:UNITS.map(name=>({name,state:'inactive',mainPid:0}))});
test('maintenance record binds exact old code/schema and all three stopped units',()=>{
 assert.doesNotThrow(()=>validateStoppedServiceRecord(fixture(),at));
 assert.doesNotThrow(()=>validateStoppedServiceRecord(fixture(),at+60000));
});
test('missing, active, renamed, incomplete or still-running services cannot pass admission',()=>{
 for(const change of [v=>v.units.pop(),v=>v.units.reverse(),v=>{v.units[0].state='active';},v=>{v.units[1].mainPid=42;},v=>{v.units[2].name='other';},v=>{v.units[0].extra=true;}]){
  const value=fixture();change(value);assert.throws(()=>validateStoppedServiceRecord(value,at));
 }
 for(const value of [null,true,{}, {...fixture(),extra:true},{...fixture(),workerHash:'0'.repeat(64)},{...fixture(),journalSchema:'0'.repeat(64)}])assert.throws(()=>validateStoppedServiceRecord(value,at));
});
test('future, stale, malformed and non-integer maintenance timestamps are refused',()=>{
 assert.throws(()=>validateStoppedServiceRecord(fixture(),at-1));
 assert.throws(()=>validateStoppedServiceRecord(fixture(),at+60001));
 for(const createdAt of [String(at),NaN,Infinity,at+0.5])assert.throws(()=>validateStoppedServiceRecord({...fixture(),createdAt},at));
});
