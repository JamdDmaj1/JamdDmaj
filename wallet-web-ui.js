import {createWebWalletKeySession,deriveAndroidSolanaSeed} from './lib/web-wallet-keys.js';
import {sealPortableWalletBackup} from './lib/portable-wallet-backup.js';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {openWebSwapJournal} from './lib/web-swap-journal.js';
import {createWebSwapEngine,createWebSwapRpc} from './lib/web-swap-engine.js';
import {SWAP_IDS as I} from './lib/web-swap-policy.js';
import {webWalletPendingText,webWalletReviewSeconds} from './lib/web-wallet-status.js';
const $=id=>document.getElementById(id),session=createWebWalletKeySession(),rpc=createWebSwapRpc();
let engine,journal,review=null,busy=false,expiry,unlockGeneration=0;
const decimal=(value,decimals)=>{const raw=String(value).padStart(decimals+1,'0');return raw.slice(0,-decimals)+'.'+raw.slice(-decimals);};
function reset(){engine?.invalidate();review=null;clearTimeout(expiry);$('swap-summary').replaceChildren();$('swap-approve').checked=false;$('swap-confirm').disabled=true;}
function render(){const current=session.current();$('swap-review').disabled=busy||!current||!engine;$('wallet-unlock').disabled=busy;$('wallet-create').disabled=busy||!$('wallet-create-consent').checked;$('wallet-lock').disabled=!current;$('swap-pending').disabled=busy||!engine||!$('wallet-address').value.trim();$('swap-confirm').disabled=busy||!current||!review||!$('swap-approve').checked||Date.now()>=review.expiresAt;
 if(!current&&$('wallet-status').textContent.startsWith('Unlocked:'))$('wallet-status').textContent='Locked automatically for security. Unlock it again to operate.';
 let countdown=$('swap-countdown');if(!countdown){countdown=document.createElement('p');countdown.id='swap-countdown';$('swap-summary').after(countdown);}countdown.textContent=review?'Review valid for '+webWalletReviewSeconds(review.expiresAt)+' s. When it expires you must review again.':'';
}
function lock(){unlockGeneration++;session.lock();reset();$('wallet-password').value='';$('wallet-backup').value='';$('wallet-status').textContent='Locked. Your keys were not stored in this browser.';render();}
async function run(fn){
 if(busy)return;busy=true;render();
 try{await fn();}catch(e){
  const messages={
   RECOVERED_WALLET_MISMATCH:'The backup belongs to another address. Your wallet was not replaced.',
   BACKUP_RECOVERY_FAILED:'Incorrect password or damaged backup.',
   INVALID_BACKUP_PASSWORD:'The password must be 16 to 1024 characters.',
   EXPECTED_WALLET_REQUIRED:'Enter the public address you expect to recover.',
   UNSUPPORTED_WALLET_BACKUP:'This is not an encrypted backup of the main JamdDmaj wallet.',
   AMOUNT:'Enter a positive amount of the token you pay, with the correct decimals.',
   WEB_SWAP_POLICY_REJECTED:'This route did not pass the security checks. Nothing was signed. You can request another review.',
   WEB_SWAP_EXISTING_WRAPPED_SOL:'There is existing WSOL in this route account. It will not be unwrapped as a side effect; this route is not supported.',
   WEB_SWAP_REVIEW_EXPIRED:'The review expired or changed. Request a new one.',
   WEB_SWAP_PENDING_CHECK_REQUIRED:'There is a pending operation or an unknown result. Check its status; do not repeat it.',
   WEB_SWAP_STATUS_UNVERIFIED:'Solana did not return a complete, verifiable status. The operation remains pending; do not repeat it.',
   WEB_SWAP_ROUTE_TOO_LARGE:'This route exceeds the supported size. Nothing was signed; request another quote.',
   WEB_SWAP_INSUFFICIENT_FUNDS:'Insufficient token balance or SOL for costs.',
   WEB_WALLET_NETWORK_UNAVAILABLE:'Solana could not be queried. No transaction will be resent automatically.',
   WEB_SWAP_SIMULATION_FAILED:'The simulation rejected the swap. Nothing was sent.',
   WALLET_LOCKED:'Wallet locked. Unlock it again.'
  };
  $('swap-status').textContent=messages[e?.message]||'The request could not be validated. If you had confirmed, check the pending operation before repeating it.';reset();
 }finally{busy=false;render();}
}
function units(value,decimals){if(!/^(0|[1-9][0-9]{0,12})(\.[0-9]+)?$/.test(value))throw Error('AMOUNT');const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw Error('AMOUNT');const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));if(n<=0n)throw Error('AMOUNT');return n.toString();}
async function refreshBalance(address){const response=await fetch('/api/solana-portfolio?address='+encodeURIComponent(address),{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('BALANCE');const value=await response.json();if(value.address!==address||value.network!=='solana:mainnet'||value.ok!==true||Date.now()-Date.parse(value.updatedAt)>120000)throw Error('BALANCE');if(session.current()?.address!==address)return;$('wallet-balance').textContent=String(value.sol?.amount)+' SOL · '+(value.tokens?.filter(t=>t.mint===I.USDC).reduce((sum,t)=>sum+t.amount,0)??'--')+' USDC · public balance; costs are checked during review.';}
$('wallet-unlock').onclick=()=>run(async()=>{reset();const ticket=++unlockGeneration,file=$('wallet-backup').files?.[0];if(!file||file.size!==84)throw Error('UNSUPPORTED_WALLET_BACKUP');const backup=new Uint8Array(await file.arrayBuffer());let password=$('wallet-password').value;$('wallet-password').value='';try{const current=await session.unlock(backup,password,$('wallet-address').value.trim());if(ticket!==unlockGeneration){session.lock();throw Error('WALLET_LOCKED');}$('wallet-status').textContent='Unlocked: '+current.address+'. It will lock when the tab is hidden or after five minutes.';await refreshBalance(current.address);}finally{password='';backup.fill(0);$('wallet-backup').value='';}});
$('wallet-lock').onclick=lock;
$('wallet-create-consent').onchange=render;
$('wallet-create').onclick=()=>run(async()=>{if(!$('wallet-create-consent').checked)throw Error('CONSENT_REQUIRED');session.lock();reset();let password=$('wallet-password').value;$('wallet-password').value='';const entropy=crypto.getRandomValues(new Uint8Array(32));let backup,seed;try{backup=await sealPortableWalletBackup(entropy,password);seed=await deriveAndroidSolanaSeed(entropy);const address=bs58.encode(ed25519.getPublicKey(seed));const url=URL.createObjectURL(new Blob([backup],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='JamdDmaj-'+address.slice(0,8)+'.jamdwallet';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('wallet-address').value=address;$('wallet-backup').value='';$('wallet-create-consent').checked=false;$('wallet-status').textContent='New wallet created, still locked. Open the downloaded backup with its password to verify recovery before using it. This is not the previous wallet.';}finally{password='';entropy.fill(0);seed?.fill(0);backup?.fill(0);}});
for(const id of ['wallet-address','swap-pay','swap-value','swap-slippage'])$(id).addEventListener('input',()=>{if(id==='wallet-address')lock();else reset();render();});
$('wallet-backup').addEventListener('change',()=>{unlockGeneration++;session.lock();reset();render();});
$('swap-review').onclick=()=>run(async()=>{reset();const current=session.current();if(!current)throw Error('WALLET_LOCKED');const input=$('swap-pay').value,nativeInput=input==='SOL';const value=await engine.prepare({payer:current.address,inputMint:I[input],outputMint:nativeInput?I.USDC:I.SOL,amount:units($('swap-value').value.trim(),nativeInput?9:6),slippageBps:Number($('swap-slippage').value)});if(session.current()?.address!==value.address)throw Error('WALLET_LOCKED');review=value;for(const text of ['Wallet: '+value.address,'You pay: '+decimal(value.input,nativeInput?9:6)+' '+input,'You receive at least: '+decimal(value.minimum,nativeInput?6:9)+' '+(nativeInput?'USDC':'SOL'),'Fee: '+decimal(value.fee,9)+' SOL','SOL reserved in accounts: '+decimal(value.rent,9)]){const p=document.createElement('p');p.textContent=text;$('swap-summary').append(p);}expiry=setTimeout(()=>{reset();$('swap-status').textContent='Review expired. Request another before signing.';render();},Math.max(0,value.expiresAt-Date.now()));});
$('swap-approve').onchange=render;
$('swap-confirm').onclick=()=>run(async()=>{if(!review||!$('swap-approve').checked)throw Error('WEB_SWAP_APPROVAL_REQUIRED');const approved=review,grant=engine.authorize(approved,true);const signed=await session.signReviewed(grant);const signature=await engine.submit(approved,signed);reset();$('swap-status').textContent='Sent to Solana, not yet confirmed: '+signature+'. Press Check pending operation.';});
$('swap-pending').onclick=()=>run(async()=>{const address=session.current()?.address||$('wallet-address').value.trim(),pending=await engine.checkPending(address);$('swap-status').textContent=webWalletPendingText(pending);if(session.current())await refreshBalance(address);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});window.addEventListener('pagehide',()=>{lock();journal?.close();});setInterval(()=>{if(!session.current()&&review)reset();render();},1000);
const expected=new URL(location.href).searchParams.get('address');if(expected&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expected))$('wallet-address').value=expected;
try{journal=await openWebSwapJournal();engine=createWebSwapEngine({rpc,journal,isForeground:()=>!document.hidden&&!!session.current()});render();}catch{$('wallet-status').textContent='The secure pending-operation journal could not be opened. This page cannot operate without it.';}
