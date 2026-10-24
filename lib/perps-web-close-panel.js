import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {currentWalletTradingState} from './wallet-trading-state.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {createWebCloseClient,authorizeWebCloseSignature,submitSignedWebClose,openWebCloseJournal,openWebPerpsSigningJournal,signReviewedWebClose} from './perps-web-wallet-session.js';
const decimal=(units,places=6)=>{const value=String(units),s=value.padStart(places+1,'0');return (s.slice(0,-places)+'.'+s.slice(-places)).replace(/\.?0+$/,'');};
function minimum(value){if(!value.trim())return null;if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value))throw Error();const [whole,fraction='']=value.split('.'),units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));if(units<1n||units>18446744073709551615n)throw Error();return units.toString();}
export function setupWebClosePanel(parent,{doc,language='es'}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('details');panel.className='web-close-panel';panel.append(node('summary',t('Cerrar posiciones · Phantom','Close positions · Phantom')),
  node('p',t('Cierre completo con precio protegido. Si recibes otro token, convertirlo a USDC requiere otra revisión y firma. SL/TP pendientes se cancelan por separado.','Full close with a protected price. If you receive another token, conversion to USDC requires another review and signature. Pending TP/SL orders are cancelled separately.')));
 const position=node('select');position.setAttribute('aria-label',t('Posición para cerrar','Position to close'));
 const reference=node('input');reference.type='number';reference.min='0.000001';reference.step='0.000001';reference.setAttribute('aria-label',t('Precio de referencia USD para el cierre','Reference USD price for the close'));
 const slippage=node('input');slippage.type='number';slippage.min='1';slippage.max='100';slippage.step='1';slippage.value='50';
 const absolute=node('input');absolute.type='number';absolute.min='0.000001';absolute.step='0.000001';
 for(const [label,input] of [[t('Posición','Position'),position],[t('Precio de referencia · USD','Reference price · USD'),reference],[t('Tolerancia · puntos básicos (50 = 0,5%; máximo 1%)','Tolerance · basis points (50 = 0.5%; maximum 1%)'),slippage],[t('Mínimo de USDC al convertir · opcional','Minimum USDC on conversion · optional'),absolute]]){const l=node('label',label);l.append(input);panel.append(l);}
 const refresh=node('button',t('Consultar cierres y pendientes','Check closes and pending operations')),prepare=node('button',t('Revisar cierre completo','Review full close')),next=node('button',t('Revisar siguiente paso','Review next step')),
  confirm=node('button',t('Confirmar, firmar y enviar','Confirm, sign and submit')),summary=node('p'),status=node('p'),approval=node('input');approval.type='checkbox';approval.checked=false;
 const consent=node('label');consent.append(approval,node('span',t('Revisé este paso y autorizo firmarlo en Phantom y enviarlo una sola vez.','I reviewed this step and authorize signing it in Phantom and submitting it once.')));
 for(const button of [refresh,prepare,next,confirm])button.type='button';status.setAttribute('role','status');panel.append(refresh,prepare,next,summary,consent,confirm,status);parent.append(panel);
 const client=createWebCloseClient({doc,fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch,readSessionToken:()=>readExistingPerpsControlSession(doc.defaultView||globalThis)});
 let disposed=false,busy=false,review=null,remote=null,revision=0,expiry,journal,entryJournal,fingerprint='';
 const wallet=()=>selectedWalletAccount(doc)?.source==='external'?selectedWalletAccount(doc).address:null;
 const rows=()=>{const state=currentWalletTradingState(doc);return state?.account?.source==='external'&&state.account.address===wallet()?state.snapshot?.positions||[]:[];};
 const journals=async()=>{journal??=await openWebCloseJournal({indexedDB:doc.defaultView?.indexedDB});entryJournal??=await openWebPerpsSigningJournal({indexedDB:doc.defaultView?.indexedDB});};
 function render(){refresh.disabled=busy||disposed||!wallet();prepare.disabled=busy||disposed||!wallet()||!position.value;next.disabled=busy||disposed||!remote||!['READY_FOR_NEXT_REVIEW','ACCOUNTING_REQUIRED'].includes(remote.phase);confirm.disabled=busy||disposed||!review||!approval.checked;approval.disabled=busy||disposed||!review;}
 function invalidate(){revision++;review=null;approval.checked=false;clearTimeout(expiry);summary.textContent='';render();}
 function changed(){const values=rows(),key=JSON.stringify([wallet(),values.map(p=>[p.address,p.sizeUsdUnits,p.collateralUsdUnits])]);if(key===fingerprint)return;fingerprint=key;invalidate();remote=null;
  const previous=position.value;position.replaceChildren();for(const p of values){const option=node('option',p.asset+' '+p.side+' · '+decimal(p.sizeUsdUnits)+' USD');option.value=p.address;position.append(option);}if(values.some(p=>p.address===previous))position.value=previous;render();}
 function report(error){status.textContent=error?.message==='WEB_CLOSE_EXECUTION_DISABLED'?t('El servidor mantiene la ejecución deshabilitada. No se pidió firma.','The server keeps execution disabled. No signature was requested.'):
  error?.message==='MANUAL_PERPS_LIMITS_REQUIRED'?t('Consulta y configura primero los límites manuales de esta billetera.','Read and configure this wallet’s manual limits first.'):
  error?.message==='WEB_CLOSE_UNTRACKED_POSITION'?t('No se encontró un registro manual verificable de esta posición en JamdDmaj. No se pidió firma.','No verifiable JamdDmaj manual record was found for this position. No signature was requested.'):
  t('No se pudo verificar este paso. Conserva cualquier operación pendiente y no repitas el envío.','This step could not be verified. Retain any pending operation and do not repeat submission.');}
 async function run(fn){if(disposed||busy)return;busy=true;render();try{await fn();}catch(error){if(!disposed)report(error);}finally{busy=false;render();if(disposed){journal?.close();entryJournal?.close();}}}
 function display(packet){review=packet;approval.checked=false;summary.textContent=packet.operation==='CLOSE'?t('Cerrar toda la posición: ','Close the entire position: ')+packet.details.asset+' '+packet.details.side+' · '+decimal(packet.details.sizeUsdUnits)+' USD · '+t('Límite de precio: ','Price limit: ')+decimal(packet.details.priceLimitUsdUnits)+' USD · '+t('Recibes: ','Receive: ')+packet.details.receiveAsset:
  packet.operation==='CONVERT'?t('Convertir los tokens recibidos. Mínimo protegido: ','Convert received tokens. Protected minimum: ')+decimal(packet.details.minimumUsdcUnits)+' USDC':
  t('Cancelar una orden SL/TP pendiente: ','Cancel one pending TP/SL order: ')+packet.details.exitAddress.slice(0,8)+'…';
  summary.textContent+=' · '+t('Comisión de red: ','Network fee: ')+decimal(packet.details.networkFeeLamports,9)+' SOL';
  expiry=setTimeout(()=>{if(!busy){invalidate();status.textContent=t('Revisión vencida. Consulta otra vez antes de firmar.','Review expired. Review again before signing.');}},Math.max(1,packet.expiresAt-Date.now()));expiry?.unref?.();render();}
 prepare.onclick=()=>run(async()=>{invalidate();const ticket=revision,address=wallet(),selected=position.value;
  const packet=await client.prepare({action:'prepare',walletAddress:address,positionAddress:selected,referencePrice:reference.value.trim(),maxSlippageBps:Number(slippage.value)});
  if(!disposed&&ticket===revision&&address===wallet()&&selected===position.value)display(packet);
 });
 refresh.onclick=()=>run(async()=>{invalidate();const address=wallet(),ticket=revision;await journals();const pending=await journal.pending(address);
  if(pending.some(row=>row.state==='SIGNING')){status.textContent=t('La firma anterior no quedó confirmada. El registro permanece retenido; no repitas la operación.','The previous signature was not confirmed. Its record stays held; do not repeat the operation.');return;}
  let observed;for(const row of pending)observed=await client.recover(address,row.packet.closeId,{journal,reviewId:row.id});
  const values=await client.list(address);if(disposed||ticket!==revision||wallet()!==address)return;remote=values[0]||observed||null;
  status.textContent=remote?(remote.phase==='COMPLETED'?t('Cierre y liquidación verificados.','Close and settlement verified.'):t('Cierre registrado: ','Recorded close: ')+remote.phase):t('Sin cierres pendientes en este registro. Esto no confirma que no tengas posiciones abiertas.','No pending closes in this record. This does not confirm that you have no open positions.');render();
 });
 next.onclick=()=>run(async()=>{invalidate();const value=remote,ticket=revision,address=wallet();if(!value)return;
  const packet=await client.prepare({action:'next',walletAddress:address,closeId:value.closeId,maxSlippageBps:Number(slippage.value),minimumUsdcUnits:minimum(absolute.value.trim())},{positionAddress:value.positionAddress});
  if(!disposed&&ticket===revision&&address===wallet())display(packet);
 });
 confirm.onclick=()=>run(async()=>{if(!review||approval.checked!==true)return;const original=review,address=wallet();await journals();
  const grant=await authorizeWebCloseSignature(original,{doc,journal,entryJournal,explicitApproval:true}),signed=await signReviewedWebClose(doc,grant),result=await submitSignedWebClose(signed,{doc,journal});
  review=null;approval.checked=false;if(!disposed&&wallet()===address)status.textContent=result.acknowledged?t('Envío recibido; aún requiere confirmación en la red. Consulta su estado y no repitas la orden.','Submission acknowledged; network confirmation is still required. Check its status and do not repeat the order.'):
   t('Resultado del envío sin confirmar. El registro queda retenido; consulta su estado sin reenviar.','Submission outcome unconfirmed. Its record stays held; check status without resubmitting.');
 });
 approval.onchange=render;for(const input of [position,reference,slippage,absolute])input.addEventListener?.('input',invalidate);
 doc.addEventListener?.('jamd-trading-state',changed);doc.addEventListener?.('jamd-wallet-portfolio',changed);changed();
 return {dispose(){disposed=true;invalidate();doc.removeEventListener?.('jamd-trading-state',changed);doc.removeEventListener?.('jamd-wallet-portfolio',changed);if(!busy){journal?.close();entryJournal?.close();}}};
}
