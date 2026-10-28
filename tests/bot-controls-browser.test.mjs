import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import bs58 from 'bs58';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
test('compiled bot controls keep custom limits and activation available after a confirmed save or pause',
 {skip:!process.env.JAMDDMAJ_TEST_BROWSER_MODULE},async()=>{
 const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const target=process.env.JAMDDMAJ_BOT_BROWSER_URL||'http://127.0.0.1:'+server.address().port;
 let browser,controls={walletAddress:bs58.encode(new Uint8Array(32).fill(3)),revision:randomUUID(),settings:{capital:100,loss:50,positions:1,margin:10,leverage:3,dailyTrades:5,stopLossPercent:null,takeProfitPercent:null,reductionPercent:50,lossAction:'disable'},enabled:false,paused:true,reason:'PAUSED',updatedAt:Date.now()};const writes=[];
 try{
  const {chromium}=await import(process.env.JAMDDMAJ_TEST_BROWSER_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.JAMDDMAJ_TEST_BROWSER_EXECUTABLE});const page=await browser.newPage();await page.addInitScript(()=>{sessionStorage.setItem('jamdWebTrialSession','a'.repeat(64));localStorage.setItem('jamd.firstVisitAccess.v1','true');});
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
   if(url.origin==='https://157.230.54.133'){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Accept'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/health')return route.fulfill({headers,json:{ok:true,mode:'execute',tradingEnabled:false,executionAvailable:true,custodyProvisioningAvailable:true}});
    assert.equal(url.pathname,'/v1/automation');const input=request.postDataJSON();
    if(input){writes.push(input.action);if(input.action==='save'){controls={...controls,settings:input.settings,revision:randomUUID(),updatedAt:Date.now()};}
     else if(input.action==='pause')controls={...controls,enabled:false,paused:true,revision:randomUUID(),updatedAt:Date.now()};
     else if(input.action==='activationReview')return route.fulfill({headers,json:{ok:true,review:{walletAddress:controls.walletAddress,revision:controls.revision,settings:controls.settings,expiresAt:Date.now()+60000,token:'b'.repeat(64),platformFee:quotePerpsPlatformFee(String(Math.round(controls.settings.margin*1000000)))}}});
     else assert.fail('This browser test must not activate any bot');
    }
    return route.fulfill({headers,json:{ok:true,controls,recovery:{walletAddress:controls.walletAddress,stage:'BACKUP_VERIFIED_EXECUTION_PENDING',backupVerified:true,verifiedAt:Date.now(),fundingAvailable:false,readyForSigning:false},platformFees:{stage:'PLATFORM_FEE_STATUS',walletAddress:controls.walletAddress,termsVersion:quotePerpsPlatformFee('10000000').version,dueUnits:'0',paidUnits:'0',pendingCount:0,failedCount:0}}});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'UNRELATED_FIXTURE_ENDPOINT'}});
   if(url.origin!==target)throw Error('Unexpected external request');return route.continue();
  });
  await page.goto(target+'/private-simulator.html#lang=en&view=futures');await page.locator('#tab-futures').click();await page.locator('#jamd-automation > summary').click();const panel=page.locator('#jamd-automation');
  await panel.getByRole('button',{name:'Read server settings',exact:true}).click();const review=panel.getByRole('button',{name:'Activate bot · review limits',exact:true});await review.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Activate bot · review limits')?.disabled);
  await page.locator('#automation-margin').fill('15');await page.locator('#automation-dailyTrades').fill('7');await panel.getByRole('button',{name:'Save limits and pause',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Activate bot · review limits')?.disabled);
  assert.equal(controls.settings.margin,15);assert.equal(controls.settings.dailyTrades,7);await review.click();await panel.getByRole('status').filter({hasText:'Maximum capital:'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Confirm and activate bot',exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Disable bot · stop new entries',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Activate bot · review limits')?.disabled);
  assert.equal(await page.locator('#automation-margin').inputValue(),'15');assert.deepEqual(writes,['save','activationReview','pause']);assert.equal(controls.enabled,false);
  controls={...controls,revision:randomUUID(),settings:{...controls.settings,capital:10,loss:5,margin:10}};
  await panel.getByRole('button',{name:'Read server settings',exact:true}).click();await review.click();
  await panel.getByRole('status').filter({hasText:'Incompatible limits: maximum capital / daily loss do not cover 10.02 USDC'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Confirm and activate bot',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('#automation-capital').inputValue(),'10');assert.equal(await page.locator('#automation-loss').inputValue(),'5');
  controls={...controls,revision:randomUUID(),settings:{...controls.settings,capital:10.02,loss:10.02}};
  await panel.getByRole('button',{name:'Read server settings',exact:true}).click();await review.click();
  await panel.getByRole('status').filter({hasText:'Review prepared. Not active yet:'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Confirm and activate bot',exact:true}).isDisabled(),true);
  assert.deepEqual(writes,['save','activationReview','pause','activationReview','activationReview']);assert.equal(controls.enabled,false);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
