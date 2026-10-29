import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChronologicalValidation} from '../lib/pro-backtest.js';
test('fixed candidate and stressed costs use only holdout rows without modifying source or live settings',()=>{
 const rows=Array.from({length:100},(_,time)=>({time,outcome:'WIN',estimatedRoe:2,candleDecision:'aligned',volumeRatio:time>=70?1.3:0,adx:25}));
 const before=JSON.stringify(rows),result=buildChronologicalValidation(rows);
 assert.equal(result.training.samples,70);assert.equal(result.candidateValidation.samples,30);
 assert.equal(result.stressedCandidateValidation.expectancyRoe,1);
 assert.equal(result.validation.expectancyRoe,2);assert.equal(JSON.stringify(rows),before);
 assert.match(result.candidatePolicy,/Never auto-promote/);
});
