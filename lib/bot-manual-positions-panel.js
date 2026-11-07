import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {readPerpsMarketReference} from './perps-market-reference.js';
export function setupBotManualPositionsPanel(parent,{doc,language,client}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('details');panel.className='card bot-manual-positions';panel.append(node('summary',t('Posiciones · billetera del bot','Positions · bot wallet')));
 panel.append(node('p',t('Aquí puedes revisar y confirmar un cierre completo (100%), que realiza la ganancia o pérdida. Los cierres parciales y la modificación de TP/SL de una posición abierta aún no están disponibles en JamdDmaj.','Review and confirm a full (100%) close here to realize the profit or loss. Partial closes and changes to TP/SL on an existing position are not yet available in JamdDmaj.')));
 const load=node('button',t('Consultar posiciones del bot','Read bot positions')),list=node('div'),pending=node('div'),select=node('select');
 const price=node('input');price.type='number';price.readOnly=true;price.step='0.000001';price.min='0.000001';price.placeholder=t('Referencia automática al revisar · USD','Automatic reference on review · USD');price.setAttribute('aria-label',price.placeholder);
 const selectLabel=node('label',t('Posición completa para cerrar','Full position to close'));selectLabel.append(select);
 const prepare=node('button',t('Revisar cierre completo','Review full close')),confirm=node('button',t('Confirmar cierre de la billetera del bot','Confirm bot wallet close'));
 for(const b of [load,prepare,confirm])b.type='button';
 const reviewText=node('p'),consent=node('input'),status=node('p');consent.type='checkbox';status.setAttribute('role','status');
 const consentLabel=node('label');consentLabel.append(consent,node('span',t('Autorizo este cierre completo con precio protegido y, si corresponde, la conversión posterior del importe confirmado a USDC con mínimo protegido (deslizamiento máximo 0,5 %) y limpieza de sus órdenes TP/SL. Los pasos pueden requerir espera y comisiones en SOL. No activa el bot.','I authorize this full price-protected close and, if needed, subsequent conversion of finalized proceeds to USDC with a protected minimum (maximum slippage 0.5%) and TP/SL cleanup. Steps may require time and SOL fees. This does not activate the bot.')));
 panel.append(load,list,pending,selectLabel,price,prepare,reviewText,consentLabel,confirm,status);parent.append(panel);
 let busy=false,disposed=false,revision=0,review=null,timer,loadedWallet=null;const assets=new Map();
 const wallet=()=>{const a=selectedWalletAccount(doc);return a?.source==='watch'?a.address:null;};
 function render(){panel.hidden=!wallet();load.disabled=busy||disposed;prepare.disabled=busy||disposed||loadedWallet!==wallet()||!select.value;confirm.disabled=busy||disposed||!review||!consent.checked||Date.now()>=review.expiresAt;consent.disabled=busy||!review;}
 function invalidate(){revision++;review=null;reviewText.textContent='';consent.checked=false;clearTimeout(timer);render();}
 function changed(){invalidate();loadedWallet=null;list.textContent='';pending.textContent='';select.textContent='';price.value='';status.textContent='';render();}
 const message=error=>t('No se pudo completar la consulta o revisión. No repitas un cierre pendiente. Código: ','The read or review could not be completed. Do not repeat a pending close. Code: ')+String(error.code||error.message||'bot-manual-close-unavailable');
 async function run(fn){if(busy||disposed)return;busy=true;render();try{await fn();}catch(error){status.textContent=message(error);}finally{busy=false;render();}}
 function showPending(item,address){
  const row=node('div'),text=node('p',item.positionAddress+' · '+item.state+' · '+item.phase),check=node('button',t('Consultar este cierre','Check this close'));check.type='button';
  check.onclick=()=>run(async()=>{const value=await client.recoverClose(address,item.id);if(wallet()===address)text.textContent=value.positionAddress+' · '+value.state+' · '+value.phase;});row.append(text,check);pending.append(row);
 }
 const loadPositions=(requested=null)=>run(async()=>{
  invalidate();const ticket=revision,address=wallet();if(!address)return;
  const data=await client.positions(address);if(disposed||ticket!==revision||wallet()!==address)return;
  loadedWallet=address;list.textContent='';select.textContent='';pending.textContent='';assets.clear();
  for(const p of data.positions||[]){
   list.append(node('p',p.asset+' '+p.side+' · '+t('Exposición: ','Exposure: ')+(Number(p.sizeUsdUnits)/1e6)+' USD · '+t('Colateral: ','Collateral: ')+(Number(p.collateralUsdUnits)/1e6)+' USD'));
   if(p.tracked){assets.set(p.address,p.asset);const option=node('option',p.asset+' '+p.side+' · '+p.address);option.value=p.address;select.append(option);}
  }
  // Fake DOMs do not auto-select; browsers normally select the first option.
  if(select.options?.length)select.value=select.options[0].value;
  if(requested&&requested.walletAddress===address){
   if((data.positions||[]).some(p=>p.tracked&&p.address===requested.positionAddress))select.value=requested.positionAddress;
   else select.value='';
   if(select.value&&typeof requested.referencePrice==='string'&&/^[0-9]+(\.[0-9]{1,6})?$/.test(requested.referencePrice)&&Number(requested.referencePrice)>0&&Number.isSafeInteger(requested.observedAt)&&Date.now()-requested.observedAt>=0&&Date.now()-requested.observedAt<=15000)price.value=requested.referencePrice;
  }
  for(const item of data.closes||[])showPending(item,address);
  status.textContent=(data.positions||[]).length?t('Posiciones consultadas. Para cerrar, revisa un precio de referencia y confirma por separado.','Positions read. To close, enter a reference price and confirm separately.'):t('No se observaron posiciones abiertas en esta consulta.','No open positions were observed in this read.');
 });
 load.onclick=()=>loadPositions();
 const manage=event=>{const detail=event.detail;if(!detail||detail.walletAddress!==wallet()||typeof detail.positionAddress!=='string')return;panel.open=true;panel.scrollIntoView?.({behavior:'smooth',block:'center'});void loadPositions(detail);};
 doc.addEventListener?.('jamd-manage-bot-position',manage);
 select.onchange=()=>{invalidate();price.value='';render();};price.oninput=()=>{invalidate();render();};consent.onchange=render;
 prepare.onclick=()=>run(async()=>{
  invalidate();const ticket=revision,address=wallet(),position=select.value;
  if(!address||!position||loadedWallet!==address)return;
  status.textContent=t('Consultando precio reciente para revisar el cierre…','Reading a fresh price for close review…');
  const reference=await readPerpsMarketReference(assets.get(position),{fetchImpl:doc.defaultView?.fetch?.bind(doc.defaultView)||globalThis.fetch});
  if(disposed||ticket!==revision||wallet()!==address||select.value!==position)return;
  price.value=reference;
  const r=await client.prepareClose(address,position,reference);if(disposed||ticket!==revision||wallet()!==address||select.value!==position||price.value.trim()!==reference)return;
  review=r;const p=r.protection;
  reviewText.textContent=address+' · '+r.asset+' '+r.side+' · '+t('Cierre completo. Límite de precio: ','Full close. Price limit: ')+(Number(p.priceLimitUsdUnits)/1e6)+' USD · '+t('Recibes inicialmente: ','Initial settlement: ')+p.receiveAsset+' · '+t('Importe estimado (no garantizado): ','Estimated amount (not guaranteed): ')+p.estimatedTokenUnits+' '+t('unidades mínimas del token. Máxima red del cierre: ','token base units. Maximum close network fee: ')+(Number(p.maximumNetworkFeeLamports)/1e9)+' SOL. '+t('No hay un mínimo absoluto garantizado para el primer paso. La conversión a USDC, cuando corresponda, se prepara tras confirmar el cierre y aplica su propio mínimo protegido.','The first step has no guaranteed absolute payout floor. Conversion to USDC, if needed, is prepared after finalized close and enforces its own protected minimum.');
  status.textContent=t('Revisa el cierre y sus dos etapas antes de confirmar.','Review the close and its two stages before confirming.');
  timer=setTimeout(()=>{invalidate();status.textContent=t('Revisión vencida. Revisa otra vez; no se envió este cierre.','Review expired. Review again; this close was not submitted.');},Math.max(0,r.expiresAt-Date.now()));
 });
 confirm.onclick=()=>run(async()=>{
  if(!review||!consent.checked)return;const r=review;invalidate();
  // Show recoverable identity before a response can be lost.
  showPending({id:r.id,positionAddress:r.positionAddress,state:'UNCONFIRMED',phase:'CHECK_REQUIRED'},r.walletAddress);
  try{const v=await client.confirmClose(r,true);if(wallet()===r.walletAddress)status.textContent=v.state+' · '+v.phase+t('. Consulta el resultado; no repitas el cierre.','. Check the result; do not repeat the close.');}
  catch(error){status.textContent=t('Cierre sin confirmar. Consulta este cierre antes de volver a intentarlo.','Close unconfirmed. Check this close before another attempt.')+' · '+String(error.code||error.message);}
 });
 doc.addEventListener?.('jamd-wallet-portfolio',changed);render();
 return {invalidate,dispose(){disposed=true;invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('jamd-manage-bot-position',manage);}};
}
