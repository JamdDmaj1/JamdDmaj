// Actual bundled SDK/UI + fake EVM provider and intercepted TESTNET API.
// No real signatures, funded account, chain order, deposit or transfer.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const width of [1280,390]){const page=await browser.newPage({viewport:{width,height:900}}),errors=[],sent=[];let configured=false,position=null,last=null,oid=0,loseNext=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{const address='0x'+'11'.repeat(20);window.__walletCalls=[];window.ethereum={on(){},removeListener(){},async request({method,params}){window.__walletCalls.push(method);if(['eth_requestAccounts','eth_accounts'].includes(method))return [address];if(method==='eth_signTypedData_v4'){const payload=JSON.parse(params[1]);if(payload.message.source!=='b')throw Error('not-testnet');return '0x'+'11'.repeat(64)+'1b';}throw Error('unexpected-wallet-call');}};});
 const respond=(route,body)=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
 await page.route('**/*',async route=>{const req=route.request(),url=req.url();if(url.startsWith('http://127.0.0.1:'))return route.continue();assert.ok(url.startsWith('https://api.hyperliquid-testnet.xyz/'),'only intercepted testnet requests allowed');const body=req.postDataJSON();
  if(url.endsWith('/exchange')){sent.push(body);if(body.action.type==='updateLeverage'){assert.equal(body.action.isCross,false);configured=true;return respond(route,{status:'ok',response:{type:'default'}});}assert.equal(body.action.type,'order');assert.equal(body.action.orders.length,1);last=body.action.orders[0];assert.equal(last.t.limit.tif,'Ioc');oid++;position=last.r?null:last.b?last.s:'-'+last.s;if(loseNext){loseNext=false;return route.abort('failed');}return respond(route,{status:'ok',response:{type:'order',data:{statuses:[{filled:{totalSz:last.s,avgPx:'0.12',oid}}]}}});}
  assert.ok(url.endsWith('/info'));switch(body.type){
   case 'metaAndAssetCtxs':return respond(route,[{universe:[{name:'DOGE',szDecimals:0,maxLeverage:20}]},[{markPx:'0.12'}]]);
   case 'clearinghouseState':return respond(route,{marginSummary:{accountValue:'100',totalMarginUsed:position?'10':'0'},withdrawable:position?'90':'100',assetPositions:position?[{position:{coin:'DOGE',szi:position,entryPx:'0.12',marginUsed:'10',unrealizedPnl:'0',returnOnEquity:'0',leverage:{type:'isolated',value:3}}}]:[]});
   case 'openOrders':return respond(route,[]);
   case 'activeAssetData':return respond(route,{user:body.user,coin:'DOGE',leverage:{type:configured?'isolated':'cross',value:3},maxTradeSzs:['1000','1000'],availableToTrade:['100','100'],markPx:'0.12'});
   case 'orderStatus':return respond(route,{status:'order',order:{status:'filled',order:{cloid:last.c,coin:'DOGE',side:last.b?'B':'A',origSz:last.s,sz:'0',oid}}});
   case 'userFillsByTime':return respond(route,[{oid,tid:oid,coin:'DOGE',side:last.b?'B':'A',time:Date.now(),sz:last.s}]);
   default:throw Error('unapproved info request '+body.type);
  }
 });
 const waitStatus=value=>page.waitForFunction(value=>document.getElementById('status').textContent.includes(value),value);
 const confirm=async()=>{await page.locator('#consent').check();await page.locator('#confirm').click();};
 await page.goto('http://127.0.0.1:'+server.address().port+'/hyperliquid-testnet.html');await page.locator('#connect').click();await waitStatus('Conectada para pruebas');
 await page.locator('#configure').click();await page.locator('#review').waitFor();await confirm();await waitStatus('Acción de testnet enviada');await page.locator('#recover').click();await waitStatus('Margen aislado confirmado');
 await page.locator('#long').click();await confirm();await waitStatus('Acción de testnet enviada');assert.equal(sent.length,2);await page.locator('#recover').click();await waitStatus('Ejecución confirmada');assert.ok(position);await page.screenshot({path:resolve('.perps-build/hyperliquid-testnet-'+width+'.png'),fullPage:true});
 await page.getByRole('button',{name:'Revisar cierre 100 % · testnet'}).click();await confirm();await waitStatus('Acción de testnet enviada');await page.locator('#recover').click();await waitStatus('Ejecución confirmada');assert.equal(position,null);assert.equal(sent.length,3);
 loseNext=true;await page.locator('#short').click();await confirm();await waitStatus('No se pudo completar');assert.equal(sent.length,4);assert.ok(position.startsWith('-'));
 await page.reload();await page.locator('#connect').click();await waitStatus('Conectada para pruebas');await page.locator('#recover').click();await waitStatus('Ejecución confirmada');assert.equal(sent.length,4,'recovery must never resubmit');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok((await page.evaluate(()=>window.__walletCalls)).every(m=>['eth_requestAccounts','eth_accounts','eth_signTypedData_v4'].includes(m)));assert.deepEqual(errors,[]);await page.close();console.log('PASS testnet-only compiled flow '+width+'px: configure, explicit open, full close, uncertain response and durable reload recovery; synthetic signatures/API only');
}}finally{await browser.close();server.close();}
