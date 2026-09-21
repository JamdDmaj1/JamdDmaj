import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MARKETS_CATALOG} from '../lib/markets-catalog.js';
test('Trading catalog contains exactly every Markets asset',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const block=html.match(/const CRYPTO_ASSETS = (\[[\s\S]*?\n      \]);/)[1];
 const ids=[...block.matchAll(/id: "([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(MARKETS_CATALOG.map(a=>a.id),ids);
 assert.equal(MARKETS_CATALOG.filter(a=>a.symbol==='AVAX').length,1);
 assert.ok(MARKETS_CATALOG.length>50);
});
