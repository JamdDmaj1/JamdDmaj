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
 if(!current&&$('wallet-status').textContent.startsWith('Desbloqueada:'))$('wallet-status').textContent='Bloqueada automáticamente por seguridad. Desbloquéala de nuevo para operar.';
 let countdown=$('swap-countdown');if(!countdown){countdown=document.createElement('p');countdown.id='swap-countdown';$('swap-summary').after(countdown);}countdown.textContent=review?'Revisión vigente durante '+webWalletReviewSeconds(review.expiresAt)+' s. Al caducar debes revisar de nuevo.':'';
}
function lock(){unlockGeneration++;session.lock();reset();$('wallet-password').value='';$('wallet-backup').value='';$('wallet-status').textContent='Bloqueada. Tus claves no se guardaron en este navegador.';render();}
async function run(fn){
 if(busy)return;busy=true;render();
 try{await fn();}catch(e){
  const messages={
   RECOVERED_WALLET_MISMATCH:'El respaldo pertenece a otra dirección. No se sustituyó tu billetera.',
   BACKUP_RECOVERY_FAILED:'Contraseña incorrecta o respaldo dañado.',
   INVALID_BACKUP_PASSWORD:'La contraseña debe tener entre 16 y 1024 caracteres.',
   EXPECTED_WALLET_REQUIRED:'Introduce la dirección pública que esperas recuperar.',
   UNSUPPORTED_WALLET_BACKUP:'No es un respaldo cifrado de la billetera principal JamdDmaj.',
   AMOUNT:'Introduce una cantidad positiva del token que entregas, con sus decimales correctos.',
   WEB_SWAP_POLICY_REJECTED:'Esta ruta no cumple las comprobaciones de seguridad. No se firmó. Puedes solicitar otra revisión.',
   WEB_SWAP_EXISTING_WRAPPED_SOL:'Hay WSOL previo en la cuenta de esta ruta. No se desenvolverá como efecto secundario; esta ruta no está admitida.',
   WEB_SWAP_REVIEW_EXPIRED:'La revisión caducó o cambió. Solicita una nueva.',
   WEB_SWAP_PENDING_CHECK_REQUIRED:'Hay una operación pendiente o un resultado desconocido. Consulta su estado; no la repitas.',
   WEB_SWAP_STATUS_UNVERIFIED:'Solana no devolvió un estado completo y verificable. La operación sigue pendiente; no la repitas.',
   WEB_SWAP_ROUTE_TOO_LARGE:'Esta ruta excede el tamaño admitido. No se firmó; solicita otra cotización.',
   WEB_SWAP_INSUFFICIENT_FUNDS:'Saldo insuficiente del token o de SOL para los costes.',
   WEB_WALLET_NETWORK_UNAVAILABLE:'No se pudo consultar Solana. No se repetirá automáticamente ningún envío.',
   WEB_SWAP_SIMULATION_FAILED:'La simulación rechazó el intercambio. No se envió.',
   WALLET_LOCKED:'Billetera bloqueada. Desbloquéala de nuevo.'
  };
  $('swap-status').textContent=messages[e?.message]||'No se pudo validar la solicitud. Si habías confirmado, consulta la operación pendiente antes de repetirla.';reset();
 }finally{busy=false;render();}
}
function units(value,decimals){if(!/^(0|[1-9][0-9]{0,12})(\.[0-9]+)?$/.test(value))throw Error('AMOUNT');const [whole,fraction='']=value.split('.');if(fraction.length>decimals)throw Error('AMOUNT');const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));if(n<=0n)throw Error('AMOUNT');return n.toString();}
async function refreshBalance(address){const response=await fetch('/api/solana-portfolio?address='+encodeURIComponent(address),{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('BALANCE');const value=await response.json();if(value.address!==address||value.network!=='solana:mainnet'||value.ok!==true||Date.now()-Date.parse(value.updatedAt)>120000)throw Error('BALANCE');if(session.current()?.address!==address)return;$('wallet-balance').textContent=String(value.sol?.amount)+' SOL · '+(value.tokens?.filter(t=>t.mint===I.USDC).reduce((sum,t)=>sum+t.amount,0)??'—')+' USDC · saldo público; los costes se comprueban al revisar.';}
$('wallet-unlock').onclick=()=>run(async()=>{reset();const ticket=++unlockGeneration,file=$('wallet-backup').files?.[0];if(!file||file.size!==84)throw Error('UNSUPPORTED_WALLET_BACKUP');const backup=new Uint8Array(await file.arrayBuffer());let password=$('wallet-password').value;$('wallet-password').value='';try{const current=await session.unlock(backup,password,$('wallet-address').value.trim());if(ticket!==unlockGeneration){session.lock();throw Error('WALLET_LOCKED');}$('wallet-status').textContent='Desbloqueada: '+current.address+'. Se bloqueará al ocultar la pestaña o en un máximo de cinco minutos.';await refreshBalance(current.address);}finally{password='';backup.fill(0);$('wallet-backup').value='';}});
$('wallet-lock').onclick=lock;
$('wallet-create-consent').onchange=render;
$('wallet-create').onclick=()=>run(async()=>{if(!$('wallet-create-consent').checked)throw Error('CONSENT_REQUIRED');session.lock();reset();let password=$('wallet-password').value;$('wallet-password').value='';const entropy=crypto.getRandomValues(new Uint8Array(32));let backup,seed;try{backup=await sealPortableWalletBackup(entropy,password);seed=await deriveAndroidSolanaSeed(entropy);const address=bs58.encode(ed25519.getPublicKey(seed));const url=URL.createObjectURL(new Blob([backup],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='JamdDmaj-'+address.slice(0,8)+'.jamdwallet';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('wallet-address').value=address;$('wallet-backup').value='';$('wallet-create-consent').checked=false;$('wallet-status').textContent='Nueva billetera creada, todavía bloqueada. Abre el respaldo descargado con su contraseña para verificar la recuperación antes de usarla. No es la billetera anterior.';}finally{password='';entropy.fill(0);seed?.fill(0);backup?.fill(0);}});
for(const id of ['wallet-address','swap-pay','swap-value','swap-slippage'])$(id).addEventListener('input',()=>{if(id==='wallet-address')lock();else reset();render();});
$('wallet-backup').addEventListener('change',()=>{unlockGeneration++;session.lock();reset();render();});
$('swap-review').onclick=()=>run(async()=>{reset();const current=session.current();if(!current)throw Error('WALLET_LOCKED');const input=$('swap-pay').value,nativeInput=input==='SOL';const value=await engine.prepare({payer:current.address,inputMint:I[input],outputMint:nativeInput?I.USDC:I.SOL,amount:units($('swap-value').value.trim(),nativeInput?9:6),slippageBps:Number($('swap-slippage').value)});if(session.current()?.address!==value.address)throw Error('WALLET_LOCKED');review=value;for(const text of ['Billetera: '+value.address,'Entregas: '+decimal(value.input,nativeInput?9:6)+' '+input,'Recibes al menos: '+decimal(value.minimum,nativeInput?6:9)+' '+(nativeInput?'USDC':'SOL'),'Comisión: '+decimal(value.fee,9)+' SOL','SOL reservado en cuentas: '+decimal(value.rent,9)]){const p=document.createElement('p');p.textContent=text;$('swap-summary').append(p);}expiry=setTimeout(()=>{reset();$('swap-status').textContent='Revisión caducada. Solicita otra antes de firmar.';render();},Math.max(0,value.expiresAt-Date.now()));});
$('swap-approve').onchange=render;
$('swap-confirm').onclick=()=>run(async()=>{if(!review||!$('swap-approve').checked)throw Error('WEB_SWAP_APPROVAL_REQUIRED');const approved=review,grant=engine.authorize(approved,true);const signed=await session.signReviewed(grant);const signature=await engine.submit(approved,signed);reset();$('swap-status').textContent='Enviada a Solana, aún no confirmada: '+signature+'. Pulsa Consultar operación pendiente.';});
$('swap-pending').onclick=()=>run(async()=>{const address=session.current()?.address||$('wallet-address').value.trim(),pending=await engine.checkPending(address);$('swap-status').textContent=webWalletPendingText(pending);if(session.current())await refreshBalance(address);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});window.addEventListener('pagehide',()=>{lock();journal?.close();});setInterval(()=>{if(!session.current()&&review)reset();render();},1000);
const expected=new URL(location.href).searchParams.get('address');if(expected&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expected))$('wallet-address').value=expected;
try{journal=await openWebSwapJournal();engine=createWebSwapEngine({rpc,journal,isForeground:()=>!document.hidden&&!!session.current()});render();}catch{$('wallet-status').textContent='No se pudo abrir el registro seguro de pendientes. Esta página no permite operar sin él.';}
