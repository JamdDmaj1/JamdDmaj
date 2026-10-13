import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAutomationEntry,createAutomationControl} from '../lib/automation-risk.js';
const fixture=()=>({limits:{capital:100,loss:10,positions:2},enabled:true,paused:false,now:100000,snapshot:{updatedAt:100000,availableUsd:100,allocatedUsd:0,lossTodayUsd:0,openPositions:0},order:{marginUsd:20,maxLossUsd:5}});
test('activation requires explicit approval and a ready execution integration',()=>{
 const c=createAutomationControl();assert.deepEqual(c.state(),{enabled:false,paused:true});assert.throws(()=>c.activate({explicitApproval:true,executionReady:false}));c.activate({explicitApproval:true,executionReady:true});c.pause();assert.deepEqual(c.state(),{enabled:true,paused:true});c.disable();assert.equal(c.state().enabled,false);assert.equal(createAutomationControl().state().enabled,false);
});
test('preflight rejects stale funds and all configured limits without trading',()=>{
 assert.equal(checkAutomationEntry(fixture()).reason,'PREFLIGHT_ONLY');
 for(const[key,value,reason]of [['availableUsd',1,'INSUFFICIENT_FUNDS'],['allocatedUsd',90,'CAPITAL_LIMIT'],['lossTodayUsd',9,'DAILY_LOSS_LIMIT'],['openPositions',2,'POSITION_LIMIT'],['updatedAt',1,'STALE_ACCOUNT']]){const f=fixture();f.snapshot[key]=value;assert.equal(checkAutomationEntry(f).reason,reason);}
 const f=fixture();f.paused=true;assert.equal(checkAutomationEntry(f).allowed,false);f.paused=false;f.snapshot.availableUsd=NaN;assert.equal(checkAutomationEntry(f).reason,'INVALID_ACCOUNT');
});
