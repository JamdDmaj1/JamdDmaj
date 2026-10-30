import test from 'node:test';
import assert from 'node:assert/strict';
import {priceAlertReached} from '../lib/market-signal-alerts.js';
test('price alert threshold is directional, includes equality and never treats missing prices as zero',()=>{
 assert.equal(priceAlertReached({direction:'above',target:10},10),true);
 assert.equal(priceAlertReached({direction:'above',target:10},9),false);
 assert.equal(priceAlertReached({direction:'below',target:10},9),true);
 for(const n of [null,undefined,NaN,0,-1,'5'])assert.equal(priceAlertReached({direction:'below',target:10},n),false);
});
