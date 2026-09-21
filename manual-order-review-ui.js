import {language} from './lib/simulator-i18n.js?v=10';
import {reviewManualOrder} from './lib/manual-order-draft.js';
const es=language==='es', text=(a,b)=>es?a:b;
const panel=document.createElement('section');panel.className='card';
const title=document.createElement('h2');title.textContent=text('Revisar orden Bitget — envío no habilitado','Review Bitget order — submission disabled');
const note=document.createElement('p');note.textContent=text('Formulario separado del simulador. No verifica cotizaciones ni disponibilidad del contrato. Market e isolated; límites de esta integración: 1–25 USDT de margen y 1–10×.','Separate from the simulator. Quotes and contract availability are not verified. Market and isolated; integration limits: 1–25 USDT margin and 1–10×.');
const form=document.createElement('form');const inputs={};
for(const [key,label,en,type] of [['symbol','Contrato, por ejemplo BTCUSDT','Contract, e.g. BTCUSDT','text'],['side','Dirección','Direction','select'],['margin','Margen USDT','Margin USDT','number'],['leverage','Apalancamiento','Leverage','number'],['reference','Precio de referencia USDT (no es una cotización)','Reference price USDT (not a quote)','number'],['stop','Stop loss USDT','Stop loss USDT','number'],['take','Take profit USDT','Take profit USDT','number']]){
 const l=document.createElement('label');l.textContent=text(label,en);
 const input=document.createElement(type==='select'?'select':'input');input.id='manual-review-'+key;input.name=key;l.htmlFor=input.id;
 if(type==='select'){for(const side of ['LONG','SHORT']){const option=document.createElement('option');option.value=side;option.textContent=side;input.append(option);}}
 else{input.type=type;input.required=true;if(type==='number'){input.step=key==='leverage'?'1':'any';input.min=key==='margin'||key==='leverage'?'1':'0.000000000001';}if(key==='margin')input.max='25';if(key==='leverage')input.max='10';}
 inputs[key]=input;form.append(l,input);
}
const review=document.createElement('button');review.type='submit';review.textContent=text('Revisar sin enviar','Review without sending');
const quoteButton=document.createElement('button');quoteButton.type='button';quoteButton.textContent=text('Consultar precio en Bitget','Fetch Bitget price');
const quoteStatus=document.createElement('p');quoteStatus.setAttribute('role','status');
let quoteVersion=0;
inputs.symbol.addEventListener('input',()=>{quoteVersion++;quoteStatus.textContent='';inputs.reference.value='';});
quoteButton.onclick=async()=>{
 const version=++quoteVersion;quoteButton.disabled=true;quoteStatus.textContent=text('Consultando…','Fetching…');
 try{
  const device=localStorage.getItem('jamdV2DeviceId')||'';
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))throw new Error('owner');
  const response=await fetch('/api/pro',{method:'POST',headers:{'Content-Type':'application/json','x-jamddmaj-device':device},body:JSON.stringify({action:'manualQuote',symbol:inputs.symbol.value.trim().toUpperCase()}),signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw new Error('quote');const data=await response.json();
  if(version!==quoteVersion)return;
  if(!data.quote||!Number.isFinite(data.quote.price))throw new Error('quote');
  inputs.reference.value=String(data.quote.price);
  quoteStatus.textContent=`Bitget · ${data.quote.symbol} · ${data.quote.price} USDT · ${new Date(data.quote.timestamp).toLocaleTimeString(language)}. ${text('Última operación, no precio garantizado de ejecución.','Last trade, not a guaranteed execution price.')}`;
  result.textContent='';
 }catch{if(version===quoteVersion)quoteStatus.textContent=text('Cotización no disponible. Comprueba el contrato y el acceso del propietario.','Quote unavailable. Check contract and owner access.');}
 finally{quoteButton.disabled=false;}
};
form.append(quoteButton,quoteStatus);
const result=document.createElement('p');result.setAttribute('role','status');result.style.whiteSpace='pre-line';
form.append(review);form.addEventListener('input',()=>{result.textContent='';});
form.addEventListener('submit',event=>{event.preventDefault();try{
 const draft=reviewManualOrder(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])));
 result.textContent=`${draft.symbol} · ${draft.side} · Market · Isolated\n${text('Margen','Margin')}: ${draft.margin} USDT · ${draft.leverage}×\n${text('Exposición nominal estimada','Estimated notional exposure')}: ${draft.notional} USDT\nStop: ${draft.stop} · TP: ${draft.take}\n${text('No se envió ninguna orden. Falta validar contrato, precio, saldo, protecciones y conexión antes de habilitar la confirmación real.','No order was sent. Contract, price, balance, protections and connection must be validated before live confirmation can be enabled.')}`;
 }catch{result.textContent=text('Revisa contrato, límites y niveles: LONG requiere stop < referencia < objetivo; SHORT lo contrario.','Check contract, limits and levels: LONG requires stop < reference < target; SHORT the reverse.');}});
const validate=document.createElement('button');validate.type='button';validate.textContent=text('Validar con el servidor (sin enviar)','Validate with server (no submission)');
const serverMessages={
 entries_paused_or_unknown:['Entradas pausadas o sin confirmar.','Entries paused or unconfirmed.'],
 insufficient_balance_with_fee_reserve:['Saldo insuficiente para margen y reserva de comisiones.','Insufficient balance for margin and fee reserve.'],
 price_changed_review_again:['El precio cambió: consulta y revisa de nuevo.','Price changed: fetch and review again.'],
 below_exchange_minimum:['La cantidad queda por debajo del mínimo del contrato.','Quantity is below the contract minimum.'],
 exchange_leverage_limit:['Apalancamiento fuera de los límites del contrato.','Leverage outside contract limits.'],
 account_balance_unconfirmed:['Saldo no confirmado o desactualizado.','Balance unconfirmed or stale.'],
 manual_only_unconfirmed:['El servidor aún no informa solo manual.','Server has not reported manual-only mode.'],
 pending_manual_intent:['Existe otra solicitud pendiente.','Another request is pending.']
};
validate.onclick=async()=>{
 validate.disabled=true;
 const snapshot=JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])));
 try{
  const draft=reviewManualOrder(JSON.parse(snapshot)),device=localStorage.getItem('jamdV2DeviceId')||'';
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))throw new Error('owner');
  const response=await fetch('/api/pro',{method:'POST',headers:{'Content-Type':'application/json','x-jamddmaj-device':device},body:JSON.stringify({action:'manualOrderPreview',draft}),signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!response.ok)throw new Error('validation');const data=await response.json();
  if(snapshot!==JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]))))throw new Error('changed');
  if(data.preview?.submitted!==false||!Array.isArray(data.preview.blockers))throw new Error('validation');
  const messages=data.preview.blockers.map(code=>serverMessages[code]?.[es?0:1]||text('Falta una comprobación del conector.','A connector check is incomplete.'));
  result.textContent=[`${draft.symbol} · ${draft.side} · ${draft.margin} USDT · ${draft.leverage}×`,...messages,text('Validación sin envío. La confirmación real todavía no está habilitada.','Validation without submission. Live confirmation is not enabled yet.')].join('\n');
 }catch{result.textContent=text('No se pudo validar. Revisa datos, acceso y cotización; no se envió ninguna orden.','Validation failed. Check inputs, access and quote; no order was sent.');}
 finally{validate.disabled=false;}
};
form.append(validate);
const prepare=document.createElement('button');prepare.type='button';prepare.textContent=text('Preparar confirmación real','Prepare live confirmation');
const statusButton=document.createElement('button');statusButton.type='button';statusButton.textContent=text('Consultar última solicitud','Check latest request');
const dialog=document.createElement('dialog');const summary=document.createElement('p');summary.style.whiteSpace='pre-line';
const send=document.createElement('button');send.type='button';send.textContent=text('Confirmar y enviar orden real','Confirm and send live order');
const cancel=document.createElement('button');cancel.type='button';cancel.textContent=text('Cancelar','Cancel');cancel.onclick=()=>dialog.close();
dialog.append(summary,cancel,send);panel.append(dialog);
let prepared=null,lastRequest=sessionStorage.getItem('jamdManualPendingId')||'';
async function terminalRequest(body){
 const device=localStorage.getItem('jamdV2DeviceId')||'';
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))throw Error('owner');
 const response=await fetch('/api/pro',{method:'POST',headers:{'Content-Type':'application/json','x-jamddmaj-device':device},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:'no-store'});
 const data=await response.json();if(!response.ok||data.ok!==true)throw Error(data.error?.message||'unavailable');return data;
}
form.addEventListener('input',()=>{prepared=null;dialog.close();});
prepare.onclick=async()=>{
 if(lastRequest){result.textContent=text('Primero verifica la solicitud anterior; no se reenviará automáticamente.','Check the previous request first; it will not be resubmitted automatically.');return;}
 prepare.disabled=true;
 const snapshot=JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])));
 try{
  const data=await terminalRequest({action:'manualPrepare',draft:reviewManualOrder(JSON.parse(snapshot))});
  if(snapshot!==JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]))))throw Error('changed');
  prepared=data;const d=data.draft;
  summary.textContent=`${d.symbol} · ${d.side} · MARKET · ISOLATED\n${text('Margen','Margin')}: ${d.margin} USDT · ${d.leverage}×\nStop: ${d.stop} · TP: ${d.take}\n${text('Referencia','Reference')}: ${d.reference} USDT\n${text('Dinero real. El precio de ejecución puede variar. El stop no garantiza el precio de salida. Confirmación válida durante 60 segundos.','Real funds. Execution price can change. Stops do not guarantee exit prices. Confirmation valid for 60 seconds.')}`;
  send.disabled=false;dialog.showModal();
 }catch(error){result.textContent=text('Preparación bloqueada. No se envió una orden. Detalle: ','Preparation blocked. No order sent. Detail: ')+error.message;}
 finally{prepare.disabled=false;}
};
send.onclick=async()=>{
 if(!prepared||prepared.expiresAt<=Date.now()){dialog.close();result.textContent=text('Confirmación vencida: revisa de nuevo.','Confirmation expired: review again.');return;}
 send.disabled=true;lastRequest=prepared.requestId;sessionStorage.setItem('jamdManualPendingId',lastRequest);
 try{const data=await terminalRequest({action:'manualConfirm',requestId:lastRequest,confirmLiveOrder:true});result.textContent=text('Solicitud en cola para el VPS, NO ejecución confirmada. Consulta su estado. ID: ','Request queued for VPS, NOT a confirmed fill. Check its status. ID: ')+data.requestId;}
 catch{result.textContent=text('Resultado no confirmado. No reenvíes la orden; consulta su estado y verifica Bitget. ID: ','Outcome unconfirmed. Do not resubmit; check status and Bitget. ID: ')+lastRequest;}
 finally{prepared=null;dialog.close();}
};
statusButton.onclick=async()=>{
 if(!lastRequest){result.textContent=text('No hay una solicitud guardada en esta sesión.','No saved request in this session.');return;}
 statusButton.disabled=true;
 try{const data=await terminalRequest({action:'manualOrderStatus',requestId:lastRequest});
 const labels={queued:text('En cola','Queued'),unconfirmed:text('Sin confirmar: comprueba Bitget; no reenvíes','Unconfirmed: check Bitget; do not resubmit'),uncertain:text('Respuesta incierta: comprueba Bitget; no reenvíes','Uncertain acknowledgement: check Bitget; do not resubmit'),reported_by_executor:text('Informe del conector','Executor report')};
 result.textContent=[labels[data.status]||text('Estado desconocido','Unknown status'),data.order?`${data.order.pair} · ${data.order.side} · ${data.order.status}`:'',data.receivedAt||'',lastRequest].join('\n');
 }catch{result.textContent=text('No se pudo consultar; no reenvíes la orden.','Status unavailable; do not resubmit.');}finally{statusButton.disabled=false;}
};
form.append(prepare,statusButton);
panel.append(title,note,form,result);document.querySelector('.stats').before(panel);
