// Assets-local swap. Public balance metadata never supplies signing authority.
import {selectedWalletAccount,currentWalletPortfolio} from './wallet-portfolio-store.js';
import {createWebSwapEngine,createWebSwapRpc,openWebSwapJournal,readWebPerpsWalletSession,
 signReviewedWalletSwap,withWalletOperationLock,openWebCloseJournal,openWebPerpsSigningJournal} from './perps-web-wallet-session.js';
const SOL='So11111111111111111111111111111111111111112',USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function swapInputUnits(text,decimals){
 if(!/^(0|[1-9][0-9]{0,10})(\.[0-9]+)?$/.test(text))throw Error('INVALID_SWAP_AMOUNT');
 const [whole,fraction='']=text.split('.');if(fraction.length>decimals)throw Error('INVALID_SWAP_AMOUNT');
 const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
 if(units<=0n||units>18446744073709551615n)throw Error('INVALID_SWAP_AMOUNT');return String(units);
}
const format=(units,decimals)=>{const n=BigInt(units),scale=10n**BigInt(decimals);return String(n/scale)+'.'+String(n%scale).padStart(decimals,'0');};
export function createWalletInlineSwap(language,doc,win){
 const t=(es,en)=>language==='es'?es:en;
 const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='wallet-inline-swap';panel.hidden=true;
 const heading=node('h3',t('Intercambiar en esta billetera','Swap in this wallet')),accountLabel=node('p'),balance=node('p');
 const direction=node('select');direction.setAttribute('aria-label',t('Entregas y recibes','Pay and receive'));
 for(const value of ['SOL','USDC']){const option=node('option',value+' → '+(value==='SOL'?'USDC':'SOL'));option.value=value;direction.append(option);}direction.value='SOL';
 const amount=node('input');amount.type='text';amount.inputMode='decimal';amount.autocomplete='off';amount.setAttribute('aria-label',t('Cantidad del token que entregas','Amount of the token you pay'));
 amount.placeholder=t('Cantidad en SOL','Amount in SOL');
 const reviewButton=node('button',t('Revisar intercambio','Review swap')),confirm=node('button',t('Aprobar en la billetera y enviar','Approve in wallet and submit')),
  check=node('button',t('Consultar operación pendiente','Check pending operation')),close=node('button',t('Cerrar','Close'));
 for(const button of [reviewButton,confirm,check,close])button.type='button';
 const summary=node('p'),status=node('p'),consent=node('input'),label=node('label');consent.type='checkbox';
 label.append(consent,node('span',t('Revisé el mínimo recibido y los costes. Autorizo este intercambio real.','I reviewed the minimum received and costs. I authorize this real swap.')));
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(heading,accountLabel,balance,direction,amount,node('p',t('Cantidad del token, no dólares. Deslizamiento máximo: 0,5 %. Conserva SOL para la red.','Token amount, not dollars. Maximum slippage: 0.5%. Keep SOL for network fees.')),reviewButton,summary,label,confirm,check,status,close);
 let engine,journal,services,review=null,busy=false,revision=0,disposed=false;
 const fetchImpl=(...args)=>win.fetch(...args);
 const session=()=>{const selected=selectedWalletAccount(doc),connected=readWebPerpsWalletSession(doc);if(selected?.source!=='external'||!connected||selected.address!==connected.address)throw Error('WALLET_CONNECTION_REQUIRED');return selected;};
 const ready=async()=>{
  if(!services)services=openWebSwapJournal(win.indexedDB).then(value=>{
   if(disposed){value.close();throw Error('SWAP_PANEL_CLOSED');}journal=value;
   engine=createWebSwapEngine({journal,rpc:createWebSwapRpc({fetchImpl}),fetchImpl,isForeground:()=>!disposed&&!panel.hidden&&doc.visibilityState==='visible'&&!!readWebPerpsWalletSession(doc)});
  }).catch(error=>{services=null;throw error;});
  await services;
 };
 const invalidate=()=>{revision++;engine?.invalidate();review=null;consent.checked=false;summary.textContent='';update();};
 function update(){
  const connected=readWebPerpsWalletSession(doc);reviewButton.disabled=busy||!connected;check.disabled=busy||!selectedWalletAccount(doc);
  confirm.disabled=busy||!connected||!review||!consent.checked||Date.now()>=review.expiresAt;
  direction.disabled=busy;amount.disabled=busy;consent.disabled=busy||!review;
 }
 const message=error=>{const code=String(error?.message||'SWAP_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,80);
  status.textContent=t('No se completó el intercambio. Si hay una operación pendiente, consulta su estado antes de repetir. Código: ','The swap did not complete. Check any pending operation before trying again. Code: ')+code;};
 async function noOtherPending(address){
  const entries=await openWebPerpsSigningJournal({indexedDB:win.indexedDB});
  try{if((await entries.pending(address)).length)throw Error('PENDING_FUTURES_OPERATION');}finally{entries.close();}
  const closes=await openWebCloseJournal({indexedDB:win.indexedDB});
  try{if((await closes.pending(address)).length)throw Error('PENDING_CLOSE_OPERATION');}finally{closes.close();}
 }
 reviewButton.onclick=async()=>{
  if(busy)return;invalidate();busy=true;update();const ticket=revision;
  try{const selected=session(),input=direction.value,units=swapInputUnits(amount.value.trim(),input==='SOL'?9:6);await ready();await noOtherPending(selected.address);
   const result=await engine.prepare({payer:selected.address,inputMint:input==='SOL'?SOL:USDC,outputMint:input==='SOL'?USDC:SOL,amount:units,slippageBps:50});
   if(ticket!==revision||session().address!==selected.address||panel.hidden)throw Error('SWAP_REVIEW_CHANGED');review=result;
   summary.textContent=t('Entregas: ','Pay: ')+format(result.input,input==='SOL'?9:6)+' '+input+t(' · Recibes como mínimo: ',' · Minimum received: ')+format(result.minimum,input==='SOL'?6:9)+' '+(input==='SOL'?'USDC':'SOL')+t(' · Red SOL: ',' · SOL network: ')+format(result.fee,9)+t(' · Reserva de cuenta SOL: ',' · SOL account reserve: ')+format(result.rent,9);
   status.textContent=t('Revisión válida durante unos segundos. Comprueba los datos antes de aprobar.','Review is valid for a few seconds. Check the details before approving.');
  }catch(error){message(error);}finally{busy=false;update();}
 };
 confirm.onclick=async()=>{
  if(busy||!review||!consent.checked)return;const original=review;busy=true;update();
  try{await ready();await withWalletOperationLock(doc,original.address,async()=>{
   if(session().address!==original.address||review!==original||!consent.checked)throw Error('SWAP_REVIEW_CHANGED');await noOtherPending(original.address);
   const signed=await signReviewedWalletSwap(doc,engine.authorize(original,true));await noOtherPending(original.address);
   await engine.submit(original,signed);
  },{required:true});status.textContent=t('Enviado. Consulta el estado; no repitas la operación.','Submitted. Check the status; do not repeat the operation.');
  }catch(error){message(error);}finally{invalidate();busy=false;update();doc.dispatchEvent(new (win.Event||Event)('jamd-wallet-refresh'));}
 };
 check.onclick=async()=>{if(busy)return;busy=true;update();try{const selected=selectedWalletAccount(doc);if(!selected)throw Error('WALLET_REQUIRED');await ready();const result=await engine.checkPending(selected.address);
  status.textContent=!result?t('No hay swaps pendientes registrados en este navegador.','No pending swaps recorded in this browser.'):result.state==='FINALIZED'?t('Intercambio confirmado. Actualizando saldo…','Swap finalized. Refreshing balance…'):result.state==='FAILED'?t('La operación falló en la red. Puede haber costes de red.','Transaction failed on chain. Network fees may apply.'):t('Pendiente de verificación. No repitas la operación.','Awaiting verification. Do not repeat the operation.');
  if(result?.state==='FINALIZED')doc.dispatchEvent(new (win.Event||Event)('jamd-wallet-refresh'));
 }catch(error){message(error);}finally{busy=false;update();}};
 amount.oninput=()=>invalidate();direction.onchange=()=>{amount.value='';amount.placeholder=t('Cantidad en ','Amount in ')+direction.value;invalidate();};consent.onchange=update;
 close.onclick=()=>{panel.hidden=true;invalidate();};
 const changed=()=>{invalidate();if(!panel.hidden)display();};
 function display(){const selected=selectedWalletAccount(doc),data=currentWalletPortfolio(doc);accountLabel.textContent=selected?selected.name+' · '+selected.address:'';
  const fresh=data&&Date.now()-Date.parse(data.updatedAt)<120000;balance.textContent=fresh?t('Saldo consultado: ','Observed balance: ')+(data.sol?.amount??'—')+' SOL · '+(data.tokens?.find(v=>v.mint===USDC)?.amount??'—')+' USDC':t('Actualiza el saldo de esta billetera.','Refresh this wallet balance.');
  status.textContent=readWebPerpsWalletSession(doc)?t('El intercambio se revisa aquí. Phantom pedirá tu aprobación.','Review the swap here. Phantom will request your approval.'):t('Reconecta esta billetera externa en Activos para autorizar. Una dirección de solo consulta no puede firmar.','Reconnect this external wallet in Assets to authorize. A view-only address cannot sign.');update();}
 doc.addEventListener?.('jamd-wallet-portfolio',changed);doc.addEventListener?.('jamd-web-wallet-session',changed);doc.addEventListener?.('visibilitychange',invalidate);
 const timer=setInterval(()=>{if(review&&Date.now()>=review.expiresAt){invalidate();status.textContent=t('Revisión vencida. Pulsa Revisar intercambio de nuevo.','Review expired. Select Review swap again.');}},1000);timer.unref?.();
 update();return {element:panel,open(){panel.hidden=false;invalidate();display();},dispose(){disposed=true;clearInterval(timer);engine?.invalidate();journal?.close();doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('jamd-web-wallet-session',changed);doc.removeEventListener?.('visibilitychange',invalidate);}};
}
