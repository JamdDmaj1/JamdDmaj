import test from 'node:test';
import assert from 'node:assert/strict';
import {sendPercentageAmount} from '../lib/wallet-send-sizing.js';
test('percentage sizing rounds down, respects token precision, and retains provisional SOL reserve',()=>{
 assert.equal(sendPercentageAmount(13.064027,6,100),'13.064027');
 assert.equal(sendPercentageAmount(13.064027,6,25),'3.266006');
 assert.equal(sendPercentageAmount(0.06,9,100,{native:true}),'0.055000000');
 assert.equal(sendPercentageAmount(0.005,9,100,{native:true}),null);
 assert.equal(sendPercentageAmount(123,0,25),'30');
 assert.equal(sendPercentageAmount(805977.175052,6,50),'402988.587526');
 assert.equal(sendPercentageAmount(100,6,37),'37.000000');
 assert.equal(sendPercentageAmount(1,6,0),null);
 for(const [n,d,p]of [[NaN,6,100],[-1,6,25],[0,6,100],[1,undefined,100],[1,19,25],[1,6,101],[1e10,9,100]])assert.equal(sendPercentageAmount(n,d,p),null);
});
