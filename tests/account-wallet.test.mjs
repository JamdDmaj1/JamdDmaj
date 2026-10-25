import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createHandler} from '../api/account-wallet.js';
import {createAccountWalletClient} from '../lib/account-wallet-client.js';
import {selectWalletAccount,selectedWalletAccount} from '../lib/wallet-portfolio-store.js';
import {publishWalletTradingState,currentWalletTradingState} from '../lib/wallet-trading-state.js';
import {readWebPerpsWalletSession} from '../lib/perps-web-wallet-session.js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const address=bs58.encode(Buffer.alloc(32,1)),other=bs58.encode(Buffer.alloc(32,2)),tokenA='a'.repeat(64),tokenA2='b'.repeat(64),tokenB='c'.repeat(64);
function fixture(){const records=new Map(),owners=new Map([[tokenA,'1'.repeat(64)],[tokenA2,'1'.repeat(64)],[tokenB,'2'.repeat(64)]]);let writes=0;
 const authenticate=async r=>{const owner=owners.get((r.headers.get('authorization')||'').replace(/^Bearer /,''));if(!owner)throw Object.assign(Error(),{status:401});return owner;};
 const storage=async(path,commands)=>{assert.equal(path,'pipeline');return commands.map(command=>{if(command[0]==='GET')return {result:records.get(command[1])??null};assert.equal(command[0],'EVAL');const [,script,n,key,expected,value]=command;assert.equal(n,1);assert(script.includes('redis.call'));const existing=records.get(key);if(expected===''?existing!==undefined:existing===undefined||JSON.parse(existing).revision!==expected)return {result:0};records.set(key,value);writes++;return {result:1};});};
 const handler=createHandler({authenticate,storage,limit:async()=>{}}),request=(token,body,headers={})=>new Request('https://www.jamddmaj.com/api/account-wallet',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const client=token=>createAccountWalletClient({readToken:()=>token,fetchImpl:(url,options)=>{assert.equal(url,'/api/account-wallet');return handler(new Request('https://www.jamddmaj.com'+url,options));}});
 return {records,handler,request,client,writes:()=>writes};
}
test('same verified account restores its public wallet on another session while other accounts see no link',async()=>{
 const f=fixture(),a=f.client(tokenA),b=f.client(tokenB);assert.equal(await a.read(),null);
 const saved=await a.save({address,expectedRevision:null,explicitApproval:true});assert.equal(saved.readOnly,true);assert.equal(saved.signingAuthorized,false);
 assert.deepEqual(await f.client(tokenA2).read(),saved);assert.equal(await b.read(),null);assert.equal(f.writes(),1);
 const savedB=await b.save({address:other,expectedRevision:null,explicitApproval:true});assert.deepEqual(await a.read(),saved);assert.equal((await b.read()).address,savedB.address);
});
test('public links reject unauthenticated requests, foreign origins, secret/owner fields and absent consent',async()=>{
 const f=fixture(),valid={address,expectedRevision:null,explicitApproval:true};
 assert.equal((await f.handler(f.request('',null))).status,401);
 for(const body of [{...valid,owner:'victim'},{...valid,privateKey:'not-allowed'},{...valid,explicitApproval:false},{...valid,address:'invalid'},{...valid,extra:'x'.repeat(600)}])assert.equal((await f.handler(f.request(tokenA,body))).status,400);
 assert.equal((await f.handler(f.request(tokenA,valid,{Origin:'https://attacker.invalid'}))).status,400);assert.equal(f.writes(),0);
});
test('replacement requires the current revision and never overwrites concurrent device changes',async()=>{
 const f=fixture(),client=f.client(tokenA),saved=await client.save({address,expectedRevision:null,explicitApproval:true});
 await assert.rejects(client.save({address:other,expectedRevision:null,explicitApproval:true}),/LINK_CHANGED/);
 const updated=await client.save({address:other,expectedRevision:saved.revision,explicitApproval:true});
 await assert.rejects(client.save({address,expectedRevision:saved.revision,explicitApproval:true}),/LINK_CHANGED/);assert.deepEqual(await client.read(),updated);
});
test('session switches, storage failures and forged signing-capable link responses fail closed',async()=>{
 let token=tokenA;
 const client=createAccountWalletClient({readToken:()=>token,fetchImpl:async()=>{token=tokenB;return Response.json({ok:true,wallet:null});}});await assert.rejects(client.read(),/SESSION_CHANGED/);
 const saved=await fixture().client(tokenA).save({address,expectedRevision:null,explicitApproval:true});
 const forged=createAccountWalletClient({readToken:()=>tokenA,fetchImpl:async()=>Response.json({ok:true,wallet:{...saved,signingAuthorized:true}})});await assert.rejects(forged.read());
 const unavailable=createHandler({authenticate:async()=>'1'.repeat(64),storage:async()=>{throw Error('private detail');},limit:async()=>{}});const r=await unavailable(new Request('https://www.jamddmaj.com/api/account-wallet'));assert.equal(r.status,503);assert.equal(JSON.stringify(await r.json()).includes('private detail'),false);
});
test('linked public wallet shows chain balances but cannot become available trading capital or a provider session',()=>{
 const doc=new EventTarget();doc.defaultView={Event};selectWalletAccount(doc,{address,source:'watch',name:'JamdDmaj view only'});
 publishWalletTradingState(doc,{stage:'PUBLIC_WALLET_TRADING_STATE',walletAddress:address,network:'solana-mainnet',readOnly:true,observedAt:Date.now(),observedSlot:1,availableUsdcUnits:'5000000',allocatedUsdUnits:'0',payerLamports:'100000000',positions:[],orders:[],history:[],ordersComplete:true,historyComplete:true},selectedWalletAccount(doc),{pendingKnown:true});
 assert.equal(currentWalletTradingState(doc).snapshot.availableUsdcUnits,'5000000');assert.equal(currentWalletTradingState(doc).availableUsdcUnits,null);assert.equal(readWebPerpsWalletSession(doc),null);
});

test('compiled Assets links once and a second signed-in browser restores the same view-only wallet while another account cannot',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const f=fixture(),root=resolve('www'),server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE),browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});let financialRequests=0;
 async function open(token){const context=await browser.newContext({viewport:{width:430,height:820}});await context.addInitScript(value=>sessionStorage.setItem('jamdWebTrialSession',value),token);
  await context.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(path==='/api/account-wallet'){const response=await f.handler(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}:{} )}));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   if(req.method()!=='GET'){financialRequests++;return route.abort();}
   if(path==='/api/solana-portfolio')return route.fulfill({json:{ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),partial:false,balancesComplete:true,estimatedValueUsd:15,valuationCoverage:1,sol:{amount:.1,priceUsd:100,valueUsd:10},tokens:[{mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',symbol:'USDC',amount:5,priceUsd:1,valueUsd:5}]}});
   if(path==='/api/wallet-trading-state')return route.fulfill({json:{stage:'PUBLIC_WALLET_TRADING_STATE',walletAddress:address,network:'solana-mainnet',readOnly:true,observedAt:Date.now(),observedSlot:1,availableUsdcUnits:'5000000',allocatedUsdUnits:'0',payerLamports:'100000000',positions:[],orders:[],history:[],ordersComplete:true,historyComplete:true}});
   return route.fulfill({status:503,json:{error:'UNRELATED_FIXTURE_ENDPOINT'}});
  });const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/private-simulator.html#lang=en&view=assets',{waitUntil:'domcontentloaded'});await page.locator('#tab-assets').click();await page.locator('#account-linked-wallet').waitFor();return {page,context};
 }
 try{
  let {page,context}=await open(tokenA);const panel=page.locator('#account-linked-wallet');await panel.getByRole('status').filter({hasText:'No address linked'}).waitFor();
  await panel.getByRole('textbox').fill(address);assert.equal(await panel.getByRole('button',{name:'Link public address',exact:true}).isDisabled(),true);await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Link public address',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Public balance updated'}).waitFor();assert.equal(f.writes(),1);assert.match(await page.locator('.wallet-total-usd').textContent(),/15/);await context.close();
  ({page,context}=await open(tokenA2));await page.locator('#account-linked-wallet').getByRole('status').filter({hasText:'Public balance updated'}).waitFor();assert.match(await page.locator('.wallet-total-usd').textContent(),/15/);
  assert.equal(await page.locator('#account-linked-wallet input[type=text]').inputValue(),address);
  assert.equal(await page.locator('#native-main-wallet').isVisible(),false);
  assert.equal(await page.locator('#account-linked-wallet .wallet-native-balance').textContent(),'0.1 SOL');
  assert.match(await page.locator('#account-linked-wallet .wallet-holdings').textContent(),/USDC.*5/);
  assert.equal(await page.getByRole('button',{name:'Confirm, sign and submit',exact:true,includeHidden:true}).first().isDisabled(),true);await context.close();
  ({page,context}=await open(tokenB));await page.locator('#account-linked-wallet').getByRole('status').filter({hasText:'No address linked'}).waitFor();assert.equal(await page.locator('#account-linked-wallet input[type=text]').inputValue(),'');assert.equal(f.writes(),1);assert.equal(financialRequests,0);await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
