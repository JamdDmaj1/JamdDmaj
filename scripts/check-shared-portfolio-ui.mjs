// Local browser regression. Public fixture data only; no signing or transactions.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=process.env.JAMD_PLAYWRIGHT_MODULE?require(process.env.JAMD_PLAYWRIGHT_MODULE):require('playwright');
const browser=await chromium.launch({headless:true,...(process.env.JAMD_BROWSER_EXECUTABLE?{executablePath:process.env.JAMD_BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto('http://127.0.0.1:8772/private-simulator.html#lang=es');
 await page.locator('#tab-assets').click();
 await page.evaluate(async()=>{
  const store=await import('/lib/wallet-portfolio-store.js');
  const account={source:'native',name:'JamdDmaj',address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy'};
  store.selectWalletAccount(document,account);
  if(!store.publishWalletPortfolio(document,{ok:true,address:account.address,network:'solana:mainnet',updatedAt:new Date().toISOString(),partial:false,valuationCoverage:1,estimatedValueUsd:23,sol:{amount:0.18,priceUsd:100,valueUsd:18},tokens:[{mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',symbol:'USDC',amount:5,priceUsd:1,valueUsd:5}]},account))throw Error('Fixture rejected');
 });
 assert.match(await page.locator('.wallet-total-usd').innerText(),/23/);
 await page.getByRole('button',{name:'Recibir',exact:true}).click();
 await page.locator('.wallet-receive-qr').waitFor({state:'visible'});
 await page.screenshot({path:'portfolio-mobile-review.png',fullPage:false});
 await page.locator('#tab-futures').click();
 assert.match(await page.locator('.finance-futures-order').innerText(),/5/);
 assert.equal(await page.locator('#jupiter-range-margin').isDisabled(),false);
 await page.locator('.futures-market-picker summary').click();
 await page.locator('.futures-market-picker input').fill('sol');
 await page.locator('.futures-market-picker button').click();
 assert.match(await page.locator('.futures-market-picker summary').innerText(),/SOL/);
 await page.locator('#tab-trade').click();
 const layout=await page.evaluate(()=>{
  const workspace=document.querySelector('.finance-trade-workspace'),swap=workspace.querySelector('.finance-inline-buy'),book=workspace.querySelector('.finance-orderbook');
  const a=workspace.getBoundingClientRect(),b=swap.getBoundingClientRect(),c=book.getBoundingClientRect();
  return {fullSwap:b.width>=a.width-2,bookRight:c.x>a.x,bookAboveSwap:c.y<b.y};
 });
 assert.equal(layout.fullSwap,true);assert.equal(layout.bookRight,true);assert.equal(layout.bookAboveSwap,true);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'Mobile document must not overflow');
 await page.goto('about:blank');
 await page.goto('http://127.0.0.1:8772/private-simulator.html#lang=es&view=trade&symbol=SOL');
 await page.locator('#tab-trade[aria-selected="true"]').waitFor();
 assert.match(await page.locator('.finance-inline-buy h2').innerText(),/SOL/);
 assert.equal(await page.locator('#swap-quote-button').isDisabled(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: built shared portfolio → Assets USD/QR → Futures balance/slider → inline SOL selector; no page errors or mobile overflow.');
}finally{await browser.close();}
