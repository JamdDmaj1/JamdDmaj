import {selectedWalletAccount} from './wallet-portfolio-store.js';
export function setupBotManualRecoveryPanel(parent,{doc,language='es',client}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const root=node('section'),summary=node('div'),status=node('p'),approve=node('input'),label=node('label');approve.type='checkbox';
 label.setAttribute('style','display:flex;align-items:flex-start;gap:10px');approve.setAttribute('style','width:20px;height:20px;flex:0 0 20px;margin:3px 0');
 const prepare=node('button',t('Revisar devolución a USDC','Review return to USDC')),confirm=node('button',t('Confirmar devolución','Confirm return')),
  recover=node('button',t('Consultar devolución','Check return'));for(const b of [prepare,confirm,recover])b.type='button';
 label.append(approve,node('span',t('Autorizo solo esta devolución de colateral a USDC y sus costes. No abre operaciones ni activa el bot.','I approve only this collateral return to USDC and its costs. It does not open trades or activate the bot.')));
 status.setAttribute('role','status');root.append(node('h3',t('Recuperación de colateral','Collateral recovery')),prepare,summary,label,confirm,recover,status);parent.append(root);
 let operation=null,review=null,pending=false,busy=false,disposed=false,revision=0,timer;
 const wallet=()=>selectedWalletAccount(doc)?.address;
 const supported=['prepareRecovery','confirmRecovery','recoverRecovery'].every(k=>typeof client?.[k]==='function');
 const units=(s,decimals)=>{const padded=String(s).padStart(decimals+1,'0');return padded.slice(0,-decimals)+'.'+padded.slice(-decimals);};
 function render(){
  root.hidden=!supported||!operation||wallet()!==operation.wallet||!['RESERVED','UNCERTAIN'].includes(operation.state)&&!operation.recoveryState;
  prepare.disabled=busy||disposed||!operation||pending;prepare.hidden=!!review||pending;
  label.hidden=confirm.hidden=summary.hidden=!review;confirm.disabled=busy||disposed||!review||!approve.checked||Date.now()>=review.expiresAt;
  recover.hidden=!pending;recover.disabled=busy||disposed;
 }
 function invalidate(){revision++;review=null;approve.checked=false;summary.textContent='';clearTimeout(timer);render();}
 approve.onchange=render;
 const message=error=>t('No se completó la recuperación. Consulta el estado antes de repetir. Código: ','Recovery not completed. Check its state before repeating. Code: ')+String(error?.code||'bot-manual-recovery-unavailable');
 prepare.onclick=async()=>{
  if(prepare.disabled||root.hidden)return;invalidate();const ticket=revision,op=operation;busy=true;render();
  try{const r=await client.prepareRecovery(op.wallet,op.id);if(disposed||ticket!==revision||wallet()!==op.wallet)return;
   review=r;summary.append(node('p',r.asset+t(' · cantidad en unidades base: ',' · amount in base units: ')+r.amountUnits),
    node('p',t('Mínimo recibido: ','Minimum received: ')+units(r.minimumUsdcUnits,6)+' USDC'),
    node('p',t('Límite: 0,5 % · Comisión JamdDmaj: 0 USDC','Limit: 0.5% · JamdDmaj fee: 0 USDC')),
    node('p',t('Red + reserva de cuentas: ','Network + account rent: ')+units(String(BigInt(r.networkFeeLamports)+BigInt(r.rentLockedLamports)),9)+' SOL'),node('p',r.walletAddress));
   status.textContent=t('Solo revisión; no se ha enviado la devolución.','Review only; return not submitted.');
   timer=setTimeout(()=>{invalidate();status.textContent=t('La revisión venció. Revisa otra vez.','Review expired. Review again.');},Math.max(0,r.expiresAt-Date.now()));
  }catch(error){if(ticket===revision)status.textContent=message(error);}finally{busy=false;render();}
 };
 confirm.onclick=async()=>{
  if(confirm.disabled||root.hidden)return;const r=review,op=operation;pending=true;busy=true;invalidate();render();
  try{const result=await client.confirmRecovery(r,true);if(wallet()===op.wallet)status.textContent=t('Estado: ','State: ')+result.state+t('. Consulta la devolución; no la repitas.','. Check the return; do not repeat it.');}
  catch(error){if(wallet()===op.wallet)status.textContent=message(error);}finally{busy=false;render();}
 };
 recover.onclick=async()=>{
  if(recover.disabled||root.hidden)return;const op=operation;busy=true;render();
  try{const result=await client.recoverRecovery(op.wallet,op.id);if(wallet()===op.wallet){
   if(result.state==='ABORTED'&&result.requiresNewReview===true){pending=false;operation={...operation,recoveryState:'ABORTED'};invalidate();}
   status.textContent=t('Estado: ','State: ')+result.state+(result.originalRiskReleased?t(' · Reserva liberada tras verificación completa.',' · Reserve released after complete verification.'):result.state==='FAILED'?t(' · La red rechazó esta devolución; no convirtió tokens. La reserva sigue retenida y no se reintentará automáticamente.',' · The network rejected this return; it converted no tokens. Reserve remains held and no automatic retry will occur.'):result.state==='ABORTED'&&result.requiresNewReview===true?t(' · Este intento no se envió. Puedes solicitar una revisión nueva; la reserva sigue retenida.',' · This attempt was not submitted. You can request a fresh review; reserve remains held.'):t(' · La reserva sigue retenida.',' · Reserve remains held.'));
  }}
  catch(error){if(wallet()===op.wallet)status.textContent=message(error);}finally{busy=false;render();}
 };
 const changed=()=>{invalidate();};doc.addEventListener?.('jamd-wallet-portfolio',changed);render();
 return {setOperation(value){if(operation?.id!==value?.id||operation?.wallet!==value?.wallet){operation=value;pending=!!value?.recoveryState&&value.recoveryState!=='ABORTED';invalidate();}else {operation=value;if(value?.recoveryState)pending=value.recoveryState!=='ABORTED';}render();},
  dispose(){disposed=true;invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',changed);}};
}
