// Browser modules + client + bounded synthetic API error. Never real auth/send.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('jamd.firstVisitAccess.v1','true'));
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 const base=process.argv[2]||'http://127.0.0.1:'+server.address().port;
 if(base!=='https://www.jamddmaj.com'&&!base.startsWith('http://127.0.0.1:'))throw Error('Unexpected origin');
 await page.goto(base+'/private-simulator.html#lang=en');
 const result=await page.evaluate(async()=>{
  const {setupPerpsControlPanel}=await import('/lib/perps-control-panel.js'),{createPerpsControlClient}=await import('/lib/perps-control-client.js'),{validateAutomationSettings}=await import('/lib/automation-panel.js');
  const settings=validateAutomationSettings({capital:50,loss:30,positions:1,margin:10,leverage:3,dailyTrades:5}),walletAddress='11111111111111111111111111111111',revision='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actions=[];
  const client=createPerpsControlClient({readSessionToken:()=>'c'.repeat(64),validateSettings:validateAutomationSettings,fetchImpl:async(url,options)=>{
   if(url.endsWith('/health'))return Response.json({ok:true,mode:'execute',tradingEnabled:false,executionAvailable:true,custodyProvisioningAvailable:true});
   if(options.body){const body=JSON.parse(options.body);actions.push(body.action);if(body.action!=='activationReview')throw Error('FORBIDDEN_ACTION');return Response.json({error:{code:'fee-recipient-account-missing'}},{status:409});}
   return Response.json({ok:true,controls:{walletAddress,revision,settings,enabled:false,paused:true,reason:'USER_PAUSED',updatedAt:Date.now()},recovery:{walletAddress,stage:'BACKUP_VERIFIED_EXECUTION_PENDING',backupVerified:true,verifiedAt:Date.now(),fundingAvailable:false,readyForSigning:false},platformFees:{stage:'PLATFORM_FEE_STATUS',walletAddress,termsVersion:'jamddmaj-perps-margin-20bps-v2-trader-sol',dueUnits:'0',paidUnits:'0',pendingCount:0,failedCount:0}});
  }});
  const fields=Object.fromEntries(Object.entries(settings).map(([k,v])=>{const n=document.createElement('input');n.value=v??'';return [k,n]})),host=document.createElement('div');document.body.append(host);
  const panel=setupPerpsControlPanel({panel:host,fields,client,validateSettings:validateAutomationSettings,language:'en',doc:document});await panel.connect.onclick();const readMessage=panel.status.textContent,reviewEnabled=!panel.prepareActivation.disabled;await panel.prepareActivation.onclick();
  return {readMessage,reviewEnabled,message:panel.status.textContent,activateDisabled:panel.activate.disabled,actions};
 });
 assert.equal(result.reviewEnabled,true,JSON.stringify(result));assert.match(result.message,/administrator must prepare it/);assert.equal(result.activateDisabled,true);assert.deepEqual(result.actions,['activationReview']);assert.deepEqual(errors,[]);
 console.log('PASS: compiled client and real DOM panel show specific recipient setup error, preserve pause, and never call activate or a financial endpoint.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
