import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFinancePolish} from '../lib/finance-polish.js';
function styles(){let sheet;applyFinancePolish({createElement:()=>({}),head:{append(value){sheet=value;}},getElementById:()=>null},'en');return sheet.textContent;}

test('Trade depth stays in document flow without changing Futures positioning',()=>{
 const css=styles(),rule=css.match(/\.finance-trade-workspace \.finance-orderbook\{([^}]*position:[^}]*)\}/)?.[1];
 assert.ok(rule);assert.match(rule,/(?:^|;)position:static(?:;|$)/);assert.match(rule,/(?:^|;)top:auto(?:;|$)/);
 assert.doesNotMatch(css,/\.finance-trade-workspace[^{}]*\.finance-orderbook\{[^}]*position:(?:sticky|fixed)/);
 assert.doesNotMatch(css,/\.finance-futures-workspace[^{}]*\.finance-orderbook\{[^}]*position:/);
});

test('Trade book scrolls with the page without overlapping purchase controls on mobile and desktop',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
 try{for(const width of [430,1280]){
  const page=await browser.newPage({viewport:{width,height:780},reducedMotion:'reduce'});
  await page.setContent(`<style>body{margin:0}main{margin:auto;max-width:1200px}.finance-trade-workspace{display:grid;gap:14px}#chart{height:260px}#book{height:460px;box-sizing:border-box}#buy{height:600px}.tail{height:1500px}${styles()}</style><main><div style="height:180px"></div><section class="finance-trade-workspace"><div id="chart">Chart</div><aside id="book" class="finance-orderbook">Order book</aside><section id="buy" class="finance-inline-buy">Purchase controls</section></section><div class="tail"></div></main>`);
  const inspect=()=>page.evaluate(()=>{const book=document.querySelector('#book'),b=book.getBoundingClientRect(),form=document.querySelector('#buy').getBoundingClientRect();return {top:b.top,bottom:b.bottom,formTop:form.top,position:getComputedStyle(book).position,scroll:scrollY};});
  const before=await inspect();await page.evaluate(()=>scrollTo(0,300));const after=await inspect();
  assert.equal(after.position,'static');assert.ok(Math.abs(before.top-after.top-(after.scroll-before.scroll))<1,`viewport ${width}: book must move with page`);
  assert.ok(after.bottom<=after.formTop,`viewport ${width}: book must not cover purchase controls`);
  await page.evaluate(()=>{document.querySelector('.finance-trade-workspace').className='finance-futures-workspace';});
  assert.equal((await inspect()).position,'static');await page.close();
 }}finally{await browser.close();}
});
