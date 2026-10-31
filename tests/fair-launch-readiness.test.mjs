import test from 'node:test';
import assert from 'node:assert/strict';
import endpoint from '../api/fair-launch-status.js';
import {fairLaunchReadinessSummary} from '../lib/fair-launch-readiness.js';
test('public readiness separates documentary records from verification and never exposes references',async()=>{
 const r=fairLaunchReadinessSummary({schemaVersion:1,network:'solana-mainnet-beta',requirements:{independentAudit:{status:'approved',auditor:'PRIVATE_NAME',reportUrl:'PRIVATE_URL'}}});
 assert.equal(r.documentaryOnly,true);assert.equal(r.ready,false);assert.equal(r.total,7);assert.equal(r.completed,1);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
 const response=await endpoint.fetch(new Request('https://www.jamddmaj.com/api/fair-launch-status'));const current=await response.json();assert.equal(current.ready,false);assert.equal(current.completed,1);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await endpoint.fetch(new Request('https://www.jamddmaj.com/api/fair-launch-status',{method:'POST'}))).status,405);
});
