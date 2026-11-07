import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
// Browser + real client + real API validation, explicitly modeled service.
// Financial transports are absent and every nonlocal request is intercepted.
test('isolated browser recovery uses real client/API and cannot repeat a lost confirmation',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const owner='a'.repeat(64),wallet='11111111111111111111111111111112',id='11111111-1111-4111-8111-111111111111';
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  import {setupBotManualRecoveryPanel} from './lib/bot-manual-recovery-panel.js';
  import {createBotManualPerpsClient} from './lib/bot-manual-perps-client.js';
  import {selectWalletAccount} from './lib/wallet-portfolio-store.js';
  selectWalletAccount(document,{source:'watch',address:'${wallet}'});
  const client=createBotManualPerpsClient({readSessionToken:()=> 'b'.repeat(64)});
  setupBotManualRecoveryPanel(document.querySelector('main'),{doc:document,language:'en',client}).setOperation({wallet:'${wallet}',id:'${id}',state:'RESERVED'});
 `},bundle:true,write:false,format:'esm',platform:'browser'});
 const style=(await readFile('private-simulator.html','utf8')).match(/<style>([\s\S]*?)<\/style>/)[1];
 const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unfunded recovery browser fixture</title><style>${style}</style><main class="card"><h1>Recovery test · no real funds</h1></main><script type="module" src="/fixture.js"></script>`;
 const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE);
  browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});
  for(const width of [1280,390]){
   const actions=[],errors=[];let sends=0;
   const forbidden=()=>assert.fail('No settings or automation mutation');
   const controls={read:who=>{assert.equal(who.ownerAccountHash,owner);assert.equal(who.walletAddress,wallet);return {walletAddress:wallet};},
    readForOwner:forbidden,save:forbidden,pause:forbidden,issueActivationChallenge:forbidden,activate:forbidden};
   const botManual={status(){},prepare(){},confirm(){},recover(){},
    prepareRecovery:async args=>{assert.equal(args.id,id);return {stage:'BOT_MANUAL_ENTRY_RECOVERY_REVIEW',walletAddress:wallet,id,reservationId:id,asset:'BTC',amountUnits:'9970000',minimumUsdcUnits:'9920150',networkFeeLamports:'5400',rentLockedLamports:'0',maxSlippageBps:50,platformFeeUsdcUnits:'0',requiresExplicitRecoveryConfirmation:true,submitted:false,expiresAt:Date.now()+9000};},
    confirmRecovery:async args=>{assert.equal(args.explicitApproval,true);sends++;return {walletAddress:wallet,state:'UNKNOWN'};},
    recoverRecovery:async args=>{assert.equal(args.id,id);return {walletAddress:wallet,state:'CANCELLED',originalRiskReleased:true};}};
   const handler=createPerpsAutomationApi({controls,botManual,authenticate:async()=>owner,rateLimit:async()=>true});
   const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
    assert.equal(u.origin,'https://157.230.54.133');
    const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,accept','Access-Control-Allow-Methods':'POST,OPTIONS'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    const body=req.postDataJSON();actions.push(body.action);
    const response=await handler(new Request(req.url(),{method:'POST',headers:{Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(body)}));
    if(body.action==='botManualRecoveryConfirm')return route.abort('failed');
    return route.fulfill({status:response.status,headers:{...cors,'Content-Type':'application/json'},body:await response.text()});
   });
   await page.goto(origin);await page.getByRole('button',{name:'Review return to USDC',exact:true}).click();
   await page.getByText('Minimum received: 9.920150 USDC',{exact:true}).waitFor();
   const confirm=page.getByRole('button',{name:'Confirm return',exact:true});assert.equal(await confirm.isDisabled(),true);assert.equal(sends,0);
   if(width===390&&process.env.JAMDDMAJ_RECOVERY_SCREENSHOT)await page.screenshot({path:process.env.JAMDDMAJ_RECOVERY_SCREENSHOT,fullPage:true});
   await page.getByRole('checkbox').check();await confirm.click();await page.getByText(/Recovery not completed/).waitFor();
   assert.equal(sends,1);assert.equal(await confirm.isVisible(),false);
   await page.getByRole('button',{name:'Check return',exact:true}).click();await page.getByText(/Reserve released after complete verification/).waitFor();
   assert.deepEqual(actions,['botManualRecoveryPrepare','botManualRecoveryConfirm','botManualRecoveryRecover']);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
