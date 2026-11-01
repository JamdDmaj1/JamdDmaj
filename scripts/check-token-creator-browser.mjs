// Fully intercepted browser rehearsal: never contacts Solana or signs for a user.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {getTransactionDecoder,getBase58Decoder} from '@solana/kit';
import {chromium} from 'file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
await build({stdin:{contents:"export {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,partiallySignTransactionWithSigners} from '@solana/kit';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',outfile:'.perps-build/token-fixture-sdk.js'});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[];let submittedWire,nameBlocked=true,nameUnavailable=true;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='www.jamddmaj.com'&&u.pathname==='/api/token-name-check'){
   const name=u.searchParams.get('name'),symbol=u.searchParams.get('symbol');
   if(nameUnavailable)return route.fulfill({status:503,json:{error:{code:'TOKEN_NAME_LOOKUP_UNAVAILABLE'}}});
   return route.fulfill({json:{network:'solana:mainnet',name,symbol,checkedAt:Date.now(),expiresAt:Date.now()+120000,status:nameBlocked?'duplicate':'no-indexed-match',matches:nameBlocked?[{mint:'So11111111111111111111111111111111111111112',name,symbol}]:[],globalUniquenessGuaranteed:false}});
  }
  if(u.hostname==='solana-rpc.publicnode.com'){
   const q=JSON.parse(route.request().postData());calls.push(q.method);let result;
   if(q.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(q.method==='getMinimumBalanceForRentExemption')result=2039280;
   else if(q.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};
   else if(q.method==='simulateTransaction')result={context:{slot:1},value:{err:null,fee:10600,preBalances:[1000000000],postBalances:[990000000]}};
   else if(q.method==='sendTransaction'){submittedWire=q.params[0];const tx=getTransactionDecoder().decode(Buffer.from(submittedWire,'base64'));result=getBase58Decoder().decode(Object.values(tx.signatures)[0]);}
   else if(q.method==='getSignatureStatuses')result={context:{slot:1},value:[{err:null,confirmationStatus:'finalized'}]};
   else if(q.method==='getTransaction'){const r=await page.evaluate(()=>JSON.parse(localStorage.getItem('jamd.tokenCreator.mainnet.pending.v1')));result={slot:1,transaction:[submittedWire,'base64'],meta:{err:null,postTokenBalances:[{mint:r.mint,owner:r.owner,uiTokenAmount:{amount:'100000000000000',decimals:6}}]}};}
   else throw Error('Forbidden RPC '+q.method);
   return route.fulfill({json:{jsonrpc:'2.0',id:q.id,result}});
  }
  if(u.hostname!=='www.jamddmaj.com')return route.abort();
  if(u.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:await readFile('.perps-build/token-fixture-sdk.js')});
  const path=resolve('www','.'+(u.pathname==='/'?'/index.html':u.pathname));
  try{let body=await readFile(path);if(u.pathname==='/')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));return route.fulfill({body,contentType:extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://www.jamddmaj.com/');
 await page.evaluate(async()=>{
  document.querySelector('#launchIntro')?.remove();
  await import('/fair-launch-ui.js');document.querySelector('#fairLaunchBtn').click();
  const sdk=await import('/fixture.js'),owner=await sdk.generateKeyPairSigner();window.signs=0;
  const account={address:owner.address,chains:['solana:mainnet']};
  const wallet={name:'Disposable fixture',chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:[0],async signTransaction({transaction}){window.signs++;return [{signedTransaction:sdk.getTransactionEncoder().encode(await sdk.partiallySignTransactionWithSigners([owner],sdk.getTransactionDecoder().decode(transaction)))}];}}}};
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet',{detail:api=>api.register(wallet)}));
 });
 const root=page.locator('#tokenCreatorMainnet'),button=name=>root.locator('[data-token="'+name+'"]');
 await button('check-name').click();await page.waitForFunction(()=>document.querySelector('[data-token="name-results"]').textContent.includes('No se pudo completar'));
 assert.equal(await page.evaluate(()=>window.signs),0);assert.equal(calls.includes('simulateTransaction'),false);
 nameUnavailable=false;await button('connect').click();await button('prepare').click();
 await page.waitForFunction(()=>document.querySelector('[data-token="name-results"]').textContent.includes('ya detectado'));
 assert.equal(await page.evaluate(()=>window.signs),0);assert.equal(calls.includes('simulateTransaction'),false);assert.equal(await button('submit').isDisabled(),true);
 nameBlocked=false;await button('prepare').click();await page.waitForFunction(()=>document.querySelector('[data-token="review"]').textContent.includes('Total estimado'));
 assert.equal(await page.evaluate(()=>window.signs),0);assert.equal(await button('submit').isDisabled(),true);
 await root.scrollIntoViewIfNeeded();await page.screenshot({path:'.perps-build/token-creator-review-mobile.png',fullPage:false});
 await button('approval').check();await button('submit').click();await page.waitForFunction(()=>localStorage.getItem('jamd.tokenCreator.mainnet.pending.v1'));
 await page.reload();await page.evaluate(async()=>{await import('/fair-launch-ui.js');document.querySelector('#fairLaunchBtn').click();});
 assert.equal(await button('prepare').isDisabled(),true);await button('recover').click();
 await page.waitForFunction(()=>document.querySelector('[data-token="status"]').textContent.includes('Token confirmado'));
 assert.equal(calls.filter(m=>m==='sendTransaction').length,1);assert.deepEqual(errors,[]);
 console.log('PASS mainnet creator browser fixture: explicit review, consent, one mocked send, reload, read-only confirmation. No external network.');
}finally{await browser.close();}
