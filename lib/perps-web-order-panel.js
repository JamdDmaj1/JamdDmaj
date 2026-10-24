import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {createWebPerpsSigningReviewClient,authorizeWebPerpsOwnerSignature,signReviewedWebPerpsOrder,claimWebPerpsServerHandoff,openWebPerpsSigningJournal,readWebPerpsWalletSession} from './perps-web-wallet-session.js';
import {createWebPerpsSubmissionClient} from './perps-web-submit-client.js';
import {currentWalletTradingState} from './wallet-trading-state.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
// UI orchestration only. Every signature is separately approved. Availability,
// private owner review, exact signed wire and durable risk are checked server-side.
export function setupWebPerpsOrderPanel(parent,{doc,language='es',policyClient,readSessionToken,now=Date.now,monotonicNow=()=>performance.now(),openJournal=openWebPerpsSigningJournal}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const fetchImpl=doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch;
 const reviewClient=createWebPerpsSigningReviewClient({doc,fetchImpl,readSessionToken,now,monotonicNow});
 const panel=node('section');panel.className='trade-order-summary';panel.hidden=true;const summary=node('p'),consent=node('input');consent.type='checkbox';consent.checked=false;
 const label=node('label');label.append(consent,node('span',t('Revisé la orden y autorizo firmarla en Phantom y enviarla una sola vez.','I reviewed the order and authorize signing in Phantom and submitting it once.')));
 const confirm=node('button',t('Confirmar, firmar y enviar','Confirm, sign and submit'));confirm.type='button';const status=node('p');status.setAttribute('role','status');panel.append(summary,label,confirm,status);parent.append(panel);
 let current=null,busy=false,disposed=false,revision=0,expiry,journal=null;
 function render(){confirm.disabled=busy||disposed||!current||!consent.checked;consent.disabled=busy||disposed||!current;}
 function invalidate(){revision++;current=null;consent.checked=false;clearTimeout(expiry);render();}
 const selected=()=>selectedWalletAccount(doc)?.source==='external'?selectedWalletAccount(doc).address:null;
 let observed=selected();const changed=()=>{if(selected()!==observed||!readWebPerpsWalletSession(doc)){observed=selected();invalidate();panel.hidden=true;}};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);doc.addEventListener?.('jamd-web-wallet-session',changed);consent.onchange=render;
 const getJournal=async()=>journal??=await openJournal({indexedDB:doc.defaultView?.indexedDB,now});
 function guard(ticket,wallet,token){if(disposed||ticket!==revision||selected()!==wallet||readSessionToken()!==token||!readWebPerpsWalletSession(doc)||doc.hidden===true||doc.visibilityState!=='visible'||doc.hasFocus?.()!==true)throw Error('WEB_REVIEW_CHANGED');}
 async function prepare(draft){
  if(busy||disposed)return;invalidate();const ticket=revision,wallet=selected(),token=readSessionToken();busy=true;panel.hidden=false;summary.textContent='';status.textContent=t('Comprobando límites, saldo, orden y comisiones. No se pedirá firma todavía.','Checking limits, funds, order and fees. No signature will be requested yet.');render();
  try{
   guard(ticket,wallet,token);const policy=await policyClient.read(wallet);guard(ticket,wallet,token);
   if(!policy.policy)throw Error('MANUAL_LIMITS_REQUIRED');if(!policy.executionAvailable)throw Error('WEB_EXECUTION_UNAVAILABLE');
   const ledger=await getJournal();guard(ticket,wallet,token);if((await ledger.pending(wallet)).length)throw Error('WEB_PENDING_OPERATION');
   // Display-only early refusal. Absence/staleness does not invent funds or
   // replace the independent server funding and signed-wire checks.
   const observed=currentWalletTradingState(doc,now());
   if(observed?.account.address===wallet&&observed.snapshot){
    if(BigInt(observed.snapshot.availableUsdcUnits)<BigInt(exactUsdUnits(draft.margin)))throw Error('PERPS_MANUAL_INSUFFICIENT_USDC');
    if(BigInt(observed.snapshot.payerLamports)<1000000n)throw Error('PERPS_MANUAL_INSUFFICIENT_SOL');
   }
   const review=await reviewClient.prepare(draft);guard(ticket,wallet,token);
   current={review,policy:policy.policy,wallet,token,ticket};
   const amount=(v,d)=>{const s=v.padStart(d+1,'0');return s.slice(0,-d)+'.'+s.slice(-d);};
   summary.textContent=draft.asset+' · '+draft.side+' · '+draft.margin+' USDC · '+draft.leverage+'× · '+t('Red: ','Network: ')+amount(review.networkFeeLamports,9)+' SOL · '+t('Renta: ','Rent: ')+amount(review.rentLockedLamports,9)+' SOL · SL '+(draft.stopLoss??'—')+' · TP '+(draft.takeProfit??'—');
   status.textContent=t('Revisa y confirma antes de que venza. Phantom mostrará su propia aprobación.','Review and confirm before expiry. Phantom will display its own approval.');
   expiry=setTimeout(()=>{if(current?.ticket===ticket&&!busy){invalidate();status.textContent=t('Revisión vencida. Revisa otra vez; no se envió nada.','Review expired. Review again; nothing was submitted.');}},Math.max(1,review.expiresAt-now()));expiry?.unref?.();
  }catch(error){if(!disposed&&ticket===revision){invalidate();status.textContent=error?.message==='MANUAL_LIMITS_REQUIRED'?t('Configura primero los límites manuales de esta billetera.','Configure this wallet’s manual limits first.'):
    error?.message==='WEB_EXECUTION_UNAVAILABLE'?t('La ejecución web todavía está deshabilitada en el servidor. No se pidió firma.','Web execution is still disabled on the server. No signature was requested.'):
    error?.message==='WEB_PENDING_OPERATION'?t('Hay una operación pendiente. Consulta su estado; no repitas la orden.','An operation is pending. Check its status; do not repeat the order.'):
    error?.message==='PERPS_MANUAL_INSUFFICIENT_USDC'?t('El saldo USDC de esta billetera es menor que el margen solicitado. El mínimo del formulario es 10 USDC. Tus SOL no se convierten automáticamente. No se pidió firma ni se envió una orden.','This wallet has less USDC than the requested margin. The form minimum is 10 USDC. SOL is not converted automatically. No signature or order submission was requested.'):
    error?.message==='PERPS_MANUAL_INSUFFICIENT_SOL'?t('Esta billetera no tiene la reserva mínima de SOL para comenzar la revisión. Los costos y la renta se comprobarán de nuevo antes de firmar. No se envió una orden.','This wallet lacks the minimum SOL reserve to begin review. Fees and rent are checked again before signing. No order was submitted.'):
    t('No se pudo preparar una revisión válida. Comprueba USDC para el margen, SOL para costos, límites manuales, sesión de Google y conexión de Phantom. No se pidió firma.','A valid review could not be prepared. Check USDC margin funds, SOL fees, manual limits, Google session and Phantom connection. No signature was requested.');}}
  finally{busy=false;render();if(disposed)journal?.close();}
 }
 confirm.onclick=async()=>{
  if(busy||disposed||!current||consent.checked!==true)return;const operation=current;busy=true;render();let signingStarted=false;
  try{
   guard(operation.ticket,operation.wallet,operation.token);const policy=await policyClient.read(operation.wallet);guard(operation.ticket,operation.wallet,operation.token);
   if(!policy.executionAvailable||policy.policy?.revision!==operation.policy.revision)throw Error('POLICY_CHANGED');
   const ledger=await getJournal();guard(operation.ticket,operation.wallet,operation.token);signingStarted=true;
   const grant=await authorizeWebPerpsOwnerSignature(operation.review,{doc,journal:ledger,explicitApproval:true});
   status.textContent=t('Revisa la orden en Phantom. No apruebes si no coincide.','Review the order in Phantom. Do not approve if it differs.');
   const signed=await signReviewedWebPerpsOrder(doc,grant);guard(operation.ticket,operation.wallet,operation.token);
   const claim=await claimWebPerpsServerHandoff(signed,{doc,journal:ledger,explicitApproval:true});
   const result=await createWebPerpsSubmissionClient({doc,journal:ledger,fetchImpl,readSessionToken}).submit(claim);
   if(!disposed&&selected()===operation.wallet)status.textContent=result.stage==='WEB_PERPS_BROADCAST_ACKNOWLEDGED'?t('El servicio recibió el envío. Sigue pendiente de confirmación en la red; no repitas la orden.','The service acknowledged submission. Network confirmation is still pending; do not repeat the order.'):
    t('Envío sin confirmar. Se conserva el registro pendiente. Consulta el estado; no repitas la orden.','Submission unconfirmed. The pending record is retained. Check status; do not repeat the order.');
  }catch{if(!disposed&&selected()===operation.wallet)status.textContent=signingStarted?t('Firma o envío sin confirmar. Se conserva cualquier registro pendiente; consulta su estado antes de otra orden.','Signature or submission unconfirmed. Any pending record is retained; check its status before another order.'):
    t('La revisión o los límites cambiaron. Revisa otra vez; no se pidió firma.','Review or limits changed. Review again; no signature was requested.');}
  finally{invalidate();busy=false;render();if(disposed)journal?.close();}
 };
 render();return Object.freeze({prepare,invalidate,panel,summary,status,consent,confirm,dispose(){disposed=true;invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('jamd-web-wallet-session',changed);if(!busy)journal?.close();}});
}
