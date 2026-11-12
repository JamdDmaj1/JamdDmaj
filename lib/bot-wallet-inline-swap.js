import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {createBotWalletSwapClient} from './bot-wallet-swap-client.js';
import {readExistingPerpsControlSession} from './perps-control-client.js';
import {BOT_SWAP_TOKENS,parseBotSwapDirection} from './bot-swap-tokens.js';

const display=(units,decimals)=>{const n=BigInt(units),s=10n**BigInt(decimals);return n/s+'.'+String(n%s).padStart(decimals,'0');};
const SYMBOLS=Object.keys(BOT_SWAP_TOKENS);

export function createBotWalletInlineSwap(language,doc,win,{onVerified=()=>{}}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};

 if(!doc.getElementById('bot-swap-styles')){
  const style=doc.createElement('style');style.id='bot-swap-styles';
  const CSS = [
   '.bot-swap-card{border:1px solid #1b2c3d;border-radius:18px;background:linear-gradient(180deg,#0c1727,#0a1423);padding:18px 18px 16px;color:#e6f0fa;max-width:640px}',
   '.bot-swap-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}',
   '.bot-swap-head h3{margin:0;font-size:15px;letter-spacing:.2px}',
   '.bot-swap-close{border:0;background:transparent;color:#7d93aa;font-size:18px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}',
   '.bot-swap-close:hover{color:#dce9f6;background:#122234}',
   '.bot-swap-identity{margin:2px 0 10px;font-size:11px;color:#7f97af;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}',
   '.bot-swap-note{margin:0 0 14px;font-size:11px;color:#8ba1b8;line-height:1.45}',
   '.bot-swap-link{border:0;background:transparent;color:#69c7ff;font-size:12px;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}',
   '.bot-swap-link[disabled]{color:#546f88;cursor:default;text-decoration:none}',
   '.bot-swap-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;margin:12px 0}',
   '.bot-swap-field{display:flex;flex-direction:column;gap:6px}',
   '.bot-swap-field span{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#7f97af}',
   '.bot-swap-field select,.bot-swap-amount{border:1px solid #24405a;background:#0a1624;color:#eaf3fb;border-radius:12px;padding:12px;font-size:14px;font-weight:650;outline:none}',
   '.bot-swap-field select:focus,.bot-swap-amount:focus{border-color:#2fbf8f;box-shadow:0 0 0 3px rgba(47,191,143,.14)}',
   '.bot-swap-invert{border:1px solid #24405a;background:#102033;color:#9fd7ff;border-radius:12px;width:42px;height:44px;cursor:pointer;font-size:16px}',
   '.bot-swap-invert:hover{border-color:#2fbf8f;color:#7ef0cf}',
   '.bot-swap-amount-wrap{display:flex;flex-direction:column;gap:6px;margin:6px 0 14px}',
   '.bot-swap-amount-wrap span{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#7f97af}',
   '.bot-swap-amount{width:100%;font-size:18px;font-weight:750;letter-spacing:.3px}',
   '.bot-swap-actions{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 4px}',
   '.bot-swap-primary{border:1px solid #2fbf8f;background:#2fbf8f;color:#04150f;font-weight:800;border-radius:12px;padding:12px 18px;font-size:14px;cursor:pointer;flex:1;min-width:180px}',
   '.bot-swap-primary[disabled]{opacity:.45;cursor:not-allowed}',
   '.bot-swap-summary{display:none;border:1px solid #1b2c3d;background:#0a1524;border-radius:14px;padding:12px 14px;margin:12px 0}',
   '.bot-swap-summary.has-data{display:block}',
   '.bot-swap-summary div{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#9db4ca;padding:4px 0}',
   '.bot-swap-summary strong{color:#e9f3fb;font-variant-numeric:tabular-nums}',
   '.bot-swap-consent{display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#a9bfd4;line-height:1.4;margin:10px 0}',
   '.bot-swap-consent input{margin-top:2px;accent-color:#2fbf8f}',
   '.bot-swap-status{margin:8px 0 0;font-size:12px;color:#f0c987;min-height:16px;line-height:1.45}',
   '.bot-swap-pending{margin-top:6px}'
  ];
  style.textContent=CSS.join(String.fromCharCode(10));
  doc.head.append(style);
 }

 const panel=node('section','','bot-swap-card wallet-inline-swap');panel.hidden=true;
 const head=node('div','','bot-swap-head');
 const title=node('h3',t('Swap de la billetera del bot','Bot wallet swap'));
 const close=node('button','\u00d7','bot-swap-close');close.type='button';close.setAttribute('aria-label',t('Cerrar','Close'));
 head.append(title,close);
 const identity=node('p','','bot-swap-identity');
 const notice=node('p',t('El bot debe estar pausado y sin posiciones abiertas. Este swap no activa el bot ni transfiere fondos.','The bot must be paused with no open positions. This swap does not activate the bot or move funds elsewhere.'),'bot-swap-note');
 const read=node('button',t('Consultar billetera del bot','Read bot wallet'),'bot-swap-link');read.type='button';

 const row=node('div','','bot-swap-row');
 const fromField=node('label','','bot-swap-field');fromField.append(node('span',t('Entregas','You pay')));
 const fromSel=node('select');fromSel.setAttribute('aria-label',t('Token que entrega el bot','Token the bot pays'));
 const toField=node('label','','bot-swap-field');toField.append(node('span',t('Recibes','You receive')));
 const toSel=node('select');toSel.setAttribute('aria-label',t('Token que recibe el bot','Token the bot receives'));
 for(const symbol of SYMBOLS){const a=node('option',symbol);a.value=symbol;fromSel.append(a);const b=node('option',symbol);b.value=symbol;toSel.append(b);}
 fromField.append(fromSel);toField.append(toSel);
 const invert=node('button','\u21c4','bot-swap-invert');invert.type='button';invert.setAttribute('aria-label',t('Invertir','Invert'));
 row.append(fromField,invert,toField);

 const amountWrap=node('label','','bot-swap-amount-wrap');
 const amountLabel=node('span',t('Cantidad a entregar','Amount to pay'));
 const amount=node('input','','bot-swap-amount');amount.type='text';amount.inputMode='decimal';amount.autocomplete='off';amount.placeholder='0.00 SOL';
 amountWrap.append(amountLabel,amount);

 const actions=node('div','','bot-swap-actions');
 const prepare=node('button',t('Revisar swap','Review swap'),'bot-swap-primary');prepare.type='button';
 const recover=node('button',t('Consultar resultado pendiente','Check pending result'),'bot-swap-link bot-swap-pending');recover.type='button';
 actions.append(prepare);

 const summary=node('div','','bot-swap-summary');
 const consentRow=node('label','','bot-swap-consent');
 const consent=node('input');consent.type='checkbox';
 consentRow.append(consent,node('span',t('Autorizo al servidor a firmar y enviar solo este swap revisado.','I authorize the server to sign and submit only this reviewed swap.')));

 const confirm=node('button',t('Confirmar swap','Confirm swap'),'bot-swap-primary');confirm.type='button';
 const status=node('p','','bot-swap-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');

 panel.append(head,identity,notice,read,row,amountWrap,actions,summary,consentRow,confirm,recover,status);

 const client=createBotWalletSwapClient({fetchImpl:(...args)=>win.fetch(...args),readSessionToken:()=>readExistingPerpsControlSession(win)});
 let account=null,review=null,verified='',available=false,pending=null,busy=false,revision=0;

 const direction=()=>fromSel.value+'_TO_'+toSel.value;
 const syncTokens=()=>{for(const option of toSel.options)option.disabled=option.value===fromSel.value;if(toSel.value===fromSel.value){const next=SYMBOLS.find(s=>s!==fromSel.value);toSel.value=next||SYMBOLS[0];}amountLabel.textContent=t('Cantidad en ','Amount in ')+fromSel.value;amount.placeholder='0.00 '+fromSel.value;};
 function current(ticket){const selected=selectedWalletAccount(doc);return ticket===revision&&!panel.hidden&&selected?.source==='watch'&&selected.address===account;}
 function update(){
  prepare.disabled=busy||!available||!amount.value.trim();
  confirm.disabled=busy||!review||!consent.checked||Date.now()>=review.expiresAt;
  recover.disabled=busy||!pending;
  read.disabled=busy;amount.disabled=busy;fromSel.disabled=busy;toSel.disabled=busy;invert.disabled=busy;
  consent.disabled=busy||!review;
 }
 function invalidate(){revision++;review=null;consent.checked=false;summary.replaceChildren();summary.classList.remove('has-data');update();}
 function failure(error){
  const code=error?.code||error?.message||'bot-swap-unavailable';
  const text={
   'session-missing':t('Inicia sesion con Google para consultar tu billetera del bot.','Sign in with Google to read your bot wallet.'),
   'login-required':t('Tu sesion vencio. Vuelve a iniciar sesion con Google.','Your session expired. Sign in again.'),
   'bot-swap-pause-required':t('Pausa nuevas entradas del bot antes de intercambiar su saldo.','Pause new bot entries before swapping its balance.'),
   'bot-swap-backup-required':t('Falta verificar el respaldo del servidor. No se envio este swap.','The server backup needs verification. This swap was not sent.'),
   'bot-swap-reconciliation-required':t('Hay una operacion pendiente o saldo reservado. Consulta su resultado; no repitas el swap.','An operation is pending or funds are reserved. Check its result; do not repeat.'),
   'controls-unavailable':t('El servidor no pudo completar la solicitud. No significa que hayas perdido acceso a tu billetera.','The server could not complete the request. This does not mean you lost access to your wallet.'),
   'bot-swap-simulation-failed':t('Solana rechazo la simulacion de la ruta. No se envio el swap. Solicita una revision nueva.','Solana rejected the route simulation. The swap was not sent. Request a new review.'),
   'bot-swap-insufficient-funds':t('El saldo no cubre el importe, la red y las reservas. Conserva SOL para comisiones.','The balance does not cover the amount, fees and reserves. Keep SOL for fees.'),
   'bot-swap-quote-unavailable':t('No se pudo obtener una cotizacion nueva. Intenta mas tarde; no se envio nada.','No fresh quote could be obtained. Try later; nothing was sent.'),
   'bot-swap-network-unavailable':t('La consulta de Solana no esta disponible. Si hay una operacion pendiente, consulta su resultado.','The Solana lookup is unavailable. If something is pending, check its result.'),
   'bot-swap-status-unverified':t('El resultado aun no se pudo verificar. No repitas; consulta mas tarde.','The outcome could not be verified yet. Do not repeat; check later.'),
   'bot-swap-review-expired':t('La revision vencio. Pide una revision nueva antes de confirmar.','The review expired. Request a new review before confirming.'),
   'bot-swap-cost-changed':t('Los costes cambiaron. Pide una revision nueva.','Costs changed. Request a new review.'),
   'bot-swap-route-rejected':t('La ruta no cumple las comprobaciones de seguridad. No se envio.','The route failed the safety checks. Nothing was sent.'),
   'bot-swap-unavailable':t('Este intercambio no esta disponible en el servidor. No se envio dinero.','This swap is not available on the server. No funds were sent.')
  }[code];
  status.textContent=text||t('No se pudo completar. Codigo: ','Could not complete. Code: ')+String(code).slice(0,80);
 }

 read.onclick=async()=>{if(busy||!account)return;invalidate();const ticket=revision;busy=true;update();try{const value=await client.status(account);if(!current(ticket))return;verified=account;onVerified(account);available=value.swapAvailable;pending=value.operations.find(v=>['SIGNING','UNKNOWN'].includes(v.state))||null;status.textContent=available?t('Billetera verificada. Elige los tokens y el importe.','Wallet verified. Choose tokens and amount.'):'';if(!available)failure({message:(value.reason||'BOT_SWAP_UNAVAILABLE').toLowerCase().replaceAll('_','-')});}catch(error){if(current(ticket)){available=false;failure(error);}}finally{busy=false;update();}};

 prepare.onclick=async()=>{if(busy||!available)return;invalidate();const ticket=revision;busy=true;update();try{const value=await client.prepare(account,direction(),amount.value.trim());if(!current(ticket))return;review=value;
  const pair=parseBotSwapDirection(value.direction);
  if(!pair)throw Error('bot-swap-invalid-pair');
  summary.replaceChildren();
  const line=(label,text)=>{const div=node('div');div.append(node('span',label),node('strong',text));summary.append(div);};
  line(t('Entregas','You pay'),display(value.inputUnits,pair.decimals)+' '+pair.from);
  line(t('Minimo recibido','Minimum received'),display(value.minimumOutputUnits,pair.outputDecimals)+' '+pair.to);
  line(t('Red (SOL)','Network (SOL)'),display(value.networkFeeLamports,9));
  line(t('Reserva de cuenta (SOL)','Account reserve (SOL)'),display(value.accountRentLamports,9));
  summary.classList.add('has-data');
  status.textContent=t('Revisa los datos y confirma en unos segundos.','Review the numbers and confirm within seconds.');
 }catch(error){if(current(ticket))failure(error);}finally{busy=false;update();}};

 confirm.onclick=async()=>{if(busy||!review||!consent.checked)return;const original=review,ticket=revision;pending={id:original.id};busy=true;update();try{const result=await client.confirm(original,true);if(!current(ticket))return;pending=result;available=false;status.textContent=t('Envio registrado. Consulta el resultado; no lo repitas.','Submission recorded. Check the result; do not repeat.');}catch(error){if(current(ticket))failure(error);}finally{invalidate();busy=false;update();}};

 recover.onclick=async()=>{if(busy||!pending)return;const ticket=revision;busy=true;update();try{const result=await client.recover(account,pending.id);if(!current(ticket))return;pending=['SIGNING','UNKNOWN'].includes(result.state)?result:null;
  status.textContent=result.operation==='TRANSFER'?t('Esta operacion es un envio. Consulta su resultado en Enviar.','This operation is a send. Check it in Send.'):result.state==='FINALIZED'?t('Swap confirmado. Actualizando el saldo.','Swap finalized. Refreshing the balance.'):result.state==='ABORTED'?t('No se envio. Puedes preparar otra revision.','Not submitted. You can prepare a new review.'):result.state==='FAILED'?t('La red rechazo la operacion. Puede haber comisiones.','The chain rejected it. Network fees may apply.'):t('Resultado pendiente. No repitas la operacion.','Still pending. Do not repeat.');
  if(result.state==='FINALIZED')doc.dispatchEvent(new (win.Event||Event)('jamd-wallet-refresh'));
 }catch(error){if(current(ticket))failure(error);}finally{busy=false;update();}};

 amount.oninput=()=>{invalidate();update();};
 fromSel.onchange=()=>{syncTokens();amount.value='';invalidate();};
 toSel.onchange=()=>{amount.value='';invalidate();};
 invert.onclick=()=>{const from=fromSel.value;fromSel.value=toSel.value;toSel.value=from;syncTokens();amount.value='';invalidate();};
 consent.onchange=update;
 close.onclick=()=>{panel.hidden=true;invalidate();};

 const changed=()=>{const selected=selectedWalletAccount(doc);if(selected?.source!=='watch'||selected.address!==account){panel.hidden=true;available=false;verified='';invalidate();}};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);
 const hidden=()=>{if(doc.hidden)invalidate();};doc.addEventListener?.('visibilitychange',hidden);
 const timer=setInterval(()=>{if(review&&Date.now()>=review.expiresAt){invalidate();status.textContent=t('Revision vencida. Revisa de nuevo.','Review expired. Review again.');}},1000);timer.unref?.();

 syncTokens();update();
 return {element:panel,verifiedAddress:()=>verified,async open(){const selected=selectedWalletAccount(doc);if(selected?.source!=='watch')return;account=selected.address;identity.textContent=account;panel.hidden=false;available=false;pending=null;invalidate();await read.onclick();},dispose(){clearInterval(timer);invalidate();doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('visibilitychange',hidden);}};
}
