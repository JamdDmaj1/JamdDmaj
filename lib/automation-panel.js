// Configuration drafts only. No exchange connector, signing, or auto-start authority.
const KEY='jamdAutomationDraftV1';
export function validateAutomationDraft(value){
  const capital=Number(value.capital),loss=Number(value.loss),positions=Number(value.positions);
  if(!Number.isFinite(capital)||capital<=0||!Number.isFinite(loss)||loss<=0||loss>capital||!Number.isInteger(positions)||positions<1||positions>10)throw Error('invalid_limits');
  return {capital,loss,positions};
}
export function validateAutomationSettings(value){
  const limits=validateAutomationDraft(value),margin=Number(value.margin),leverage=Number(value.leverage),dailyTrades=Number(value.dailyTrades);
  if(!Number.isFinite(margin)||margin<=0||margin>limits.capital||!Number.isFinite(leverage)||leverage<1.1||leverage>50||Math.round(leverage*10)!==leverage*10||!Number.isInteger(dailyTrades)||dailyTrades<1||dailyTrades>100)throw Error('invalid_sizing');
  const optional=(key,max)=>{if(value[key]===''||value[key]==null)return null;const n=Number(value[key]);if(!Number.isFinite(n)||n<=0||n>=max)throw Error('invalid_exit');return n;};
  const stopLossPercent=optional('stopLossPercent',100),takeProfitPercent=optional('takeProfitPercent',10000);
  const lossAction=value.lossAction||'disable';if(!['disable','reduce-leverage','reduce-margin'].includes(lossAction))throw Error('invalid_action');
  const reductionPercent=Number(value.reductionPercent??50);if(!Number.isFinite(reductionPercent)||reductionPercent<=0||reductionPercent>=100)throw Error('invalid_reduction');
  return {...limits,margin,leverage,dailyTrades,stopLossPercent,takeProfitPercent,lossAction,reductionPercent};
}
export function setupAutomationPanel(parent,language,doc,storage=globalThis.localStorage){
  const t=(a,b)=>language==='es'?a:b;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=node('details');panel.id='jamd-automation';panel.className='card';panel.open=false;
  panel.append(node('summary',t('Automatización · configurar','Automation · configure')));
  panel.append(node('h2',t('Automatización JamdDmaj','JamdDmaj automation')));
  const balance=node('div');balance.className='automation-limit';balance.append(node('small',t('Saldo disponible para automatización · USDC','Available automation balance · USDC')),node('h3','—'),node('p',t('Pendiente de consultar tu billetera y comprobar reservas, posiciones y comisiones. No se reemplaza por cero.','Your wallet, reserves, positions and fees must be checked. An unavailable balance is not replaced by zero.')));panel.append(balance);
  panel.append(node('p',t('Motor nuevo no conectado. No utiliza Bitget. Estos ajustes son un borrador local: no autorizan ni ejecutan operaciones.','New engine not connected. Does not use Bitget. These settings are a local draft: they do not authorize or execute trades.')));
  let draft={};try{const saved=JSON.parse(storage?.getItem(KEY)||'null');draft={...validateAutomationDraft(saved)};try{draft=validateAutomationSettings(saved);}catch{}}catch{}
  const fields={};const limits=node('div');limits.className='automation-limits';panel.append(limits);
  for(const[key,label]of [['capital',t('Capital máximo en USD','Maximum capital in USD')],['loss',t('Límite de pérdida diaria en USD','Daily loss limit in USD')],['positions',t('Máximo de posiciones simultáneas (1–10)','Maximum concurrent positions (1–10)')]]){
    const l=node('label',label),input=node('input');input.id='automation-'+key;input.type='number';input.min=key==='positions'?'1':'0.01';input.step=key==='positions'?'1':'0.01';if(key==='positions')input.max='10';input.value=draft[key]??'';l.htmlFor=input.id;fields[key]=input;const box=node('div');box.className='automation-limit';box.append(l,input);limits.append(box);
  }
  for(const[key,label,min,max,step,fallback]of [
    ['margin',t('Margen por trade · USDC','Margin per trade · USDC'),10,null,.01,''],
    ['leverage',t('Apalancamiento por trade','Leverage per trade'),1.1,50,.1,3],
    ['dailyTrades',t('Máximo de trades diarios','Maximum daily trades'),1,100,1,5],
    ['stopLossPercent',t('Stop loss % · opcional','Stop loss % · optional'),.01,99.99,.01,''],
    ['takeProfitPercent',t('Take profit % · opcional','Take profit % · optional'),.01,9999,.01,''],
    ['reductionPercent',t('Reducción de riesgo %','Risk reduction %'),1,99,1,50]
  ]){const box=node('div');box.className='automation-limit';const labelNode=node('label',label),input=node('input');input.id='automation-'+key;input.type='number';input.min=String(min);if(max!==null)input.max=String(max);input.step=String(step);input.value=draft[key]??fallback;labelNode.htmlFor=input.id;fields[key]=input;box.append(labelNode,input);limits.append(box);}
  panel.append(node('p',t('SL y TP vacíos: usar los precios publicados en la señal de Telegram. Si introduces porcentajes, se calculan sobre el precio de entrada, no sobre el margen ni el P/L apalancado.','Blank SL and TP: use the prices published in the Telegram signal. Percentages apply to entry price, not margin or leveraged P/L.')));
  const actionBox=node('div');actionBox.className='automation-limit';const actionLabel=node('label',t('Al alcanzar la pérdida diaria','When daily loss is reached')),action=node('select');action.id='automation-lossAction';actionLabel.htmlFor=action.id;
  for(const[value,label]of [['disable',t('Desactivar automatización','Disable automation')],['reduce-leverage',t('Pausar y reducir apalancamiento','Pause and reduce leverage')],['reduce-margin',t('Pausar y reducir margen','Pause and reduce margin')]]){const option=node('option',label);option.value=value;action.append(option);}action.value=draft.lossAction||'disable';fields.lossAction=action;actionBox.append(actionLabel,action);panel.append(actionBox);
  panel.append(node('p',t('El límite diario siempre detiene nuevas entradas. Una reducción se aplicaría a operaciones futuras tras reactivar explícitamente; no cambia posiciones abiertas ni permite seguir perdiendo por encima del límite.','The daily limit always stops new entries. A reduction applies to future trades after explicit reactivation; it does not modify open positions or bypass the daily loss limit.')));
  const status=node('p');status.setAttribute('role','status');
  const save=node('button',t('Guardar borrador','Save draft'));save.type='button';save.onclick=()=>{try{const value=validateAutomationSettings(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));if(!storage?.setItem)throw Error();storage.setItem(KEY,JSON.stringify(value));status.textContent=t('Configuración guardada. Automatización desactivada; conexión de ejecución pendiente.','Settings saved. Automation disabled; execution connection pending.');}catch{status.textContent=t('No se guardó. Revisa capital, margen, apalancamiento, límites y almacenamiento.','Not saved. Check capital, margin, leverage, limits and storage.');}};
  panel.append(save,status);
  for(const label of [t('Activar — integración pendiente','Activate — integration pending'),t('Pausar nuevas entradas — motor no conectado','Pause new entries — engine not connected'),t('Cerrar posiciones — integración pendiente','Close positions — integration pending')]){const b=node('button',label);b.type='button';b.disabled=true;panel.append(b);}
  panel.append(node('p',t('Pausar entradas no cierra posiciones. Cerrar posiciones requerirá una confirmación independiente. Iniciar sesión o guardar este borrador nunca activa el motor.','Pausing entries does not close positions. Closing positions will require a separate confirmation. Signing in or saving this draft never starts the engine.')));
  panel.append(node('h3',t('Pares y señales del bot','Bot pairs and signals')),node('p',t('Pendiente de conectar señales verificadas. La prioridad mostrará calidad y antigüedad de la señal; el rendimiento histórico, cuando esté disponible, se mostrará aparte. Ninguna recomendación garantiza ganancias.','Verified signal feed pending. Priority will show signal quality and age; historical performance, when available, will be separate. Recommendations never guarantee profit.')));
  parent.append(panel);
}
