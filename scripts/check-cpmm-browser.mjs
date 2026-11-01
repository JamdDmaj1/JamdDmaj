// Full UI rehearsal with disposable fixture keys; all external requests blocked.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateKeyPairSigner,getAddressEncoder,getTransactionDecoder,getBase58Decoder} from '@solana/kit';
import {findAssociatedTokenPda,TOKEN_2022_PROGRAM_ADDRESS} from '@solana-program/token-2022';
import {cpmmAddresses,USDC,TOKEN,CPMM} from '../lib/cpmm-pool.js';
import {chromium} from 'file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
await build({stdin:{contents:"export {generateKeyPairSigner,getTransactionDecoder,getTransactionEncoder,partiallySignTransactionWithSigners} from '@solana/kit';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',outfile:'.perps-build/pool-fixture-sdk.js'});
const enc=getAddressEncoder(),mint=await generateKeyPairSigner(),keys=await cpmmAddresses(mint.address),accounts=new Map(),calls=[],errors=[];
const first=keys.token0===mint.address,program0=first?TOKEN_2022_PROGRAM_ADDRESS:TOKEN,program1=first?TOKEN:TOKEN_2022_PROGRAM_ADDRESS;
const put64=(b,o,n)=>new DataView(b.buffer).setBigUint64(o,n,true);
const info=(b,owner)=>({data:[Buffer.from(b).toString('base64'),'base64'],owner,executable:false,lamports:1000000,rentEpoch:0,space:b.length});
const mintInfo=p=>{const b=new Uint8Array(82);b[44]=6;b[45]=1;put64(b,36,100000000000000n);return info(b,p);};
function tokenInfo(m,o,p,n){const b=new Uint8Array(165);b.set(enc.encode(m));b.set(enc.encode(o),32);put64(b,64,n);b[108]=1;return info(b,p);}
accounts.set(mint.address,mintInfo(TOKEN_2022_PROGRAM_ADDRESS));accounts.set(USDC,mintInfo(TOKEN));
const config=new Uint8Array(236);config.set(createHash('sha256').update('account:AmmConfig').digest().subarray(0,8));put64(config,12,2500n);put64(config,36,150000000n);accounts.set(keys.config,info(config,CPMM));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let owner,wire;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='solana-rpc.publicnode.com'){
   const q=JSON.parse(route.request().postData());calls.push(q.method);let result;
   if(q.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(q.method==='getAccountInfo')result={context:{slot:1},value:accounts.get(q.params[0])||null};
   else if(q.method==='getLatestBlockhash')result={context:{slot:1},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};
   else if(q.method==='simulateTransaction'){
    const bal=100000000000000n,a0=first?1000000000000n:1000000000n,a1=first?1000000000n:1000000000000n;
    result={context:{slot:1},value:{err:null,fee:5600,preBalances:[1000000000],postBalances:[800000000],preTokenBalances:[{accountIndex:3,owner,mint:keys.token0,uiTokenAmount:{amount:bal.toString(),decimals:6}},{accountIndex:4,owner,mint:keys.token1,uiTokenAmount:{amount:bal.toString(),decimals:6}}],postTokenBalances:[{accountIndex:3,owner,mint:keys.token0,uiTokenAmount:{amount:(bal-a0).toString(),decimals:6}},{accountIndex:4,owner,mint:keys.token1,uiTokenAmount:{amount:(bal-a1).toString(),decimals:6}},{accountIndex:5,owner,mint:keys.lpMint,uiTokenAmount:{amount:'31622776501',decimals:9}}]}};
   }else if(q.method==='sendTransaction'){
    wire=q.params[0];result=getBase58Decoder().decode(getTransactionDecoder().decode(Buffer.from(wire,'base64')).signatures[owner]);
    const b=new Uint8Array(637);b.set(createHash('sha256').update('account:PoolState').digest().subarray(0,8));
    [keys.config,owner,keys.vault0,keys.vault1,keys.lpMint,keys.token0,keys.token1,program0,program1,keys.observation].forEach((a,i)=>b.set(enc.encode(a),8+i*32));b[330]=9;b[331]=6;b[332]=6;put64(b,333,31622776601n);accounts.set(keys.pool,info(b,CPMM));
   }else if(q.method==='getSignatureStatuses')result={context:{slot:1},value:[{err:null,confirmationStatus:'finalized'}]};
   else if(q.method==='getTransaction')result={slot:1,transaction:[wire,'base64'],meta:{err:null,postTokenBalances:[{accountIndex:5,owner,mint:keys.lpMint,uiTokenAmount:{amount:'31622776501',decimals:9}}]}};
   else throw Error('Forbidden RPC '+q.method);
   return route.fulfill({json:{jsonrpc:'2.0',id:q.id,result}});
  }
  if(u.hostname!=='www.jamddmaj.com')return route.abort();
  if(u.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:await readFile('.perps-build/pool-fixture-sdk.js')});
  const path=resolve('www','.'+(u.pathname==='/'?'/index.html':u.pathname));
  try{let body=await readFile(path);if(u.pathname==='/')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));return route.fulfill({body,contentType:extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://www.jamddmaj.com/');
 owner=await page.evaluate(async()=>{
  document.querySelector('#launchIntro')?.remove();await import('/fair-launch-ui.js');document.querySelector('#fairLaunchBtn').click();
  const sdk=await import('/fixture.js'),owner=await sdk.generateKeyPairSigner();window.poolSigns=0;
  const account={address:owner.address,chains:['solana:mainnet']},wallet={name:'Disposable pool fixture',chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:[0],async signTransaction({transaction}){window.poolSigns++;return [{signedTransaction:sdk.getTransactionEncoder().encode(await sdk.partiallySignTransactionWithSigners([owner],sdk.getTransactionDecoder().decode(transaction)))}];}}}};
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet',{detail:api=>api.register(wallet)}));return owner.address;
 });
 const [s0]=await findAssociatedTokenPda({owner,mint:keys.token0,tokenProgram:program0}),[s1]=await findAssociatedTokenPda({owner,mint:keys.token1,tokenProgram:program1});
 accounts.set(s0,tokenInfo(keys.token0,owner,program0,100000000000000n));accounts.set(s1,tokenInfo(keys.token1,owner,program1,100000000000000n));
 const root=page.locator('#cpmmPoolMainnet'),el=n=>root.locator('[data-pool="'+n+'"]');
 await el('connect').click();await el('mint').fill(mint.address);await el('tokens').fill('1000000');await el('usdc').fill('1000');await el('prepare').click();
 await page.waitForFunction(()=>document.querySelector('[data-pool="review"]').textContent.includes('SIN BLOQUEO'));
 assert.equal(await page.evaluate(()=>window.poolSigns),0);assert.equal(await el('submit').isDisabled(),true);
 assert.equal(await root.evaluate(r=>r.scrollWidth<=r.clientWidth+1),true);
 await el('review').scrollIntoViewIfNeeded();await page.screenshot({path:'.perps-build/cpmm-review-mobile.png'});
 await el('approval').check();await el('submit').click();await page.waitForFunction(()=>localStorage.getItem('jamd.cpmm.pending.v1'));
 await page.reload();await page.evaluate(async()=>{await import('/fair-launch-ui.js');document.querySelector('#fairLaunchBtn').click();});
 assert.equal(await el('prepare').isDisabled(),true);await el('recover').click();await page.waitForFunction(()=>document.querySelector('[data-pool="status"]').textContent.includes('Aportación confirmada'));
 assert.equal(calls.filter(m=>m==='sendTransaction').length,1);assert.deepEqual(errors,[]);
 console.log('PASS pool mobile browser: review, explicit consent, single mocked send, reload, rooted receipt. No external network.');
}finally{await browser.close();}
