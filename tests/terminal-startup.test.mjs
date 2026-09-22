import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for (const native of [false, true]) test(`startup price request has initialized API root (native=${native})`, async () => {
  const source=readFileSync(new URL('../private-simulator-ui.js',import.meta.url),'utf8');
  const declaration=source.match(/^const terminalApiRoot = .+;$/m)?.[0];
  assert.ok(declaration);
  assert.ok(source.indexOf(declaration)<source.indexOf('let account='), 'API root must initialize before UI startup');
  const request=source.match(/^async function catalogPrices\(.+$/m)?.[0];
  let url;
  const context=vm.createContext({window:native?{Capacitor:{isNativePlatform:()=>true}}:{},AbortSignal,
    fetch:async value=>{url=value;return {ok:true,json:async()=>({bitcoin:{usd:123}})};}});
  const result=await vm.runInContext(`${declaration}\n${request}\ncatalogPrices(['bitcoin']);`,context);
  assert.equal(result.bitcoin.usd,123);
  assert.equal(url,(native?'https://www.jamddmaj.com':'')+'/api/token-prices?ids=bitcoin');
});

test('manual terminal initializes API root before creating UI',()=>{
  const source=readFileSync(new URL('../manual-order-review-ui.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('const terminalApiRoot =')<source.indexOf('const panel='));
});
