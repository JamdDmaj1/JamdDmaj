// Fresh visitor browser checks. No real account, wallet connection or transaction.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 const base=process.argv[2]||'http://127.0.0.1:'+server.address().port;
 if(base!=='https://www.jamddmaj.com'&&!base.startsWith('http://127.0.0.1:'))throw Error('Unexpected origin');
 await page.goto(base+'/private-simulator.html#lang=en');
 await page.locator('#first-visit-access[open]').waitFor();
 await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
 await page.waitForURL('**/index.html?signin=google#lang=en');
 try{await page.locator('#googleSignInBtn').waitFor({state:'visible',timeout:10000});}catch(error){console.log(await page.evaluate(()=>({settingsOpen:document.querySelector('#settingsDialog')?.open,selected:document.querySelector('[data-settings-panel].active')?.dataset.settingsPanel,onboarding:document.documentElement.dataset.accountOnboarding,dialog:document.querySelector('#first-visit-access')?.open})));throw error;}
 assert.equal(await page.locator('#settingsDialog').evaluate(e=>e.open),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('jamd.firstVisitAccess.v1')),null);
 assert.deepEqual(errors,[]);
 console.log('PASS: fresh finance visitor prompted; Google access opens Account settings without connecting a wallet or acknowledging an unverified session.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
