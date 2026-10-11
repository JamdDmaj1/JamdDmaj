// Explicit, read-only owner queries. Never confirms or queues an order.
export function setupFinanceActivity(parent,language,doc,request=globalThis.fetch){
 const t=(a,b)=>language==='es'?a:b,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=node('section');panel.className='card finance-activity';
 const heading=node('h2',t('Actividad de Futuros','Futures activity')),tabs=node('div'),out=node('div');tabs.className='terminal-shortcuts';out.setAttribute('role','status');
 let revision=0;
 async function load(action){
  const ticket=++revision;out.replaceChildren(node('p',t('Consultando…','Loading…')));
  try{
   const device=globalThis.localStorage?.getItem('jamdV2DeviceId')||'';if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))throw Error();
   const body={action};if(action==='manualOrderStatus'){body.requestId=globalThis.sessionStorage?.getItem('jamdManualPendingId');if(!body.requestId){out.replaceChildren(node('p',t('No hay una solicitud guardada en esta sesión. Esto no es el historial completo de Bitget.','No request saved in this session. This is not the full Bitget history.')));return;}}
   const base=globalThis.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
   const response=await request(base+'/api/pro',{method:'POST',headers:{'Content-Type':'application/json','x-jamddmaj-device':device},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error();const data=await response.json();if(ticket!==revision)return;out.replaceChildren();
   if(action==='manualReadiness'){
    if(data.readiness?.readOnly!==true||data.readiness?.freshHeartbeat!==true||!Array.isArray(data.positions))throw Error();
    out.append(node('p',t('Instantánea del conector; máximo 8 posiciones, puede estar incompleta.','Connector snapshot; maximum 8 positions, may be incomplete.')));
    for(const p of data.positions.slice(0,8))out.append(node('p',[p.symbol,p.holdSide,p.total].filter(v=>v!==undefined&&v!==null).map(String).join(' · ')));
    if(!data.positions.length)out.append(node('p',t('El conector no reporta posiciones abiertas.','The connector reports no open positions.')));
   }else{
    if(typeof data.status!=='string')throw Error();out.append(node('p',data.status));if(data.order)out.append(node('p',[data.order.pair,data.order.side,data.order.status].filter(Boolean).join(' · ')));
    out.append(node('p',t('Una solicitud en cola no confirma ejecución. Historial completo no disponible aquí.','A queued request does not confirm a fill. Full history is not available here.')));
   }
  }catch{if(ticket===revision)out.replaceChildren(node('p',t('Datos no disponibles o acceso no autorizado. No se asume saldo cero ni ausencia de posiciones.','Data unavailable or access unauthorized. Zero balance or no positions is not assumed.')));}
 }
 for(const[label,action]of [[t('Consultar posiciones','Check positions'),'manualReadiness'],[t('Última solicitud','Latest request'),'manualOrderStatus']]){const b=node('button',label);b.type='button';b.onclick=()=>load(action);tabs.append(b);}
 out.append(node('p',t('Consulta de solo lectura. No abre ni cierra operaciones.','Read-only lookup. Does not open or close trades.')));panel.append(heading,tabs,out);parent.append(panel);
}
