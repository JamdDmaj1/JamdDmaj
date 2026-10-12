// Configuration drafts only. No exchange connector, signing, or auto-start authority.
const KEY='jamdAutomationDraftV1';
export function validateAutomationDraft(value){
  const capital=Number(value.capital),loss=Number(value.loss),positions=Number(value.positions);
  if(!Number.isFinite(capital)||capital<=0||!Number.isFinite(loss)||loss<=0||loss>capital||!Number.isInteger(positions)||positions<1||positions>10)throw Error('invalid_limits');
  return {capital,loss,positions};
}
export function setupAutomationPanel(parent,language,doc,storage=globalThis.localStorage){
  const t=(a,b)=>language==='es'?a:b;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=node('details');panel.id='jamd-automation';panel.className='card';panel.open=false;
  panel.append(node('summary',t('Automatización · configurar','Automation · configure')));
  panel.append(node('h2',t('Automatización JamdDmaj','JamdDmaj automation')));
  panel.append(node('p',t('Motor nuevo no conectado. No utiliza Bitget. Estos ajustes son un borrador local: no autorizan ni ejecutan operaciones.','New engine not connected. Does not use Bitget. These settings are a local draft: they do not authorize or execute trades.')));
  let draft={};try{draft=validateAutomationDraft(JSON.parse(storage?.getItem(KEY)||'null'));}catch{}
  const fields={};
  for(const[key,label]of [['capital',t('Capital máximo en USD','Maximum capital in USD')],['loss',t('Límite de pérdida diaria en USD','Daily loss limit in USD')],['positions',t('Máximo de posiciones simultáneas (1–10)','Maximum concurrent positions (1–10)')]]){
    const l=node('label',label),input=node('input');input.id='automation-'+key;input.type='number';input.min=key==='positions'?'1':'0.01';input.step=key==='positions'?'1':'0.01';if(key==='positions')input.max='10';input.value=draft[key]??'';l.htmlFor=input.id;fields[key]=input;panel.append(l,input);
  }
  const status=node('p');status.setAttribute('role','status');
  const save=node('button',t('Guardar borrador','Save draft'));save.type='button';save.onclick=()=>{try{const value=validateAutomationDraft(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));if(!storage?.setItem)throw Error();storage.setItem(KEY,JSON.stringify(value));status.textContent=t('Borrador guardado. No hay estrategia activa ni permiso para operar.','Draft saved. No active strategy or trading authorization.');}catch{status.textContent=t('No se guardó. Revisa los límites y el almacenamiento del dispositivo.','Not saved. Check limits and device storage.');}};
  panel.append(save,status);
  for(const label of [t('Activar — integración pendiente','Activate — integration pending'),t('Pausar nuevas entradas — motor no conectado','Pause new entries — engine not connected'),t('Cerrar posiciones — integración pendiente','Close positions — integration pending')]){const b=node('button',label);b.type='button';b.disabled=true;panel.append(b);}
  panel.append(node('p',t('Pausar entradas no cierra posiciones. Cerrar posiciones requerirá una confirmación independiente. Iniciar sesión o guardar este borrador nunca activa el motor.','Pausing entries does not close positions. Closing positions will require a separate confirmation. Signing in or saving this draft never starts the engine.')));
  parent.append(panel);
}
