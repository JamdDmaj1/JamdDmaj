// Configuration drafts only. No exchange connector, signing, or auto-start authority.
import {setupPerpsControlPanel} from './perps-control-panel.js';
import {currentWalletTradingState} from './wallet-trading-state.js';
import {computeTradeSignal} from './finance-markets.js';
const KEY='jamdAutomationDraftV1';
function invalidSetting(message,field){throw Object.assign(Error(message),{field});}
// Only published, open signals. Never treats a scanner candidate as a Telegram trade.
export function telegramSignalCards(open,now=Date.now()){
  if(!Array.isArray(open))return [];
  return open.filter(s=>s&&s.status==='OPEN'&&s.telegramMessageId&&Number.isFinite(Date.parse(s.telegramSentAt))&&Date.parse(s.telegramSentAt)<=now&&now-Date.parse(s.telegramSentAt)<=86400000)
    .filter(s=>['LONG','SHORT'].includes(s.side)&&/^[A-Z0-9]{2,24}(?:\/)?USDT$/.test(s.pair||s.symbol||'')&&Number.isFinite(Number(s.entry))&&Number(s.entry)>0)
    .sort((a,b)=>Date.parse(b.telegramSentAt)-Date.parse(a.telegramSentAt)).slice(0,12)
    .map(s=>({id:String(s.id||'').slice(0,160),pair:s.pair||s.symbol,side:s.side,entry:Number(s.entry),stop:Number(s.stopLoss||s.sl)||null,take:Number(s.tp1)||null,publishedAt:s.telegramSentAt}));
}
export function validateAutomationDraft(value){
  if(!value||typeof value!=='object')invalidSetting('invalid_limits','capital');
  const capital=Number(value.capital),loss=Number(value.loss),positions=Number(value.positions);
  if(!Number.isFinite(capital)||capital<=0)invalidSetting('invalid_limits','capital');
  if(!Number.isFinite(loss)||loss<=0||loss>capital)invalidSetting('invalid_limits','loss');
  if(!Number.isInteger(positions)||positions<1||positions>10)invalidSetting('invalid_limits','positions');
  return {capital,loss,positions};
}
export function validateAutomationSettings(value){
  const limits=validateAutomationDraft(value),margin=Number(value.margin),leverage=Number(value.leverage),dailyTrades=Number(value.dailyTrades);
  if(!Number.isFinite(margin)||margin<=0||margin>limits.capital)invalidSetting('invalid_sizing','margin');
  if(!Number.isFinite(leverage)||leverage<1.1||leverage>50||Math.round(leverage*10)!==leverage*10)invalidSetting('invalid_sizing','leverage');
  if(!Number.isInteger(dailyTrades)||dailyTrades<1||dailyTrades>100)invalidSetting('invalid_sizing','dailyTrades');
  const optional=(key,max)=>{if(value[key]===''||value[key]==null)return null;const n=Number(value[key]);if(!Number.isFinite(n)||n<=0||n>=max||!/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/.test(String(n)))invalidSetting('invalid_exit',key);return n;};
  const stopLossPercent=optional('stopLossPercent',100),takeProfitPercent=optional('takeProfitPercent',10000);
  const lossAction=value.lossAction||'disable';if(!['disable','reduce-leverage','reduce-margin'].includes(lossAction))invalidSetting('invalid_action','lossAction');
  const reductionPercent=Number(value.reductionPercent??50);if(!Number.isFinite(reductionPercent)||reductionPercent<=0||reductionPercent>=100)invalidSetting('invalid_reduction','reductionPercent');
  return {...limits,margin,leverage,dailyTrades,stopLossPercent,takeProfitPercent,lossAction,reductionPercent};
}
// Server form diagnostics only. Keep the draft format backwards compatible,
// but report the same existing 10-USDC floors before making a server request.
export function validatePerpsAutomationForm(value){
 const settings=validateAutomationSettings(value);
 if(settings.capital<10)invalidSetting('invalid_limits','capital');
 if(settings.margin<10)invalidSetting('invalid_sizing','margin');
 return settings;
}
export function setupAutomationPanel(parent,language,doc,storage=globalThis.localStorage,{controlsClient}={}){
  const t=(a,b)=>language==='es'?a:b;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=node('details');panel.id='jamd-automation';panel.className='card';panel.open=false;
  panel.append(node('summary',t('Automatización · configurar','Automation · configure')));
  panel.append(node('h2',t('Automatización JamdDmaj','JamdDmaj automation')));
  const balance=node('div'),balanceValue=node('h3','—'),balanceDetail=node('p');balance.className='automation-limit';
  const updateFunding=snapshot=>{
    if(snapshot?.stage==='OBSERVED_EXCLUSIVE_WALLET_FUNDS'){
      const raw=snapshot.availableUsdcUnits.padStart(7,'0'),fraction=raw.slice(-6).replace(/0+$/,'');
      balanceValue.textContent=raw.slice(0,-6)+(fraction?'.'+fraction:'')+' USDC';
      balanceDetail.textContent=t('Saldo observado de la billetera exclusiva del bot, antes de reservas y comisiones. No es el saldo principal ni una autorización para operar.','Observed exclusive bot wallet balance, before reserves and fees. Not your main balance or permission to trade.');
    }else{balanceValue.textContent='—';balanceDetail.textContent=t('Saldo de la billetera exclusiva aún no verificado. El saldo de tu billetera principal o Phantom no es capital asignado al bot.','Exclusive wallet balance is not yet verified. Your main or Phantom wallet balance is not allocated bot capital.');}
  };
  updateFunding(null);balance.append(node('small',t('Capital de automatización · billetera exclusiva · USDC','Automation capital · exclusive wallet · USDC')),balanceValue,balanceDetail);panel.append(balance);
  panel.append(node('p',t('Este borrador local no autoriza ni ejecuta operaciones. Consulta el servidor para ver el estado real y guardar límites en tu cuenta. No utiliza Bitget.','This local draft does not authorize or execute trades. Read the server status to view the actual state and save account limits. Does not use Bitget.')));
  let draft={};try{const saved=JSON.parse(storage?.getItem(KEY)||'null');draft={...validateAutomationDraft(saved)};try{draft=validateAutomationSettings(saved);}catch{}}catch{}
  const fields={};const limits=node('div');limits.className='automation-limits';panel.append(limits);
  const advanced=node('details');advanced.className='automation-advanced';advanced.append(node('summary',t('Salidas y reducción de riesgo · avanzado','Exits and risk reduction · advanced')));const advancedFields=node('div');advancedFields.className='automation-limits';advanced.append(advancedFields);panel.append(advanced);
  for(const[key,label]of [['capital',t('Capital máximo · USDC (mínimo 10)','Maximum capital · USDC (minimum 10)')],['loss',t('Límite de pérdida diaria · USDC','Daily loss limit · USDC')],['positions',t('Máximo de posiciones simultáneas (1–10)','Maximum concurrent positions (1–10)')]]){
    const l=node('label',label),input=node('input');input.id='automation-'+key;input.type='number';input.required=true;input.min=key==='positions'?'1':key==='capital'?'10':'0.01';input.step=key==='positions'?'1':'0.01';if(key==='positions')input.max='10';input.value=draft[key]??'';l.htmlFor=input.id;fields[key]=input;const box=node('div');box.className='automation-limit';box.append(l,input);limits.append(box);
  }
  for(const[key,label,min,max,step,fallback]of [
    ['margin',t('Margen por trade · USDC','Margin per trade · USDC'),10,null,.01,''],
    ['leverage',t('Apalancamiento por trade','Leverage per trade'),1.1,50,.1,3],
    ['dailyTrades',t('Máximo de trades diarios','Maximum daily trades'),1,100,1,5],
    ['stopLossPercent',t('Stop loss % · opcional','Stop loss % · optional'),.01,99.99,.01,''],
    ['takeProfitPercent',t('Take profit % · opcional','Take profit % · optional'),.01,9999,.01,''],
    ['reductionPercent',t('Reducción de riesgo %','Risk reduction %'),1,99,1,50]
  ]){const box=node('div');box.className='automation-limit';const labelNode=node('label',label),input=node('input');input.id='automation-'+key;input.type='number';input.min=String(min);if(max!==null)input.max=String(max);input.step=String(step);input.value=draft[key]??fallback;labelNode.htmlFor=input.id;fields[key]=input;box.append(labelNode,input);(['stopLossPercent','takeProfitPercent','reductionPercent'].includes(key)?advancedFields:limits).append(box);}
  panel.append(node('p',t('SL y TP vacíos: usar los precios publicados en la señal de Telegram. Si introduces porcentajes, se calculan sobre el precio de entrada, no sobre el margen ni el P/L apalancado.','Blank SL and TP: use the prices published in the Telegram signal. Percentages apply to entry price, not margin or leveraged P/L.')));
  const actionBox=node('div');actionBox.className='automation-limit';const actionLabel=node('label',t('Al alcanzar la pérdida diaria','When daily loss is reached')),action=node('select');action.id='automation-lossAction';actionLabel.htmlFor=action.id;
  for(const[value,label]of [['disable',t('Desactivar automatización','Disable automation')],['reduce-leverage',t('Pausar y reducir apalancamiento','Pause and reduce leverage')],['reduce-margin',t('Pausar y reducir margen','Pause and reduce margin')]]){const option=node('option',label);option.value=value;action.append(option);}action.value=draft.lossAction||'disable';fields.lossAction=action;actionBox.append(actionLabel,action);panel.append(actionBox);
  panel.append(node('p',t('El límite diario siempre detiene nuevas entradas. Una reducción se aplicaría a operaciones futuras tras reactivar explícitamente; no cambia posiciones abiertas ni permite seguir perdiendo por encima del límite.','The daily limit always stops new entries. A reduction applies to future trades after explicit reactivation; it does not modify open positions or bypass the daily loss limit.')));
  const status=node('p');status.setAttribute('role','status');
  const save=node('button',t('Guardar borrador','Save draft'));save.type='button';save.onclick=()=>{try{const value=validateAutomationSettings(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));if(!storage?.setItem)throw Error();storage.setItem(KEY,JSON.stringify(value));status.textContent=t('Borrador guardado en este dispositivo. Para aplicar tus ajustes usa Guardar límites y pausar en el servidor; después revisa y confirma Activar bot. Este borrador no cambia el estado real.','Draft saved on this device. Apply your settings using Save limits and pause on the server; then review and confirm Activate bot. This draft does not change the actual state.');}catch{status.textContent=t('No se guardó. Revisa capital, margen, apalancamiento, límites y almacenamiento.','Not saved. Check capital, margin, leverage, limits and storage.');}};
  panel.append(save,status);
  // Arm state is local and only switches the alert loop on: it never authorises an order.
  const armKey='jamd-automation-armed';
  const readArmed=()=>{try{return doc.defaultView?.localStorage?.getItem?.(armKey)==='1';}catch{return false;}};
  const writeArmed=value=>{try{doc.defaultView?.localStorage?.setItem?.(armKey,value?'1':'0');}catch{}};
  const readiness=node('p');readiness.setAttribute('role','status');
  const refreshReadiness=()=>{
   const armed=readArmed();
   let available=null;
   try{const state=currentWalletTradingState(doc);available=Number(state?.availableUsdcUnits??state?.snapshot?.availableUsdcUnits??NaN);}catch{}
   if(!Number.isFinite(available)){try{const raw=doc.defaultView?.localStorage?.getItem?.('jamd-wallet-trading-state');const parsed=raw?JSON.parse(raw):null;available=Number(parsed?.snapshot?.availableUsdcUnits??NaN);}catch{}}
   const usdc=Number.isFinite(available)?available/1e6:null;
   const minimum=10;
   const margin=Number(fields?.margin?.value||0);
   const shortfall=usdc===null?null:Math.max(0,Math.max(minimum,margin||minimum)-usdc);
   const parts=[];
   parts.push(armed?t('Armado en modo aviso','Armed in alert mode'):t('Desarmado','Disarmed'));
   if(usdc===null)parts.push(t('sin lectura de saldo','no balance reading'));
   else if(shortfall>0)parts.push(t('faltan ','missing ')+shortfall.toLocaleString(language,{maximumFractionDigits:2})+' USDC '+t('para el minimo del venue','for the venue minimum'));
   else parts.push(t('saldo suficiente','enough balance'));
   readiness.textContent=parts.join(' · ')+' · '+t('no envia ordenes','it does not send orders');
  };
  const armButton=node('button');armButton.type='button';
  const paintArm=()=>{armButton.textContent=readArmed()?t('Desarmar modo aviso','Disarm alert mode'):t('Armar en modo aviso','Arm in alert mode');armButton.setAttribute('aria-pressed',String(readArmed()));refreshReadiness();};
  armButton.onclick=()=>{writeArmed(!readArmed());paintArm();refreshExecution();};
  panel.append(armButton,readiness);paintArm();
  fields?.margin?.addEventListener?.('input',refreshReadiness);
  const signalLine=node('p');signalLine.setAttribute('role','status');panel.append(signalLine);
  const historyKey='jamd-signal-log';
  const readLog=()=>{try{const raw=doc.defaultView?.localStorage?.getItem?.(historyKey);const list=raw?JSON.parse(raw):[];return Array.isArray(list)?list.filter(entry=>entry&&typeof entry.symbol==='string'&&['BUY','SELL','WAIT'].includes(entry.action)).slice(-20):[];}catch{return [];}};
  const writeLog=list=>{try{doc.defaultView?.localStorage?.setItem?.(historyKey,JSON.stringify(list.slice(-20)));}catch{}};
  const logBox=node('div');logBox.className='automation-limits';
  const paintLog=()=>{logBox.replaceChildren();const list=readLog();if(!list.length){logBox.append(node('small',t('Sin senales registradas todavia.','No signals recorded yet.')));return;}for(const entry of [...list].reverse().slice(0,6)){const label={BUY:t('COMPRAR','BUY'),SELL:t('VENDER','SELL'),WAIT:t('ESPERAR','WAIT')}[entry.action];logBox.append(node('small',entry.symbol+' · '+label+(Number.isFinite(entry.rsi)?' · RSI '+Number(entry.rsi).toFixed(1):'')+' · '+new Date(entry.at).toLocaleString(language)));}};
  panel.append(node('h3',t('Historial de senales','Signal history')),logBox);paintLog();
  let signalTimer=null,lastSignal=null,loopCache={symbol:null,at:0};
  const readChartTarget=()=>{try{const raw=doc.defaultView?.localStorage?.getItem?.('jamd-last-chart-symbol');const parsed=raw?JSON.parse(raw):null;return parsed&&/^[A-Za-z0-9_-]{1,32}$/.test(String(parsed.symbol||''))?parsed:null;}catch{return null;}};
  const runSignal=async()=>{
   if(!readArmed()){signalLine.textContent=t('Modo aviso desarmado.','Alert mode disarmed.');return;}
   const target=readChartTarget();
   if(target.symbol===loopCache.symbol&&Date.now()-loopCache.at<300000){signalLine.textContent=target.symbol+' · '+t('sin cambios (una hora por vela)','no change (one hour per candle)')+' · '+new Date(loopCache.at).toLocaleTimeString(language);return;}
   if(!target){signalLine.textContent=t('Abre un grafico para evaluar la senal.','Open a chart so a signal can be evaluated.');return;}
   try{
    const url='/api/market-asset?'+new URLSearchParams({symbol:target.symbol,coinId:target.coinId,timeframe:'1h'});
    const response=await doc.defaultView.fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('read');
    loopCache={symbol:target.symbol,at:Date.now()};
    const data=await response.json();
    const signal=computeTradeSignal(Array.isArray(data.candles)?data.candles:[]);
    const label={BUY:t('COMPRAR','BUY'),SELL:t('VENDER','SELL'),WAIT:t('ESPERAR','WAIT')}[signal.action];
    lastSignal={signal,at:Date.now()};
    const log=readLog();const last=log.at(-1);if(!last||last.symbol!==target.symbol||last.action!==signal.action||Math.abs(Number(last.rsi??-1)-Number(signal.rsi??-1))>0.5){writeLog([...log,{symbol:target.symbol,action:signal.action,rsi:signal.rsi,at:lastSignal.at}]);paintLog();}
    signalLine.textContent=target.symbol+' · '+label+(signal.rsi!==null?' · RSI '+signal.rsi.toFixed(1):'')+' · '+new Date(lastSignal.at).toLocaleTimeString(language);
   }catch{signalLine.textContent=target.symbol+' · '+t('senal no disponible ahora','signal unavailable right now')+' · '+new Date().toLocaleTimeString(language);}
  };
  const paintLoop=()=>{clearInterval(signalTimer);signalTimer=null;if(disposed())return;if(readArmed()){void runSignal();signalTimer=setInterval(()=>{if(doc.hidden)return;void runSignal();},60000);signalTimer?.unref?.();}else{runSignal();}};
  const disposed=()=>false;
  const previousArm=armButton.onclick;armButton.onclick=()=>{previousArm?.();paintLoop();};
  paintLoop();
  // Execution is deliberately inert in this build: the switch records intent and
  // lists every reason the engine cannot trade, but nothing can send an order.
  const executionBox=node('div');executionBox.className='automation-limits';
  const executionTitle=node('h3',t('Ejecucion automatica','Automatic execution'));
  const executionList=node('ul');executionList.className='automation-limits';
  const requestKey='jamd-automation-requested';
  const readRequested=()=>{try{return doc.defaultView?.localStorage?.getItem?.(requestKey)==='1';}catch{return false;}};
  const writeRequested=value=>{try{doc.defaultView?.localStorage?.setItem?.(requestKey,value?'1':'0');}catch{}};
  const executionSwitch=node('button');executionSwitch.type='button';executionSwitch.disabled=true;executionSwitch.setAttribute('aria-disabled','true');
  const executionNote=node('p');
  const refreshExecution=()=>{
   const reasons=[];
   let available=null;
   try{const state=currentWalletTradingState(doc);available=Number(state?.availableUsdcUnits??state?.snapshot?.availableUsdcUnits??NaN);}catch{}
   const usdc=Number.isFinite(available)?available/1e6:null;
   const margin=Number(fields?.margin?.value||0);
   const needed=Math.max(10,margin||10);
   if(usdc===null)reasons.push(t('sin lectura de saldo de la billetera seleccionada','no balance reading for the selected wallet'));
   else if(usdc<needed)reasons.push(t('faltan ','missing ')+(needed-usdc).toLocaleString(language,{maximumFractionDigits:2})+' USDC '+t('para el minimo del venue','for the venue minimum'));
   if(!readArmed())reasons.push(t('el modo aviso esta desarmado','alert mode is disarmed'));
   if(!controlsClient)reasons.push(t('el motor de ejecucion no esta conectado en esta compilacion','the execution engine is not connected in this build'));
   executionList.replaceChildren();for(const reason of reasons.length?reasons:[t('todo listo para conectar el motor','everything ready to connect the engine')]){executionList.append(node('li',reason));}
   executionSwitch.textContent=readRequested()?t('Solicitud registrada - no ejecuta','Request recorded - does not execute'):t('Solicitar activacion','Request activation');
   executionSwitch.disabled=false;
   executionNote.textContent=reasons.length?t('La ejecucion seguira bloqueada hasta resolver los motivos anteriores. Nada de esto envia ordenes.','Execution stays blocked until the reasons above are resolved. None of this sends orders.'):t('Nada de esto envia ordenes: la conexion del motor se activa en el servidor con autorizacion explicita.','None of this sends orders: the engine is connected on the server with explicit authorisation.');
  };
  executionSwitch.onclick=()=>{writeRequested(!readRequested());refreshExecution();};
  executionBox.append(executionTitle,executionList,executionSwitch,executionNote);panel.append(executionBox);refreshExecution();
  fields?.margin?.addEventListener?.('input',refreshExecution);
  const unavailable=[...controlsClient?[]:[t('Activar — motor no conectado','Activate — engine not connected'),t('Pausar nuevas entradas — motor no conectado','Pause new entries — engine not connected')],t('Cerrar posiciones — confirmación independiente pendiente','Close positions — separate confirmation required')];
  for(const label of unavailable){const b=node('button',label);b.type='button';b.disabled=true;panel.append(b);}
  panel.append(node('p',t('Pausar entradas no cierra posiciones. Cerrar posiciones requerirá una confirmación independiente. Iniciar sesión o guardar este borrador nunca activa el motor.','Pausing entries does not close positions. Closing positions will require a separate confirmation. Signing in or saving this draft never starts the engine.')));
  if(controlsClient)setupPerpsControlPanel({panel,fields,client:controlsClient,validateSettings:validatePerpsAutomationForm,language,doc,onFundingStatus:updateFunding});
  panel.append(node('h3',t('Señales publicadas en Telegram','Signals published on Telegram')));
  const feedStatus=node('p',t('Consulta las señales abiertas publicadas durante las últimas 24 horas. Una señal no garantiza ganancias.','View open signals published in the past 24 hours. Signals do not guarantee profit.'));feedStatus.setAttribute('role','status');
  const refresh=node('button',t('Cargar señales del bot','Load bot signals'));refresh.type='button';
  const cards=node('div');cards.className='terminal-quotes';
  const review=node('section');review.className='card';review.hidden=true;review.setAttribute('aria-live','polite');
  refresh.onclick=async()=>{
    refresh.disabled=true;cards.replaceChildren();review.hidden=true;
    feedStatus.textContent=t('Consultando señales…','Loading signals…');
    try{
      const device=storage?.getItem('jamdV2DeviceId')||'';if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))throw Error('unauthorized');
      const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
      const response=await fetch(base+'/api/pro',{method:'POST',headers:{'Content-Type':'application/json','x-jamddmaj-device':device},body:JSON.stringify({action:'status'}),cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error();const data=await response.json();if(data.authorized!==true||!Array.isArray(data.open))throw Error();
      const signals=telegramSignalCards(data.open);
      feedStatus.textContent=signals.length?t('Señales abiertas. Comprueba el precio actual antes de operar.','Open signals. Check the current price before trading.'):t('No hay señales abiertas publicadas en las últimas 24 horas.','No open published signals in the past 24 hours.');
      for(const s of signals){
        const card=node('article');card.className='card';card.append(node('h3',s.pair+' · '+s.side),node('p',t('Entrada publicada: ','Published entry: ')+s.entry),node('small',new Date(s.publishedAt).toLocaleString()));
        const enter=node('button',t('Preparar entrada manual','Prepare manual entry'));enter.type='button';
        enter.onclick=()=>{
          review.replaceChildren(node('h3',s.pair+' · '+s.side),node('p',t('Entrada de referencia: ','Reference entry: ')+s.entry),node('p','SL: '+(s.stop??'—')+' · TP: '+(s.take??'—')),
            node('p',t('Margen configurado: ','Configured margin: ')+(fields.margin.value||'—')+' USDC · '+(fields.leverage.value||'—')+'×'),
            node('p',t('No se envió ninguna orden. La ejecución manual en Jupiter y la aprobación de tu billetera todavía no están conectadas; esta selección no utiliza Bitget.','No order sent. Manual Jupiter execution and wallet approval are not connected yet; this selection does not use Bitget.')));
          review.hidden=false;review.scrollIntoView?.({behavior:'smooth',block:'nearest'});
        };
        card.append(enter);cards.append(card);
      }
    }catch{feedStatus.textContent=t('No se pudieron consultar las señales o este dispositivo no está autorizado. No se muestran trades inventados.','Signals unavailable or this device is unauthorized. No invented trades are shown.');}
    finally{refresh.disabled=false;}
  };
  panel.append(refresh,feedStatus,cards,review);
  parent.append(panel);
}
