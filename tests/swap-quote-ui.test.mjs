import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSwapUnits, setupSwapQuote,futuresDraftSummary} from '../lib/swap-quote-ui.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';

test('unsupported chart does not block the explicitly separate native SOL USDC swap',()=>{
 const nodes=[],events=[];
 const doc={createElement(tag){const n={tag,children:[],value:'',append(...v){this.children.push(...v);},setAttribute(){},addEventListener(){}};nodes.push(n);return n;},dispatchEvent:e=>events.push(e),defaultView:{Event}};
 const ui=setupSwapQuote(doc.createElement('main'),'en',doc);
 const open=nodes.find(n=>n.textContent==='Swap SOL ↔ USDC in my wallet');
 ui.selectAsset({symbol:'XRP'});assert.equal(open.disabled,false);
 open.onclick();assert.equal(events.filter(e=>e.type==='jamd-wallet-open-swap').length,0);
 selectWalletAccount(doc,{source:'native',address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy'});
 open.onclick();assert.equal(events.filter(e=>e.type==='jamd-wallet-open-swap').length,1);
 assert.equal(nodes.find(n=>n.id==='swap-quote-button').disabled,true);
});
test('order summary separates collateral from leveraged indicative exposure',()=>{
 assert.deepEqual(futuresDraftSummary('20','10'),{margin:20,leverage:10,notional:200});
 for(const [m,l]of [['',3],[-1,3],[20,0],[20,51],[Infinity,3]])assert.equal(futuresDraftSummary(m,l),null);
});
test('swap amounts retain precision without floating point', () => {
  assert.equal(exactSwapUnits('0.000000001',9),'1');
  assert.equal(exactSwapUnits('123.456789',6),'123456789');
  for (const value of ['0','-1','1e3','0.0000001','1,25','NaN']) assert.throws(()=>exactSwapUnits(value,6));
});
function fixture() {
  const nodes = [];
  const doc = { createElement(tag) {
    const node = { tag, children: [], value: '', textContent: '', append(...items) { this.children.push(...items); }, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; } };
    nodes.push(node); return node;
  } };
  const controller=setupSwapQuote(doc.createElement('main'), 'es', doc);
  return {controller, direction: nodes.find(n=>n.id==='swap-direction'),slider:nodes.find(n=>n.type==='range'), amount: nodes.find(n => n.id === 'swap-amount'), button: nodes.find(n => n.id==='swap-quote-button'), status: nodes.find(n => n.id==='swap-status') };
}
test('changing payment token clears the old amount and disables USDC sizing',()=>{
 const ui=fixture();ui.amount.value='20';ui.direction.value='SOL';ui.direction.change();
 assert.equal(ui.amount.value,'');assert.equal(ui.slider.disabled,true);
 assert.match(ui.status.textContent,/no se aplica a SOL/);
});
test('unsupported BTC cannot request an unrelated SOL swap after editing',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error();});
 const ui=fixture();ui.controller.selectAsset({symbol:'BTC'});assert.equal(ui.button.disabled,true);
 ui.amount.value='10';ui.amount.input();assert.equal(ui.button.disabled,true);
 await ui.button.onclick();assert.equal(calls,0);
 ui.controller.selectAsset({symbol:'SOL'});assert.equal(ui.button.disabled,false);
});
test('editing amount discards an older network response', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const ui = fixture(); ui.amount.value = '1'; const pending = ui.button.onclick();
  assert.equal(ui.button.disabled, true);
  ui.amount.value = '2'; ui.amount.input();
  finish(Response.json({ quote: {} })); await pending;
  assert.equal(ui.status.textContent, ''); assert.equal(ui.button.disabled, false);
});
test('unconfigured provider displays unavailable, not zero or a buy button', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const ui = fixture(); ui.amount.value = '1'; await ui.button.onclick();
  assert.match(ui.status.textContent, /no disponible/);
  assert.equal(ui.button.disabled, false);
});
test('expired or mismatched quotes are never displayed', async t => {
  const data = { executable: false, inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', inAmount: '1000000000', outAmount: '1000000', expiresAt: Date.now() - 1 };
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ quote: data }));
  const ui = fixture(); ui.amount.value = '1'; await ui.button.onclick();
  assert.match(ui.status.textContent, /no disponible/);
  mock.mock.mockImplementation(async () => Response.json({ quote: { ...data, expiresAt: Date.now() + 10000, inAmount: '2' } }));
  await ui.button.onclick(); assert.match(ui.status.textContent, /no disponible/);
});
