import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {deriveAndroidSolanaSeed} from '../lib/web-wallet-keys.js';
import {sealPortableWalletBackup,openPortableWalletBackup} from '../lib/portable-wallet-backup.js';
import {from64} from '../lib/web-swap-policy.js';
import {swapFixture} from './fixtures/web-swap.mjs';
test('isolated web wallet recovers, reviews, explicitly signs a mock swap and locks without leaking backup or password',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const password='Public browser fixture, never funded',entropy=new Uint8Array(32),seed=await deriveAndroidSolanaSeed(entropy),address=bs58.encode(ed25519.getPublicKey(seed));seed.fill(0);
 const backup=await sealPortableWalletBackup(entropy,password),f=await swapFixture(address,{nativeInput:false});
 const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,sends=0;const errors=[],requests=[];
 const target=process.env.JAMDDMAJ_WALLET_BROWSER_URL||'http://127.0.0.1:'+server.address().port;
 try{
  const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),body=request.postData()||'';requests.push(body);assert.equal(body.includes(password),false);
   if(url.hostname==='solana-rpc.publicnode.com'){if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});const value=JSON.parse(body);let result;if(value.method==='sendTransaction'){sends++;const wire=from64(value.params[0]);assert.equal(ed25519.verify(wire.subarray(1,65),wire.subarray(65),bs58.decode(address)),true);result=bs58.encode(wire.subarray(1,65));}else if(value.method==='getSignatureStatuses')result={context:{slot:100},value:[{slot:99,confirmationStatus:'finalized',confirmations:null,err:null}]};else result=await f.rpc(value.method,value.params);return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{jsonrpc:'2.0',id:value.id,result}});}
   if(url.pathname==='/api/swap-build'){f.preparation.receivedAt=Date.now();f.preparation.expiresAt=f.preparation.receivedAt+15000;return route.fulfill({json:{ok:true,preparation:f.preparation}});}
   if(url.pathname==='/api/solana-portfolio')return route.fulfill({json:{ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),sol:{amount:.14},tokens:[{mint:f.intent.inputMint,amount:5}]}});
   if(url.origin!==target)throw Error('Unexpected external request');return route.continue();
  });
  await page.goto(target+'/wallet-web.html?address='+address);
  assert.equal(await page.locator('#swap-review').isDisabled(),true);
  await page.locator('#wallet-backup').setInputFiles({name:'public-fixture.jamdwallet',mimeType:'application/octet-stream',buffer:Buffer.from(backup)});
  await page.locator('#wallet-password').fill(password);await page.locator('#wallet-unlock').click();await page.locator('#wallet-status').filter({hasText:'Desbloqueada:'}).waitFor();
  assert.equal(await page.locator('#wallet-password').inputValue(),'');await page.locator('#swap-value').fill('10');await page.locator('#swap-slippage').selectOption('100');await page.locator('#swap-review').click();await page.locator('#swap-summary').filter({hasText:'Recibes al menos'}).waitFor();
  assert.equal(await page.locator('#swap-confirm').isDisabled(),true);assert.equal(sends,0);await page.locator('#swap-approve').check();await page.locator('#swap-confirm').click();await page.locator('#swap-status').filter({hasText:'Enviada a Solana'}).waitFor();assert.equal(sends,1);
  await page.locator('#swap-pending').click();await page.locator('#swap-status').filter({hasText:'Confirmada definitivamente'}).waitFor();assert.equal(sends,1);
  await page.locator('#wallet-lock').click();assert.equal(await page.locator('#swap-review').isDisabled(),true);assert.equal(await page.locator('#swap-confirm').isDisabled(),true);assert.deepEqual(errors,[]);
  const storage=await page.evaluate(()=>({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage)}));assert.equal(JSON.stringify(storage).includes(password),false);assert.equal(requests.some(v=>v.includes(toHex(backup))||v.includes(Buffer.from(backup).toString('base64'))),false);
  await page.locator('summary').click();await page.locator('#wallet-password').fill(password);await page.locator('#wallet-create-consent').check();const downloaded=page.waitForEvent('download');await page.locator('#wallet-create').click();const download=await downloaded,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const created=Buffer.concat(chunks);assert.equal(created.length,84);
  const recovered=await openPortableWalletBackup(created,password);let derived;try{derived=await deriveAndroidSolanaSeed(recovered);assert.equal(await page.locator('#wallet-address').inputValue(),bs58.encode(ed25519.getPublicKey(derived)));assert.notEqual(await page.locator('#wallet-address').inputValue(),address);assert.equal(await page.locator('#swap-review').isDisabled(),true);}finally{recovered.fill(0);derived?.fill(0);created.fill(0);}
 }finally{await browser?.close();await new Promise(r=>server.close(r));backup.fill(0);}
});
function toHex(bytes){return Buffer.from(bytes).toString('hex');}
