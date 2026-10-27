import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PERPS_PLATFORM_FEE as FEE} from '../lib/perps-platform-fee.js';
import {compileRecipientSetupMessage} from '../lib/fee-recipient-setup-protocol.js';
test('compiled operator page discovers mocked Phantom, renders exact costs and never signs or posts on prepare',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const target='http://127.0.0.1:'+server.address().port;
 const at=Date.now(),blockhash=bs58.encode(new Uint8Array(32).fill(8)),{destination,message}=await compileRecipientSetupMessage(blockhash);
 const packet={stage:'UNSIGNED_FEE_RECIPIENT_USDC_SETUP',network:'solana-mainnet',owner:FEE.recipient,mint:FEE.mint,destination,payer:FEE.recipient,
  preparedAt:at,reviewExpiresAt:at+60000,observedSlot:100,blockhash,lastValidBlockHeight:200,operatorBalanceLamports:'5000000',rentReserveLamports:'1488440',networkFeeLamports:'5000',estimatedTotalLamports:'1493440',
  serializedTxBase64:Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]).toString('base64'),messageSha256:createHash('sha256').update(message).digest('hex'),operation:'CREATE_ASSOCIATED_USDC_ACCOUNT_IDEMPOTENT',usdcTransferredUnits:'0',requiresFreshWalletReview:true,readyForSigning:false,signed:false,submitted:false};
 let browser;try{
  const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],methods=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({address,key})=>{
   window.setupSignCalls=0;const account={address,publicKey:new Uint8Array(key),chains:['solana:mainnet'],features:['solana:signTransaction']};
   const wallet={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:['legacy'],signTransaction:async()=>{window.setupSignCalls++;throw Error('Signing forbidden in browser inspection');}}}};
   window.addEventListener('wallet-standard:app-ready',e=>e.detail.register(wallet));
  },{address:FEE.recipient,key:[...bs58.decode(FEE.recipient)]});
  await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/api/fee-recipient-setup'){methods.push(request.method());assert.equal(request.method(),'GET');return route.fulfill({json:{ok:true,result:packet}});}
   if(url.origin!==target)return route.abort();return route.continue();
  });
  await page.goto(target+'/fee-recipient-setup.html');await page.locator('#connect').click();await page.locator('#wallet-status').filter({hasText:'Phantom conectada'}).waitFor();
  assert.equal(await page.locator('#flow-version').innerText(),'Asistente 2026.10.27.3');
  await page.locator('#prepare').click();await page.locator('#summary').filter({hasText:'0.00149344 SOL'}).waitFor();
  assert.equal(await page.locator('#confirm').isDisabled(),true);await page.locator('#consent').check();assert.equal(await page.locator('#confirm').isDisabled(),false);
  assert.equal(await page.evaluate(()=>window.setupSignCalls),0);assert.deepEqual(methods,['GET']);assert.deepEqual(errors,[]);
  await page.screenshot({path:'.perps-build/fee-recipient-setup-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'.perps-build/fee-recipient-setup-mobile.png',fullPage:true});
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
