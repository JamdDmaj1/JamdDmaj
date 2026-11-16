import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/pro-signals.js',import.meta.url),'utf8');
test('publication requires market cap, liquidity and strength',()=>{
 assert.match(source,/const publicationQuality = Number\(data\.marketCap\) >= 100_000_000/);
 assert.match(source,/Number\(data\.volumeRatio\) >= 2/);
 assert.match(source,/Number\(data\.adx\) >= 20/);
 assert.match(source,/Tokenized equity/);
 assert.match(source,/Tokenized commodity/);
});
