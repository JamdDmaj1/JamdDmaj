// Synthetic finalized receipt and fresh browser only. No keys/signatures/sends.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0,receiver='';
 await page.addInitScript(()=>localStorage.setItem('jamd.firstVisitAccess.v1','true')); // Returning user; does not authorize wallet access.
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.route(/^https:\/\/(?:solana-rpc\.publicnode\.com|api\.mainnet-beta\.solana\.com)\//,async route=>{calls++;const q=route.request().postDataJSON();let result;const signature='1'.repeat(64),time=Math.ceil(Date.now()/1000);
  if(q.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  else if(q.method==='getTokenAccountsByOwner')result={value:[]};
  else if(q.method==='getSignaturesForAddress'){receiver=q.params[0];result=[{signature,err:null,confirmationStatus:'finalized',blockTime:time}];}
  else if(q.method==='getTransaction')result={blockTime:time,transaction:{signatures:[signature],message:{accountKeys:[{pubkey:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',signer:true},{pubkey:receiver,signer:false}],instructions:[{programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',destination:receiver,lamports:80000000}}}]}},meta:{err:null,preBalances:[1e9,0],postBalances:[9e8,80000000],preTokenBalances:[],postTokenBalances:[],innerInstructions:[]}};
  else throw Error('Forbidden RPC '+q.method);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:q.id,result})});
 });
 const base=process.argv[2]||'http://127.0.0.1:'+server.address().port;if(base!=='https://www.jamddmaj.com'&&!base.startsWith('http://127.0.0.1:'))throw Error('Unexpected origin');
 await page.goto(base+'/private-simulator.html?notifications=20261026#lang=en');await page.locator('#tab-assets').click();await page.getByText(/No compatible extension detected/).waitFor();assert.equal(calls,0);
 await page.evaluate(async()=>{const store=await import('/lib/wallet-portfolio-store.js');store.rememberWalletAccount(document,{address:'3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',source:'watch',name:'Synthetic bot wallet'});});
 await page.locator('#tab-home').click();await page.getByRole('button',{name:'☰ Profile',exact:true}).click();await page.getByRole('button',{name:'Notifications',exact:true}).click();
 const panel=page.locator('#profile-notifications');await panel.getByRole('checkbox').check();await panel.getByText(/Received 0.080000000 SOL/).waitFor();assert.ok(calls>=5);
 assert.match(await panel.innerText(),/not a push service when the app is closed/);await panel.getByRole('checkbox').uncheck();await panel.getByText('Notifications off.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.screenshot({path:'.perps-build/receipt-notifications-mobile.png'});
 console.log('PASS: fresh browser explains extension requirements; profile opt-in receives a synthetic finalized receipt, supports disabling, no automatic permission/sign/send, no page errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
