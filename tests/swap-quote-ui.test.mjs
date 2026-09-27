import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSwapUnits} from '../lib/swap-quote-ui.js';
test('swap amounts retain precision without floating point', () => {
  assert.equal(exactSwapUnits('0.000000001',9),'1');
  assert.equal(exactSwapUnits('123.456789',6),'123456789');
  for (const value of ['0','-1','1e3','0.0000001','1,25','NaN']) assert.throws(()=>exactSwapUnits(value,6));
});
