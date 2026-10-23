import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {validateManualPerpsLimits} from './perps-manual-limits.js';
export {createManualPerpsPolicyClient} from './perps-manual-policy-client.js';
// Explicit controls only. Does not connect wallets, sign, send, activate bots,
// copy their limits or treat a policy capital cap as an observed wallet balance.
export function setupManualPerpsPolicyPanel(parent,{doc,client,language='es'}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const panel=node('details');panel.className='card manual-perps-policy';panel.append(node('summary',t('Límites manuales · Phantom','Manual limits · Phantom')),
  node('p',t('Límites por billetera, independientes del bot. El capital máximo no es tu saldo ni mueve dinero.','Per-wallet limits, independent of the bot. Maximum capital is not your balance and does not move funds.')));
 const fields={};for(const [key,label]of [['capitalUsd',t('Capital máximo · USDC','Maximum capital · USDC')],['dailyLossUsd',t('Pérdida diaria máxima · USDC','Maximum daily loss · USDC')],['positions',t('Posiciones simultáneas','Concurrent positions')],['dailyTrades',t('Trades diarios','Daily trades')]]){
  const input=node('input');input.type='number';input.value='';input.min=key==='capitalUsd'?'10':key==='dailyLossUsd'?'0.000001':'1';input.step=key.endsWith('Usd')?'0.000001':'1';if(key==='positions')input.max='10';if(key==='dailyTrades')input.max='100';
  const labelNode=node('label',label);labelNode.append(input);panel.append(labelNode);fields[key]=input;
 }
 const read=node('button',t('Consultar límites manuales','Read manual limits')),save=node('button',t('Guardar límites manuales','Save manual limits'));
 read.type=save.type='button';const approval=node('input');approval.type='checkbox';approval.checked=false;const consent=node('label');consent.append(approval,node('span',t('Confirmo estos límites para la billetera seleccionada. Guardarlos no autoriza una orden.','I confirm these limits for the selected wallet. Saving does not authorize an order.')));
 const status=node('p');status.setAttribute('role','status');panel.append(read,consent,save,status);parent.append(panel);
 let current=null,loadedWallet=null,busy=false,revision=0,disposed=false;
 const selected=()=>{const v=selectedWalletAccount(doc);return v?.source==='external'?v.address:null;};
 const values=()=>({capitalUsd:fields.capitalUsd.value,dailyLossUsd:fields.dailyLossUsd.value,positions:Number(fields.positions.value),dailyTrades:Number(fields.dailyTrades.value)});
 function render(){read.disabled=busy||disposed;save.disabled=busy||disposed||loadedWallet!==selected()||!loadedWallet||!approval.checked;approval.disabled=busy||disposed||!loadedWallet;}
 let observedWallet=selected();
 const changed=()=>{const next=selected();if(next===observedWallet)return;observedWallet=next;revision++;current=null;loadedWallet=null;approval.checked=false;status.textContent='';for(const f of Object.values(fields))f.value='';render();};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);for(const input of Object.values(fields))input.addEventListener?.('input',()=>{approval.checked=false;render();});approval.onchange=render;
 async function run(action){
  if(busy||disposed)return;const wallet=selected();if(!wallet){status.textContent=t('Selecciona una billetera Phantom en Activos.','Select a Phantom wallet in Assets.');return;}
  const ticket=revision,before=JSON.stringify(values());busy=true;render();
  try{
   const result=action==='read'?await client.read(wallet):await client.save({walletAddress:wallet,expectedRevision:current?.revision??null,limits:validateManualPerpsLimits(values()),explicitApproval:approval.checked===true});
   if(disposed||ticket!==revision||selected()!==wallet)return;
   current=result.policy;loadedWallet=wallet;approval.checked=false;
   if(current&&before===JSON.stringify(values()))for(const key of Object.keys(fields))fields[key].value=String(current.limits[key]);
   status.textContent=(current?t('Límites del servidor verificados.','Server limits verified.'):t('Esta billetera aún no tiene límites manuales. Completa y confirma los campos.','This wallet has no manual limits yet. Complete and confirm the fields.'))+' '+
    (result.executionAvailable?t('Cada orden requiere una revisión y aprobación independiente en Phantom.','Every order needs a separate review and approval in Phantom.'):t('La ejecución web todavía está deshabilitada.','Web execution is still disabled.'));
  }catch(error){if(disposed||ticket!==revision)return;current=null;loadedWallet=null;approval.checked=false;
   status.textContent=error?.message==='INVALID_MANUAL_PERPS_LIMITS'?t('Revisa capital mínimo 10 USDC, pérdida mayor que cero y no superior al capital, posiciones 1–10 y trades 1–100. No se guardó nada.','Check capital at least 10 USDC, positive loss no higher than capital, positions 1–10 and trades 1–100. Nothing was saved.'):
    action==='save'?t('Guardado sin confirmar. Consulta el servidor antes de repetir; no se repetirá automáticamente.','Save unconfirmed. Read the server before retrying; no automatic retry.'):
    t('No se pudieron consultar los límites. Comprueba tu sesión de Google. No se modificó tu billetera.','Limits could not be read. Check your Google session. Your wallet was not changed.');
  }finally{busy=false;render();}
 }
 read.onclick=()=>run('read');save.onclick=()=>run('save');render();
 return Object.freeze({panel,fields,read,save,approval,status,dispose(){disposed=true;revision++;doc.removeEventListener?.('jamd-wallet-portfolio',changed);render();}});
}
