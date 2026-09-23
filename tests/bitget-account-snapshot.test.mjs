import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBitgetAccountSnapshot} from '../scripts/bitget-executor.mjs';
test('zero balance remains visible without enabling automatic risk',()=>{
 const s=readBitgetAccountSnapshot([{marginCoin:'USDT',accountEquity:'0',isolatedMaxAvailable:'0'}],'USDT','isolated');
 assert.equal(s.equity,0); assert.equal(s.available,0); assert.equal(s.enabled,false); assert.ok(Date.parse(s.updatedAt));
});
test('balance snapshot uses matching coin and does not invent missing values',()=>{
 assert.equal(readBitgetAccountSnapshot([{marginCoin:'BTC',accountEquity:'5'}],'USDT','isolated'),null);
 assert.equal(readBitgetAccountSnapshot([{marginCoin:'USDT',accountEquity:null}],'USDT','isolated'),null);
 const s=readBitgetAccountSnapshot([{marginCoin:'USDT',accountEquity:'100',available:null}],'USDT','isolated');
 assert.equal(s.available,null);assert.equal(s.equity,100);assert.equal(s.enabled,false);
});
test('live account request precedes auto risk toggle',()=>{
 const source=readFileSync(new URL('../scripts/bitget-executor.mjs',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function fetchBitgetAccountRisk'),source.indexOf('export function readBitgetAccountSnapshot'));
 assert.ok(fn.indexOf('await bitgetRequest')<fn.indexOf('!settings.autoRisk'));
 assert.match(fn,/if \(!settings.autoRisk \|\| policy\?\.autoRisk === false \|\| equity <= 0\) return snapshot/);
});
