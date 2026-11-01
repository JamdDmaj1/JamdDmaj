import {createBotManualPerpsClient} from './bot-manual-perps-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {setupBotManualPositionsPanel} from './bot-manual-positions-panel.js';
export function setupBotManualPerpsPanel(parent,{doc,language='es'}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='trade-order-summary';panel.hidden=true;
 const summary=node('p'),status=node('p'),approval=node('input'),fees=node('input');approval.type=fees.type='checkbox';
 const label=node('label');label.append(approval,node('span',t('Autorizo solo esta orden manual desde la billetera del bot. No activa la automatización.','I authorize only this manual bot-wallet order. This does not activate automation.')));
 const feeLabel=node('label');feeLabel.append(fees,node('span',t('Acepto la comisión del 0,20 % del margen en USDC y los costes de red en SOL.','I accept the 0.20% of margin fee in USDC and network costs in SOL.')));
 const confirm=node('button',t('Confirmar orden manual del bot','Confirm manual bot order')),recover=node('button',t('Consultar orden manual del bot','Check manual bot order'));
 confirm.type=recover.type='button';status.setAttribute('role','status');panel.append(summary,label,feeLabel,confirm,recover,status);parent.append(panel);
 const win=doc.defaultView||globalThis,client=createBotManualPerpsClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
 const positionsPanel=setupBotManualPositionsPanel(parent,{doc,language,client});
 let review=null,busy=false,revision=0,disposed=false,timer,operation=null;
 const wallet=()=>selectedWalletAccount(doc)?.address;
 function render(){confirm.disabled=busy||disposed||!review||!approval.checked||!fees.checked||Date.now()>=review.expiresAt;recover.disabled=busy||!operation;}
 function invalidate(){revision++;review=null;summary.textContent='';approval.checked=fees.checked=false;clearTimeout(timer);render();}
 function errorMessage(error){
  const code=String(error?.code||error?.message||'bot-manual-unavailable');
  const text=code==='bot-manual-pause-required'?t('Pausa el bot antes de revisar una orden manual.','Pause the bot before reviewing a manual order.'):
   code==='manual-perps-limits-required'?t('Configura y confirma los límites manuales de esta billetera en el panel inferior.','Configure and confirm manual limits for this wallet in the panel below.'):
   /pending|reconciliation/.test(code)?t('Hay una operación pendiente; consulta su estado antes de repetir.','An operation is pending; check its status before repeating.'):
   /ownership/.test(code)?t('El servidor no reconoce esta dirección como tu billetera exclusiva del bot. No se cambiará a otra cuenta.','The server does not recognize this address as your exclusive bot wallet. No other account will be substituted.'):
   /capital|loss|position|trade-limit|funds|usdc|sol/.test(code)?t('El saldo o los límites no permiten esta entrada. Revisa margen, comisión, SOL y límites manuales.','Funds or limits do not allow this entry. Check margin, fees, SOL and manual limits.'):
   t('No se pudo completar la revisión manual del servidor.','The manual server review could not be completed.');
  return text+' · '+code;
 }
 approval.onchange=fees.onchange=render;
 confirm.onclick=async()=>{
  if(confirm.disabled)return;const r=review;busy=true;render();
  // Retain ID before the request. A lost response is NOT permission to retry.
  operation={id:r.id,wallet:r.walletAddress};
  try{const value=await client.confirm(r,true,true);if(wallet()===r.walletAddress)status.textContent=t('Estado: ','State: ')+value.state+t('. No repitas la orden.','. Do not repeat the order.');}
  catch(error){status.textContent=t('Confirmación sin verificar. Consulta la operación antes de repetir.','Confirmation unverified. Check the operation before repeating.')+' · '+String(error.code||'bot-manual-unavailable');}
  finally{invalidate();busy=false;render();}
 };
 recover.onclick=async()=>{if(busy||!operation||wallet()!==operation.wallet)return;busy=true;render();try{const v=await client.recover(operation.wallet,operation.id);status.textContent=t('Estado: ','State: ')+v.state;}catch(error){status.textContent=errorMessage(error);}finally{busy=false;render();}};
 return {invalidate,dispose(){disposed=true;invalidate();positionsPanel.dispose();},async prepare(draft){
  invalidate();if(disposed||busy)return;panel.hidden=false;busy=true;const ticket=revision,address=wallet();status.textContent=t('Verificando titularidad, límites y fondos en el servidor…','Checking ownership, limits and funds on the server…');render();
  try{const state=await client.status(address);if(disposed||ticket!==revision||wallet()!==address)return;
   if(state.operations?.length){operation={wallet:address,id:state.operations[0].id};status.textContent=t('Hay una orden manual pendiente. Consulta su estado; no repitas.','A manual order is pending. Check its state; do not repeat.');return;}
   if(state.available!==true)throw Object.assign(Error(state.reason||'bot-manual-unavailable'),{code:String(state.reason||'bot-manual-unavailable').toLowerCase().replaceAll('_','-')});
   const r=await client.prepare(address,draft);if(disposed||ticket!==revision||wallet()!==address)return;review=r;
   summary.textContent=address+' · '+r.draft.asset+' '+r.draft.side+' · '+r.draft.margin+' USDC · '+r.draft.leverage+'× · '+t('Referencia: ','Reference: ')+r.draft.referencePrice+' USD · SL: '+(r.draft.stopLoss||'—')+' · TP: '+(r.draft.takeProfit||'—')+' · '+t('Comisión: ','Fee: ')+(Number(r.fee.feeUnits)/1e6)+' USDC → '+r.fee.recipient+' · '+t('Red: ','Network: ')+(Number(r.networkFeeLamports)/1e9)+' SOL · '+t('Reserva de cuentas: ','Account rent: ')+(Number(r.rentLockedLamports)/1e9)+' SOL · '+t('Límites manuales: capital ','Manual limits: capital ')+r.limits.capitalUsd+' / '+t('pérdida diaria ','daily loss ')+r.limits.dailyLossUsd+' USDC / '+r.limits.positions+t(' posiciones / ',' positions / ')+r.limits.dailyTrades+t(' trades diarios.',' daily trades.');
   status.textContent=t('Revisa y confirma antes de que venza. No se ha enviado ninguna orden.','Review and confirm before expiry. No order has been submitted.');timer=setTimeout(()=>{invalidate();status.textContent=t('La revisión venció. Revisa otra vez.','Review expired. Review again.');},Math.max(0,r.expiresAt-Date.now()));
  }catch(error){if(ticket===revision)status.textContent=errorMessage(error);}finally{busy=false;render();}
 }};
}
