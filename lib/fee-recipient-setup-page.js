import bs58 from 'bs58';
import {recipientSetupProtocol,setupBytes,setupBase64} from './fee-recipient-setup-protocol.js';
const PENDING='jamddmaj-fee-recipient-setup-v1';
const UI_VERSION='2026.10.27.4';
const failures={
 SETUP_REVIEW_EXPIRED:'La revisión venció mientras Phantom estaba abierto. La firma no se envió. Descarta esta revisión y prepara otra; revisa y aprueba antes de que venza.',
 SETUP_WALLET_TRANSACTION_CHANGED:'Phantom devolvió una operación distinta a la revisada. No se envió. No vuelvas a confirmar todavía; conserva este mensaje. Código: SETUP_WALLET_TRANSACTION_CHANGED.',
 SETUP_FOCUS_NOT_RETURNED:'La página no recuperó el foco después de Phantom. La firma no se envió. Descarta esta revisión antes de preparar otra. Código: SETUP_FOCUS_NOT_RETURNED.',
 SETUP_ACCOUNT_CHANGED:'La cuenta o la revisión cambió durante la aprobación. No se envió. Conecta la cuenta indicada y prepara una revisión nueva.',
 SETUP_SIGNATURE_INVALID:'No se pudo verificar la firma devuelta por Phantom. No se envió. Código: SETUP_SIGNATURE_INVALID.',
 SETUP_WALLET_SIGN_FAILED:'Phantom no devolvió una firma utilizable. Esta pantalla no envió la operación. Código: SETUP_WALLET_SIGN_FAILED.',
 SETUP_WALLET_DECLINED:'Phantom rechazó o canceló la solicitud de firma. Esta pantalla no envió la operación. Código: SETUP_WALLET_DECLINED.',
 SETUP_PENDING_STORAGE_FAILED:'El navegador no pudo guardar el estado requerido. Esta pantalla no envió la operación. Código: SETUP_PENDING_STORAGE_FAILED.',
 SETUP_LOCAL_CHECK_FAILED:'Una comprobación local interrumpió el proceso antes del envío. Código: SETUP_LOCAL_CHECK_FAILED.'
};
function amount(text){const s=String(text).padStart(10,'0');return s.slice(0,-9)+'.'+s.slice(-9).replace(/0+$/,'');}
export function setupFeeRecipientSetupPage({doc,registry,fetchImpl,storage,locks,now=Date.now,protocol=recipientSetupProtocol,waitForFocus}={}){
 const FEE=protocol.policy,{validateRecipientSetupPacket,validateSignedRecipientSetup}=protocol;
 const ids=['recipient','wallets','connect','mobile','wallet-status','prepare','summary','account','consent','confirm','recover','discard','status'];
 const el=Object.fromEntries(ids.map(id=>[id,doc.getElementById(id)]));
 const version=doc.getElementById('flow-version');if(version)version.textContent='Asistente '+UI_VERSION;
 let wallet=null,account=null,packet=null,busy=false,revision=0,unsubscribe=null,expiry;
 el.recipient.textContent=FEE.recipient;el.consent.checked=false;
 function pending(){const raw=storage.getItem(PENDING);if(!raw)return null;const p=JSON.parse(raw);if(!p||!['SIGNING','SUBMITTING'].includes(p.stage)||p.stage==='SUBMITTING'&&typeof p.signature!=='string')throw Error('PENDING_STORAGE');return p;}
 function foreground(){return !doc.hidden&&doc.visibilityState==='visible'&&doc.hasFocus();}
 async function regainFocus(){
  if(foreground())return;
  // Extension approval can resolve before its popup returns browser focus.
  // Never send from a hidden/unfocused page or wait beyond this single attempt.
  if(waitForFocus)await waitForFocus();
  else await new Promise(resolve=>{const started=performance.now();const poll=()=>{if(foreground()||performance.now()-started>=3000)resolve();else setTimeout(poll,50);};poll();});
  if(!foreground())throw Error('SETUP_FOCUS_NOT_RETURNED');
 }
 function connected(){
  const f=wallet?.features?.['solana:signTransaction'];
  return account?.address===FEE.recipient&&account.publicKey instanceof Uint8Array&&bs58.encode(account.publicKey)===FEE.recipient
   &&account.chains?.includes('solana:mainnet')&&account.features?.includes('solana:signTransaction')
   &&wallet.accounts?.some(a=>a.address===FEE.recipient)&&f?.supportedTransactionVersions?.includes('legacy')&&typeof f.signTransaction==='function';
 }
 function invalidate(){packet=null;revision++;el.consent.checked=false;clearTimeout(expiry);render();}
 function render(){
  let p;try{p=pending();}catch{p={stage:'STORAGE_ERROR'};}
  el.confirm.disabled=busy||!packet||!connected()||!foreground()||!el.consent.checked||now()>=packet.reviewExpiresAt||!!p;
  el.prepare.disabled=busy||!!p;el.connect.disabled=busy;el.wallets.disabled=busy;el.recover.disabled=busy;
  el.consent.disabled=busy||!packet||!!p;el.discard.hidden=p?.stage!=='SIGNING';el.discard.disabled=busy;
 }
 function inventory(){
  el.wallets.replaceChildren();for(const w of registry.get().filter(w=>String(w.name).toLowerCase()==='phantom'&&typeof w.features?.['standard:connect']?.connect==='function')){
   const option=doc.createElement('option');option.textContent=String(w.name).slice(0,60);option.value=String(registry.get().indexOf(w));el.wallets.append(option);
  }
  if(!el.wallets.children.length){const o=doc.createElement('option');o.textContent='No se detectó Phantom. Usa su navegador móvil o su extensión.';o.value='';el.wallets.append(o);}
 }
 async function api(body){
  const r=await fetchImpl('/api/fee-recipient-setup',{method:body?'POST':'GET',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{Accept:'application/json',...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(20000)});
  if(r.redirected||r.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('SERVICE');
  const text=await r.text();if(text.length>10000)throw Error('SERVICE');const value=JSON.parse(text);if(r.status!==200||value.ok!==true||!value.result)throw Error('SERVICE');return value.result;
 }
 async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){
  let p,code=Object.hasOwn(failures,error?.message||'')?error.message:'SETUP_LOCAL_CHECK_FAILED';
  try{p=pending();if(p?.stage==='SIGNING')storage.setItem(PENDING,JSON.stringify({...p,failureCode:code,uiVersion:UI_VERSION}));}catch{}
  el.status.textContent=p?.stage==='SUBMITTING'?'No se confirmó el envío. Consulta el resultado pendiente; no repitas la operación.':failures[code];
 }finally{busy=false;render();}}
 el.connect.onclick=()=>run(async()=>{
  invalidate();unsubscribe?.();wallet=null;account=null;
  const w=registry.get()[Number(el.wallets.value)];if(!w||String(w.name).toLowerCase()!=='phantom')throw Error('WALLET');
  const result=await w.features['standard:connect'].connect({silent:false});
  wallet=w;account=result.accounts?.find(a=>a.address===FEE.recipient)||null;
  if(!connected()){account=null;el['wallet-status'].textContent='Selecciona en Phantom la cuenta '+FEE.recipient+'. Ninguna otra billetera puede autorizar esta configuración.';return;}
  const events=w.features['standard:events'];if(events?.on)unsubscribe=events.on('change',()=>{account=null;invalidate();el['wallet-status'].textContent='La cuenta de Phantom cambió. Conecta de nuevo antes de firmar.';});
  el['wallet-status'].textContent='Phantom conectada · '+FEE.recipient;
 });
 el.prepare.onclick=()=>run(async()=>{
  if(pending())throw Error('PENDING');invalidate();el.summary.textContent='Consultando coste y simulación…';const value=await api();
  if(value.stage==='FEE_RECIPIENT_USDC_ALREADY_EXISTS'&&value.owner===FEE.recipient&&value.mint===FEE.mint){el.summary.textContent='La cuenta USDC ya está disponible. No hace falta crearla ni pagar otra vez.';el.account.textContent=value.destination;return;}
  await validateRecipientSetupPacket(value,{now:now()});packet=Object.freeze(value);
  el.summary.textContent='Reserva de la cuenta: '+amount(value.rentReserveLamports)+' SOL · Red: '+amount(value.networkFeeLamports)+' SOL · Total estimado: '+amount(value.estimatedTotalLamports)+' SOL. No se transferirá USDC.';
  el.account.textContent='Cuenta USDC: '+value.destination;el.status.textContent='Revisa los importes. La revisión dura 60 segundos, incluyendo el tiempo en Phantom. Si vence, no se enviará la firma; tendrás que preparar otra.';
  expiry=setTimeout(()=>{invalidate();el.status.textContent='La revisión venció. Consulta y prepara una nueva antes de firmar.';},Math.max(1,value.reviewExpiresAt-now()));expiry?.unref?.();
 });
 el.consent.onchange=render;
 el.confirm.onclick=()=>run(async()=>{
  if(!locks?.request)throw Error('LOCK_UNAVAILABLE');
  await locks.request('jamddmaj-fee-recipient-setup',{ifAvailable:true},async lock=>{
   if(!lock||pending()||!packet||!connected()||!foreground()||!el.consent.checked)throw Error('NOT_APPROVED');
   const selected=packet,ticket=revision,feature=wallet.features['solana:signTransaction'];
   await validateRecipientSetupPacket(selected,{now:now()});
   if(ticket!==revision||!connected()||!foreground())throw Error('CHANGED');
   try{storage.setItem(PENDING,JSON.stringify({stage:'SIGNING',createdAt:now(),uiVersion:UI_VERSION}));}catch{throw Error('SETUP_PENDING_STORAGE_FAILED');}render();
   let results;try{results=await feature.signTransaction({account,chain:'solana:mainnet',transaction:setupBytes(selected.serializedTxBase64),options:{preflightCommitment:'confirmed',minContextSlot:selected.observedSlot}});}
   catch(error){throw Error(now()>=selected.reviewExpiresAt?'SETUP_REVIEW_EXPIRED':error?.code===4001||error?.code==='ACTION_REJECTED'?'SETUP_WALLET_DECLINED':'SETUP_WALLET_SIGN_FAILED');}
   if(now()>=selected.reviewExpiresAt)throw Error('SETUP_REVIEW_EXPIRED');
   if(!Array.isArray(results)||results.length!==1||!(results[0]?.signedTransaction instanceof Uint8Array))throw Error('SETUP_SIGNATURE_INVALID');
   const wire=results[0].signedTransaction,original=setupBytes(selected.serializedTxBase64);
   if(wire.length!==original.length||wire[0]!==1||wire.subarray(65).some((value,i)=>value!==original[65+i]))throw Error('SETUP_WALLET_TRANSACTION_CHANGED');
   const signedBase64=setupBase64(wire);let signed;
   try{signed=await validateSignedRecipientSetup(selected,signedBase64,{now:now()});}catch{throw Error(now()>=selected.reviewExpiresAt?'SETUP_REVIEW_EXPIRED':'SETUP_SIGNATURE_INVALID');}
   await regainFocus();
   if(now()>=selected.reviewExpiresAt)throw Error('SETUP_REVIEW_EXPIRED');
   if(ticket!==revision||!connected())throw Error('SETUP_ACCOUNT_CHANGED');
   try{storage.setItem(PENDING,JSON.stringify({stage:'SUBMITTING',signature:signed.signature,createdAt:now(),uiVersion:UI_VERSION}));}catch{throw Error('SETUP_PENDING_STORAGE_FAILED');}
   invalidate();const response=await api({action:'submit',packet:selected,signedBase64,explicitApproval:true});
   if(response.signature!==signed.signature)throw Error('SIGNATURE');
   if(response.accountReady===true&&response.stage==='RECIPIENT_ACCOUNT_ALREADY_READY'){storage.removeItem(PENDING);el.status.textContent='La cuenta USDC ya estaba creada. Esta pantalla no envió otra operación.';}
   else el.status.textContent='Envío pendiente de confirmación. Pulsa «Consultar resultado pendiente»; no vuelvas a firmar.';
  });
 });
 el.recover.onclick=()=>run(async()=>{
  const p=pending();if(!p){el.status.textContent='No hay ningún envío registrado en este navegador.';return;}
  if(p.stage==='SIGNING'){el.status.textContent=Object.hasOwn(failures,p.failureCode||'')?failures[p.failureCode]:'La revisión guardada no incluye la causa del fallo. Esta pantalla no registró un envío. Código: SETUP_LEGACY_SIGNING. Descarta esta revisión antes de preparar otra.';return;}
  const result=await api({action:'recover',signature:p.signature});if(result.signature!==p.signature)throw Error('SIGNATURE');
  if(result.accountReady===true){storage.removeItem(PENDING);invalidate();el.status.textContent=result.stage==='RECIPIENT_SETUP_CONFIRMED'?'Cuenta USDC disponible y operación finalizada.':'La cuenta USDC está disponible; esta firma aún no está confirmada. No hace falta crear otra cuenta.';}
  else if(result.stage==='RECIPIENT_SETUP_FAILED'){storage.removeItem(PENDING);invalidate();el.status.textContent='La red confirmó que la operación falló. No se reintentó automáticamente.';}
  else el.status.textContent='Todavía sin confirmación. Se conserva el registro; no repitas la operación.';
 });
 el.discard.onclick=()=>{if(!busy&&pending()?.stage==='SIGNING'){storage.removeItem(PENDING);invalidate();el.status.textContent='Revisión descartada sin envío desde esta pantalla.';}};
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&!busy)invalidate();else render();});inventory();registry.on('register',inventory);registry.on('unregister',inventory);render();
 return Object.freeze({elements:el,render});
}
