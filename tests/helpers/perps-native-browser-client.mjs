// Isolated browser -> real authenticated API -> native service fixture bridge.
// The caller supplies only an unfunded service with mocked financial transport.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {build} from 'esbuild';
export async function nativeBrowserClient(handler,{now,token}){
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {createBotManualPerpsClient} from './lib/bot-manual-perps-client.js';
  window.client=createBotManualPerpsClient({readSessionToken:()=> '${token}',now:()=> ${now}});
  window.reviews=new Map();
 `},bundle:true,write:false,platform:'browser',format:'esm'});
 const server=createServer((req,res)=>{
  res.setHeader('Content-Type',req.url==='/client.js'?'text/javascript':'text/html');
  res.end(req.url==='/client.js'?bundle.outputFiles[0].text:'<!doctype html><meta charset="utf-8"><title>Unfunded native API fixture</title><script type="module" src="/client.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,errors=[],trace=[];let browser;
 try{
  const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE);
  browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   assert.equal(url.origin,'https://157.230.54.133');assert.equal(url.pathname,'/v1/automation');
   const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,accept','Access-Control-Allow-Methods':'POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
   assert.equal(req.method(),'POST');
   const headers=new Headers(req.headers());headers.set('Origin','https://www.jamddmaj.com');
   const response=await handler(new Request(req.url(),{method:'POST',headers,body:req.postData()}));
   const body=await response.clone().json(),action=req.postDataJSON()?.action;
   assert.match(action,/^botManual[A-Za-z]+$/);
   trace.push(Object.freeze({action,status:response.status,
    stage:/^[A-Z_]{1,100}$/.test(body?.botManual?.stage??'')?body.botManual.stage:null,
    errorCode:/^[a-z-]{1,100}$/.test(body?.error?.code??'')?body.error.code:null}));
   await route.fulfill({status:response.status,headers:{...cors,'Content-Type':'application/json'},body:await response.text()});
  });
  await page.goto(origin);await page.waitForFunction(()=>Boolean(window.client));
  const reviews=new WeakMap();
  return {
   // Only route/outcome metadata: no tokens, balances, IDs or signed bytes.
   getTrace:()=>structuredClone(trace),
   async prepare(wallet,draft,options){
    const value=await page.evaluate(async({wallet,draft,options})=>{const review=await window.client.prepare(wallet,draft,options);window.reviews.set(review.id,review);return review;},{wallet,draft,options});
    reviews.set(value,value.id);return value;
   },
   async confirm(review,approval,feeApproval){
    const id=reviews.get(review);if(!id)throw Error('browser-review-required');
    return page.evaluate(({id,approval,feeApproval})=>window.client.confirm(window.reviews.get(id),approval,feeApproval),{id,approval,feeApproval});
   },
   async prepareRecovery(wallet,reservationId){
    const value=await page.evaluate(async({wallet,reservationId})=>{const review=await window.client.prepareRecovery(wallet,reservationId);window.reviews.set(review.id,review);return review;},{wallet,reservationId});
    reviews.set(value,value.id);return value;
   },
   async confirmRecovery(review,approval){
    const id=reviews.get(review);if(!id)throw Error('browser-review-required');
    return page.evaluate(({id,approval})=>window.client.confirmRecovery(window.reviews.get(id),approval),{id,approval});
   },
   recoverRecovery:(wallet,id)=>page.evaluate(({wallet,id})=>window.client.recoverRecovery(wallet,id),{wallet,id}),
   status:wallet=>page.evaluate(wallet=>window.client.status(wallet),wallet),
   recover:(wallet,id)=>page.evaluate(({wallet,id})=>window.client.recover(wallet,id),{wallet,id}),
   async close(){try{assert.deepEqual(errors,[]);}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}}
  };
 }catch(error){await browser?.close();await new Promise(resolve=>server.close(resolve));throw error;}
}
