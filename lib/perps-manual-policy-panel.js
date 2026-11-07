import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {validateManualPerpsLimits,isPerOrderManualLimits} from './perps-manual-limits.js';
export {createManualPerpsPolicyClient} from './perps-manual-policy-client.js';
// Explicit controls only. Does not connect wallets, sign, send, activate bots,
// copy their limits or treat a policy capital cap as an observed wallet balance.
export function setupManualPerpsPolicyPanel(parent,{doc,client,language='es'}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const panel=node('details');panel.className='card manual-perps-policy';const heading=node('summary'),intro=node('p');panel.append(heading,intro);
 const perOrder=node('button',t('Usar modo manual por orden','Use per-order manual mode'));perOrder.type='button';
 const simple=node('section');simple.append(node('p',t('Sin topes personales de capital, pérdida diaria, posiciones o trades. Tú decides cada orden y puedes perder todo su margen. Siempre se verifican saldo, comisiones, permisos y operaciones pendientes. No activa ni cambia el bot automático.','No personal capital, daily-loss, position or trade-count caps. You decide each order and can lose its entire margin. Funds, fees, permissions and pending operations are always checked. Does not activate or change automation.')),perOrder);panel.append(simple);
 const advanced=node('details');advanced.append(node('summary',t('Límites opcionales · configuración avanzada','Optional limits · advanced settings')));panel.append(advanced);
 const fields={};for(const [key,label]of [['capitalUsd',t('Capital máximo · USDC','Maximum capital · USDC')],['dailyLossUsd',t('Pérdida diaria máxima · USDC','Maximum daily loss · USDC')],['positions',t('Posiciones simultáneas','Concurrent positions')],['dailyTrades',t('Trades diarios','Daily trades')]]){
  const input=node('input');input.type='number';input.value='';input.min=key==='capitalUsd'?'10':key==='dailyLossUsd'?'0.000001':'1';input.step=key.endsWith('Usd')?'0.000001':'1';if(key==='positions')input.max='10';if(key==='dailyTrades')input.max='100';
  const labelNode=node('label',label);labelNode.append(input);advanced.append(labelNode);fields[key]=input;
 }
 const read=node('button',t('Consultar límites manuales','Read manual limits')),save=node('button',t('Guardar límites manuales','Save manual limits'));
 read.type=save.type='button';const approval=node('input');approval.type='checkbox';approval.checked=false;const consent=node('label');consent.append(approval,node('span',t('Confirmo estos límites para la billetera seleccionada. Guardarlos no autoriza una orden.','I confirm these limits for the selected wallet. Saving does not authorize an order.')));
 approval.style&&(approval.style.width='auto');approval.style&&(approval.style.height='auto');
 const status=node('p');status.setAttribute('role','status');advanced.append(consent,save);panel.append(read,status);parent.append(panel);
 let current=null,loadedWallet=null,busy=false,revision=0,disposed=false,dirty=false;
 const selected=()=>{const v=selectedWalletAccount(doc);return ['external','watch'].includes(v?.source)?v.address:null;};
 const values=()=>({capitalUsd:fields.capitalUsd.value,dailyLossUsd:fields.dailyLossUsd.value,positions:Number(fields.positions.value),dailyTrades:Number(fields.dailyTrades.value)});
 function render(){const watch=selectedWalletAccount(doc)?.source==='watch';heading.textContent=watch?t('Modo de operación manual','Manual trading mode'):t('Protección de cuenta · límites manuales','Account protection · manual limits');intro.textContent=watch?t('Elige la autorización por orden. Los topes personales son opcionales y el bot automático conserva su configuración.','Choose per-order authorization. Personal caps are optional and automation keeps its own settings.'):t('Límites por billetera, independientes del bot. El capital máximo no es tu saldo ni mueve dinero.','Per-wallet limits, independent of the bot. Maximum capital is not your balance and does not move funds.');simple.hidden=!watch;advanced.hidden=false;perOrder.disabled=busy||disposed||!loadedWallet||loadedWallet!==selected()||isPerOrderManualLimits(current?.limits);read.disabled=busy||disposed;save.disabled=busy||disposed||loadedWallet!==selected()||!loadedWallet||!approval.checked;approval.disabled=busy||disposed||!loadedWallet;}
 let observedWallet=selected();
 const changed=()=>{const next=selected();if(next===observedWallet)return;observedWallet=next;revision++;current=null;loadedWallet=null;dirty=false;approval.checked=false;status.textContent='';for(const f of Object.values(fields))f.value='';render();};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);for(const input of Object.values(fields))input.addEventListener?.('input',()=>{dirty=true;approval.checked=false;status.textContent=t('Cambios sin guardar. Marca la confirmación después de terminar de editar. La pérdida diaria no puede superar el capital máximo.','Unsaved changes. Check approval after editing. Daily loss cannot exceed maximum capital.');render();});approval.onchange=render;
 async function run(action){
  if(busy||disposed)return false;const wallet=selected();if(!wallet){status.textContent=t('Selecciona una billetera en Activos.','Select a wallet in Assets.');return false;}
  if(action==='perOrder'&&(selectedWalletAccount(doc)?.source!=='watch'||!loadedWallet))return false;
  let requested;
  if(action!=='read'){try{requested=action==='perOrder'?{mode:'perOrder'}:validateManualPerpsLimits(values());}catch{status.textContent=t('No se guardó: capital mínimo 10 USDC; pérdida diaria mayor que cero y no superior al capital; posiciones 1–10 y trades 1–100. Corrige los campos y confirma.','Not saved: capital at least 10 USDC; positive daily loss no higher than capital; positions 1–10 and trades 1–100. Correct the fields and approve.');render();return false;}}
  const ticket=revision,before=JSON.stringify(values());busy=true;render();
  try{
   const result=action==='read'?await client.read(wallet):await client.save({walletAddress:wallet,expectedRevision:current?.revision??null,limits:requested,explicitApproval:action==='perOrder'||approval.checked===true});
   if(disposed||ticket!==revision||selected()!==wallet)return false;
   current=result.policy;loadedWallet=wallet;approval.checked=false;
   if(action!=='read')dirty=false;
   if(current&&!isPerOrderManualLimits(current.limits)&&!dirty&&before===JSON.stringify(values()))for(const key of Object.keys(fields))fields[key].value=String(current.limits[key]);
   if(isPerOrderManualLimits(current?.limits)){status.textContent=t('Modo manual por orden verificado. Sin topes personales obligatorios; cada operación requiere su revisión y confirmación. El bot automático no cambió.','Per-order manual mode verified. No mandatory personal caps; each operation requires its own review and confirmation. Automation was not changed.');return true;}
   status.textContent=(current?t('Límites del servidor verificados.','Server limits verified.'):t('Esta billetera aún no tiene límites manuales. Completa y confirma los campos.','This wallet has no manual limits yet. Complete and confirm the fields.'))+' '+
    (selectedWalletAccount(doc)?.source==='watch'?t('Para la billetera del bot, cada orden requiere revisión del servidor y confirmación independiente en Futuros. El bot debe permanecer pausado.','For the bot wallet, each order requires server review and separate confirmation in Futures. Automation must remain paused.'):
     result.executionAvailable?t('Cada orden requiere una revisión y aprobación independiente en Phantom.','Every order needs a separate review and approval in Phantom.'):t('La ejecución web todavía está deshabilitada.','Web execution is still disabled.'));
   return !!current;
  }catch(error){if(disposed||ticket!==revision)return false;current=null;loadedWallet=null;approval.checked=false;
   status.textContent=error?.message==='INVALID_MANUAL_PERPS_LIMITS'?t('Revisa capital mínimo 10 USDC, pérdida mayor que cero y no superior al capital, posiciones 1–10 y trades 1–100. No se guardó nada.','Check capital at least 10 USDC, positive loss no higher than capital, positions 1–10 and trades 1–100. Nothing was saved.'):
    action==='save'?t('Guardado sin confirmar. Consulta el servidor antes de repetir; no se repetirá automáticamente.','Save unconfirmed. Read the server before retrying; no automatic retry.'):
    t('No se pudieron consultar los límites. Comprueba tu sesión de Google. No se modificó tu billetera.','Limits could not be read. Check your Google session. Your wallet was not changed.');return false;
  }finally{busy=false;render();}
 }
 read.onclick=()=>{dirty=false;return run('read');};save.onclick=()=>run('save');perOrder.onclick=()=>run('perOrder');render();
 return Object.freeze({panel,fields,read,save,perOrder,approval,status,async ensureForReview(){
  if(dirty){panel.open=true;advanced.open=true;status.textContent=t('Hay cambios sin guardar. Guárdalos y confirma, o consulta después de descartarlos.','There are unsaved changes. Save and approve them, or read again after discarding them.');return false;}
  const ready=await run('read');
  if(!ready&&!disposed){panel.open=true;panel.scrollIntoView?.({behavior:'smooth',block:'center'});fields.capitalUsd.focus?.();}
  return ready;
 },dispose(){disposed=true;revision++;doc.removeEventListener?.('jamd-wallet-portfolio',changed);render();}});
}
