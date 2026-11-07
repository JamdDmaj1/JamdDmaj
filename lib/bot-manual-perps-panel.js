import {createBotManualPerpsClient} from './bot-manual-perps-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {setupBotManualPositionsPanel} from './bot-manual-positions-panel.js';
import {setupBotManualRecoveryPanel} from './bot-manual-recovery-panel.js';
export function setupBotManualPerpsPanel(parent,{doc,language='es',client:providedClient}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='trade-order-summary';panel.hidden=true;
 const summary=node('div'),status=node('p'),approval=node('input');approval.type='checkbox';
 const label=node('label');label.setAttribute('style','display:flex;align-items:flex-start;gap:10px');approval.setAttribute('style','width:20px;height:20px;flex:0 0 20px;margin:3px 0');label.append(approval,node('span',t('Confirmo esta orden y su comisión del 0,20 % del margen en USDC, más costes de red en SOL. No activa el bot.','I approve this order and its 0.20% of margin fee in USDC, plus network costs in SOL. This does not activate the bot.')));
 const confirm=node('button',t('Confirmar orden manual del bot','Confirm manual bot order')),recover=node('button',t('Consultar orden manual del bot','Check manual bot order'));
 const continueOpening=node('button',t('Revisar apertura · segundo paso','Review opening · second step'));continueOpening.type='button';continueOpening.hidden=true;panel.append(continueOpening);
 confirm.type=recover.type='button';status.setAttribute('role','status');panel.append(node('h3',t('Revisar orden','Review order')),summary,label,confirm,recover,status);parent.append(panel);
 const win=doc.defaultView||globalThis,client=providedClient||createBotManualPerpsClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
 const positionsPanel=setupBotManualPositionsPanel(parent,{doc,language,client});
 const recoveryPanel=setupBotManualRecoveryPanel(parent,{doc,language,client});
 let review=null,busy=false,revision=0,disposed=false,timer,operation=null;
 const wallet=()=>selectedWalletAccount(doc)?.address;
 function render(){label.hidden=confirm.hidden=summary.hidden=!review;confirm.disabled=busy||disposed||!review||!approval.checked||Date.now()>=review.expiresAt;recover.disabled=busy||!operation;recover.hidden=!operation;
  continueOpening.hidden=!!review||!operation?.requiresOpeningReview||!operation?.draft;continueOpening.disabled=busy||disposed;
  recoveryPanel.setOperation(operation?.fundingStage?operation:null);
 }
 function invalidate(){revision++;review=null;summary.textContent='';approval.checked=false;clearTimeout(timer);render();}
 function errorMessage(error){
  const code=String(error?.code||error?.message||'bot-manual-unavailable');
  const text=code==='rpc-rate-limit'?t('El servicio de lectura de la red está saturado. Espera unos segundos y vuelve a consultar. No se reintentará ninguna orden automáticamente.','The network read service is rate limited. Wait a few seconds and check again. No order will be retried automatically.'):
   code==='perps-preswap-intent-mismatch-minimum-output'?t('La conversión propuesta no protege el mínimo exigido por tu límite del 0,5 %. Orden bloqueada: no se firmó ni se envió.','The proposed conversion does not protect the minimum required by your 0.5% limit. Order blocked: not signed or submitted.'):
   code==='bot-manual-pause-required'?t('Pausa el bot antes de revisar una orden manual.','Pause the bot before reviewing a manual order.'):
   code==='manual-perps-limits-required'?t('Configura y confirma los límites manuales de esta billetera en el panel inferior.','Configure and confirm manual limits for this wallet in the panel below.'):
   /pending|reconciliation/.test(code)?t('Hay una operación pendiente; consulta su estado antes de repetir.','An operation is pending; check its status before repeating.'):
   /ownership/.test(code)?t('El servidor no reconoce esta dirección como tu billetera exclusiva del bot. No se cambiará a otra cuenta.','The server does not recognize this address as your exclusive bot wallet. No other account will be substituted.'):
   /capital|loss|position|trade-limit|funds|usdc|sol/.test(code)?t('El saldo o los límites no permiten esta entrada. Revisa margen, comisión, SOL y límites manuales.','Funds or limits do not allow this entry. Check margin, fees, SOL and manual limits.'):
   t('No se pudo completar la revisión manual del servidor.','The manual server review could not be completed.');
  return text+' · '+code;
 }
 approval.onchange=render;
 confirm.onclick=async()=>{
  if(confirm.disabled)return;const r=review;busy=true;render();
  // Retain ID before the request. A lost response is NOT permission to retry.
  operation={id:r.entryReservationId??r.id,wallet:r.walletAddress,draft:r.draft};
  try{const value=await client.confirm(r,true,true);if(wallet()===r.walletAddress){operation={...operation,...value,wallet:r.walletAddress};status.textContent=t('Estado: ','State: ')+value.state+(value.requiresOpeningReview?t('. La conversión es un paso separado; consulta su estado y revisa la apertura.','. Conversion is a separate step; check its state and review the opening.'):t('. No repitas la orden.','. Do not repeat the order.'));}}
  catch(error){status.textContent=error.code==='entry-review-expired'||error.code==='entry-review-unverified'?t('La revisión perdió vigencia antes de completar la confirmación. Consulta esta operación antes de preparar otra; no se reintentará automáticamente.','The review became stale before confirmation completed. Check this operation before preparing another; no automatic retry will occur.')+' · '+error.code:t('Confirmación sin verificar. Consulta la operación antes de repetir.','Confirmation unverified. Check the operation before repeating.')+' · '+String(error.code||'bot-manual-unavailable');}
  finally{invalidate();busy=false;render();}
 };
 recover.onclick=async()=>{if(busy||!operation||wallet()!==operation.wallet)return;busy=true;render();try{const v=await client.recover(operation.wallet,operation.id);operation={...operation,...v};status.textContent=t('Estado: ','State: ')+v.state+(v.requiresNewReview?t('. No se registró un envío de esta apertura. Se requiere otra revisión y aprobación.','. No opening submission was recorded. A new review and approval are required.'): '')+(v.requiresOpeningReview?t('. Revisa el segundo paso; no repitas la conversión.','. Review the second step; do not repeat the conversion.'): '');}catch(error){status.textContent=errorMessage(error);}finally{busy=false;render();}};
 continueOpening.onclick=()=>{if(busy||!operation?.draft||!operation.requiresOpeningReview||wallet()!==operation.wallet)return;return api.prepare(operation.draft,{entryReservationId:operation.id});};
 const api={invalidate,dispose(){disposed=true;invalidate();positionsPanel.dispose();recoveryPanel.dispose();},async prepare(draft,{entryReservationId}={}){
  invalidate();if(disposed||busy)return;panel.hidden=false;busy=true;const ticket=revision,address=wallet();status.textContent=t('Verificando titularidad, límites y fondos en el servidor…','Checking ownership, limits and funds on the server…');render();
  try{const state=await client.status(address);if(disposed||ticket!==revision||wallet()!==address)return;
   if(entryReservationId===undefined&&state.operations?.length){operation={...state.operations[0],wallet:address,id:state.operations[0].id};status.textContent=t('Hay una orden manual pendiente. Consulta su estado; no repitas.','A manual order is pending. Check its state; do not repeat.');return;}
   if(entryReservationId===undefined&&state.available!==true)throw Object.assign(Error(state.reason||'bot-manual-unavailable'),{code:String(state.reason||'bot-manual-unavailable').toLowerCase().replaceAll('_','-')});
   const r=await client.prepare(address,draft,entryReservationId===undefined?{}:{entryReservationId});if(disposed||ticket!==revision||wallet()!==address)return;review=r;
   const conversion=r.stage==='BOT_MANUAL_ENTRY_CONVERSION_REVIEW';
   confirm.textContent=conversion?t('Confirmar conversión · no abre posición','Confirm conversion · does not open a position'):t('Confirmar apertura','Confirm opening');
   if(conversion)summary.append(node('p',t('Paso 1 de 2: convierte el margen a colateral con límite del 0,5 %. Después requiere otra revisión y confirmación para abrir. La comisión JamdDmaj corresponde a la apertura, no se cobra dos veces.','Step 1 of 2: converts margin to collateral with a 0.5% limit. Opening requires another review and confirmation. The JamdDmaj fee applies to opening, not twice.')),node('p',t('Colateral mínimo (unidades base): ','Minimum collateral (base units): ')+r.minimumCollateralUnits));
   summary.append(node('strong',r.draft.asset+' '+r.draft.side+' · '+r.draft.leverage+'×'));
   for(const [name,value]of [[t('Billetera','Wallet'),address],[t('Margen','Margin'),r.draft.margin+' USDC'],[t('Comisión JamdDmaj','JamdDmaj fee'),(Number(r.fee.feeUnits)/1e6)+' USDC (0.20%)'],[t('Margen + comisión','Margin + fee'),(Number(BigInt(r.marginUsdcUnits)+BigInt(r.fee.feeUnits))/1e6)+' USDC'],[t('Red + reserva de cuentas','Network + account rent'),(Number(BigInt(r.networkFeeLamports)+BigInt(r.rentLockedLamports))/1e9)+' SOL'],[t('Precio de referencia','Reference price'),r.draft.referencePrice+' USD'],['SL / TP',(r.draft.stopLoss||'—')+' / '+(r.draft.takeProfit||'—')]]){const row=node('p');row.append(node('span',name+': '),node('strong',value));summary.append(row);}
   const details=node('details');details.append(node('summary',t('Autorización y destinatario de comisión','Authorization and fee recipient')),node('p',r.fee.recipient),node('p',r.limits.mode==='perOrder'?t('Manual por orden: sin topes personales de capital, pérdida diaria, posiciones o trades. Puedes perder todo el margen.','Per-order manual mode: no personal capital, daily-loss, position or trade-count caps. You can lose the entire margin.'):t('Capital / pérdida diaria: ','Capital / daily loss: ')+r.limits.capitalUsd+' / '+r.limits.dailyLossUsd+' USDC · '+r.limits.positions+t(' posiciones · ',' positions · ')+r.limits.dailyTrades+t(' trades diarios',' daily trades')));summary.append(details);
   panel.scrollIntoView?.({behavior:'smooth',block:'center'});
   status.textContent=t('Revisa y confirma antes de que venza. No se ha enviado ninguna orden.','Review and confirm before expiry. No order has been submitted.');timer=setTimeout(()=>{invalidate();status.textContent=t('La revisión venció. Revisa otra vez.','Review expired. Review again.');},Math.max(0,r.expiresAt-Date.now()));
  }catch(error){if(ticket===revision)status.textContent=errorMessage(error);}finally{busy=false;render();}
 }};return api;
}
