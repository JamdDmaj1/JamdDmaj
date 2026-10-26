import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {createBotWalletSwapClient} from './bot-wallet-swap-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
const display=(units,decimals)=>{const n=BigInt(units),s=10n**BigInt(decimals);return n/s+'.'+String(n%s).padStart(decimals,'0');};
export function createBotWalletInlineSwap(language,doc,win,{onVerified=()=>{}}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='wallet-inline-swap';panel.hidden=true;
 const title=node('h3',t('Swap de la billetera del bot','Bot wallet swap')),identity=node('p'),notice=node('p',t('El bot debe estar pausado y sin posiciones abiertas. Este swap no activa el bot ni transfiere fondos a otra billetera.','The bot must be paused with no open positions. This swap does not activate the bot or transfer funds to another wallet.'));
 const direction=node('select');direction.setAttribute('aria-label',t('Entregas y recibes del bot','Bot pay and receive'));
 for(const [value,label]of [['SOL_TO_USDC','SOL → USDC'],['USDC_TO_SOL','USDC → SOL']]){const option=node('option',label);option.value=value;direction.append(option);}direction.value='SOL_TO_USDC';
 const amount=node('input');amount.type='text';amount.inputMode='decimal';amount.autocomplete='off';amount.placeholder=t('Cantidad del token, no dólares','Token amount, not dollars');amount.setAttribute('aria-label',t('Cantidad que entrega el bot','Bot input amount'));
 const read=node('button',t('Consultar billetera del bot','Read bot wallet')),prepare=node('button',t('Revisar swap del bot','Review bot swap')),confirm=node('button',t('Confirmar este swap real','Confirm this real swap')),recover=node('button',t('Consultar resultado pendiente','Check pending result')),close=node('button',t('Cerrar','Close'));
 for(const button of [read,prepare,confirm,recover,close])button.type='button';
 const consent=node('input');consent.type='checkbox';const label=node('label');label.append(consent,node('span',t('Autorizo al servidor a firmar y enviar únicamente este swap revisado.','I authorize the server to sign and submit only this reviewed swap.')));
 const summary=node('p'),status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(title,identity,notice,read,direction,amount,prepare,summary,label,confirm,recover,status,close);
 const client=createBotWalletSwapClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
 let account=null,review=null,verified='',available=false,pending=null,busy=false,revision=0;
 function current(ticket){const selected=selectedWalletAccount(doc);return ticket===revision&&!panel.hidden&&selected?.source==='watch'&&selected.address===account;}
 function update(){prepare.disabled=busy||!available;confirm.disabled=busy||!review||!consent.checked||Date.now()>=review.expiresAt;recover.disabled=busy||!pending;read.disabled=busy;amount.disabled=busy;direction.disabled=busy;consent.disabled=busy||!review;}
 function invalidate(){revision++;review=null;consent.checked=false;summary.textContent='';update();}
 function failure(error){
  const code=error?.code||error?.message||'bot-swap-unavailable';
  const text={
   'session-missing':t('Inicia sesión con Google en JamdDmaj para consultar tu billetera del bot.','Sign in with Google in JamdDmaj to read your bot wallet.'),
   'login-required':t('Tu sesión venció. Vuelve a iniciar sesión con Google.','Your session expired. Sign in with Google again.'),
   'bot-swap-pause-required':t('Pausa nuevas entradas del bot antes de intercambiar su saldo.','Pause new bot entries before swapping its balance.'),
   'bot-swap-backup-required':t('Falta verificar el respaldo del servidor con el registro de swaps. No se envió este swap.','The server backup including swap records needs verification. This swap was not sent.'),
   'bot-swap-reconciliation-required':t('Hay una operación pendiente o saldo reservado. Consulta su resultado; no repitas el swap.','An operation is pending or funds are reserved. Check its result; do not repeat the swap.'),
   'controls-unavailable':t('No se pudo verificar el acceso del servidor a esta billetera.','The server could not verify access to this wallet.'),
   'bot-swap-unavailable':t('El servidor aún no tiene disponible este intercambio. No se envió dinero.','This swap is not yet available on the server. No funds were sent.')
  }[code];status.textContent=text||t('No se pudo completar. Consulta el estado antes de repetir. Código: ','Could not complete. Check the status before retrying. Code: ')+String(code).slice(0,80);
 }
 read.onclick=async()=>{if(busy||!account)return;invalidate();const ticket=revision;busy=true;update();try{const value=await client.status(account);if(!current(ticket))return;verified=account;onVerified(account);available=value.swapAvailable;pending=value.operations.find(v=>['SIGNING','UNKNOWN'].includes(v.state))||null;
  status.textContent=available?t('Billetera del bot verificada. Escribe la cantidad de SOL o USDC que quieres entregar. Conserva SOL para la red.','Bot wallet verified. Enter the SOL or USDC amount to pay. Keep SOL for network fees.'):'';if(!available)failure({message:(value.reason||'BOT_SWAP_UNAVAILABLE').toLowerCase().replaceAll('_','-')});
 }catch(error){if(current(ticket)){available=false;failure(error);}}finally{busy=false;update();}};
 prepare.onclick=async()=>{if(busy||!available)return;invalidate();const ticket=revision;busy=true;update();try{const value=await client.prepare(account,direction.value,amount.value.trim());if(!current(ticket))return;review=value;
  const inputSol=value.direction==='SOL_TO_USDC';summary.textContent=t('Entregas: ','Pay: ')+display(value.inputUnits,inputSol?9:6)+(inputSol?' SOL':' USDC')+t(' · Mínimo recibido: ',' · Minimum received: ')+display(value.minimumOutputUnits,inputSol?6:9)+(inputSol?' USDC':' SOL')+t(' · Red SOL: ',' · SOL network: ')+display(value.networkFeeLamports,9)+t(' · Reserva de cuenta SOL: ',' · SOL account reserve: ')+display(value.accountRentLamports,9);
  status.textContent=t('Revisa antes de confirmar. La revisión vence en unos segundos.','Review before confirming. This review expires in a few seconds.');
 }catch(error){if(current(ticket))failure(error);}finally{busy=false;update();}};
 confirm.onclick=async()=>{if(busy||!review||!consent.checked)return;const original=review,ticket=revision;pending={id:original.id};busy=true;update();try{const result=await client.confirm(original,true);if(!current(ticket))return;pending=result;available=false;status.textContent=t('Envío registrado. Consulta el resultado; no lo repitas.','Submission recorded. Check its result; do not repeat it.');
 }catch(error){if(current(ticket))failure(error);}finally{invalidate();busy=false;update();}};
 recover.onclick=async()=>{if(busy||!pending)return;const ticket=revision;busy=true;update();try{const result=await client.recover(account,pending.id);if(!current(ticket))return;pending=['SIGNING','UNKNOWN'].includes(result.state)?result:null;
  status.textContent=result.state==='FINALIZED'?t('Swap confirmado. Actualizando el saldo de esta misma billetera.','Swap finalized. Refreshing this same wallet balance.'):result.state==='ABORTED'?t('No se envió. Puedes consultar la billetera y preparar otra revisión.','Not submitted. Read the wallet and prepare a new review.'):result.state==='FAILED'?t('La red rechazó la operación. Puede haber comisiones de red.','The chain rejected the operation. Network fees may apply.'):t('Resultado todavía pendiente. No repitas la operación.','Outcome still pending. Do not repeat the operation.');
  if(result.state==='FINALIZED')doc.dispatchEvent(new (win.Event||Event)('jamd-wallet-refresh'));
 }catch(error){if(current(ticket))failure(error);}finally{busy=false;update();}};
 amount.oninput=invalidate;direction.onchange=()=>{amount.value='';invalidate();};consent.onchange=update;close.onclick=()=>{panel.hidden=true;invalidate();};
 const changed=()=>{const selected=selectedWalletAccount(doc);if(selected?.source!=='watch'||selected.address!==account){panel.hidden=true;available=false;verified='';invalidate();}};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);const hidden=()=>{if(doc.hidden)invalidate();};doc.addEventListener?.('visibilitychange',hidden);
 const timer=setInterval(()=>{if(review&&Date.now()>=review.expiresAt){invalidate();status.textContent=t('Revisión vencida. Revisa de nuevo antes de confirmar.','Review expired. Review again before confirming.');}},1000);timer.unref?.();
 update();return {element:panel,verifiedAddress:()=>verified,async open(){const selected=selectedWalletAccount(doc);if(selected?.source!=='watch')return;account=selected.address;identity.textContent=account;panel.hidden=false;available=false;pending=null;invalidate();await read.onclick();},dispose(){clearInterval(timer);invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('visibilitychange',hidden);}};
}
