import {registerPlugin} from '@capacitor/core';
export function setupPushControls({host,readPreferences,doc=document,win=window,language='en'}={}){
 const es=language==='es',t=(a,b)=>es?a:b,node=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text||'';return n;};
 const section=node('section');section.className='card';section.id='closed-app-push';
 const status=node('p'),enable=node('button',t('Activar / guardar notificaciones push','Enable / save push notifications')),disable=node('button',t('Desactivar en este dispositivo','Disable on this device')),test=node('button',t('Enviar aviso de prueba','Send test notice'));
 status.setAttribute('role','status');for(const b of[enable,disable,test])b.type='button';
 section.append(node('h3',t('Notificaciones con la app cerrada','Closed-app notifications')),node('p',t('Activa el permiso y guarda las alertas de este dispositivo. Revisión aproximada cada minuto; puede haber retrasos. Forzar la detención de Android o bloquear notificaciones impide recibirlas. No activa trading.','Allow notifications and save alerts for this device. Checks approximately every minute; delivery can be delayed. Android force-stop or blocked notifications prevent delivery. Does not enable trading.')),enable,disable,test,status);host?.append(section);
 const root=win.Capacitor?.isNativePlatform?.()||win.location?.hostname==='localhost'?'https://www.jamddmaj.com':'';
 let active=false,disposed=false,busy=false,transport=null;
 let deviceId;try{deviceId=win.localStorage.getItem('jamd.pushDevice.v1');if(!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId||'')){deviceId=win.crypto.randomUUID();win.localStorage.setItem('jamd.pushDevice.v1',deviceId);}}catch{deviceId='';}
 const token=()=>{try{return win.JamdTrial?.getToken?.()||win.sessionStorage.getItem('jamdWebTrialSession')||'';}catch{return '';}};
 const native=win.Capacitor?.isNativePlatform?.()&&win.Capacitor?.getPlatform?.()==='android'?registerPlugin('MarketPush'):null;
 async function api(body){
  const session=token();if(!/^[a-f0-9]{64}$/.test(session))throw Error('PUSH_LOGIN');if(!deviceId)throw Error('PUSH_STORAGE');
  const response=await win.fetch(root+'/api/push-subscriptions'+(body?'':'?deviceId='+encodeURIComponent(deviceId)),{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+session,'Content-Type':'application/json','x-jamddmaj-device':win.localStorage.getItem('jamdV2DeviceId')||''},...body?{body:JSON.stringify({...body,deviceId})}:{},signal:AbortSignal.timeout(20000)});
  if(session!==token())throw Error('PUSH_SESSION_CHANGED');const result=await response.json();if(!response.ok)throw Error(/^PUSH_[A-Z_]+$/.test(result.code||'')?result.code:'PUSH_UNAVAILABLE');return result;
 }
 function errorMessage(error){const messages={PUSH_LOGIN:t('Inicia sesión con Google y vuelve a intentarlo.','Sign in with Google and try again.'),PUSH_NOT_READY:t('El servicio push todavía no está disponible.','Push service is not available yet.'),PUSH_SIGNALS_ACCESS:t('No se pudo autorizar el acceso a señales. Desmarca señales para guardar solo alertas de precio.','Signal access could not be authorized. Uncheck signals to save price alerts only.'),PUSH_PERMISSION_DENIED:t('Permiso de notificaciones denegado. Revísalo en los ajustes del dispositivo.','Notification permission denied. Check device settings.'),PUSH_RATE_LIMIT:t('Espera un minuto antes de volver a intentarlo.','Wait one minute before trying again.')};return messages[error.message]||t('No se pudo completar la configuración. No se confirma la entrega.','Setup could not be completed. Delivery is not confirmed.');}
 function controls(){for(const b of[enable,disable,test])b.disabled=busy;test.disabled=busy||!active;}
 async function action(task){if(busy||disposed)return;busy=true;controls();try{await task();}catch(error){status.textContent=errorMessage(error);}finally{busy=false;controls();}}
 enable.onclick=()=>action(async()=>{
  const ready=await api();if(!ready.configured)throw Error('PUSH_NOT_READY');
  if(!transport){if(native){const result=await native.register();transport={transport:'android-token',target:result.token};}else{const {registerWebPush}=await import('./firebase-push-web.js');const result=await registerWebPush({win});transport={transport:result.transport,target:result.installationId,dispose:result.dispose,unregister:result.unregister};}}
  await api({action:'save',transport:transport.transport,target:transport.target,preferences:readPreferences()});
  if(native)await native.setEnabled({enabled:true});active=true;
  status.textContent=t('Preferencias guardadas en el servidor para este dispositivo. Envía una prueba para comprobar la recepción. Se renuevan al guardar; caducan tras 30 días sin renovar.','Preferences saved on the server for this device. Send a test to check receipt. Save to renew; enrollment expires after 30 days without renewal.');
 });
 disable.onclick=()=>action(async()=>{
  // Stop local reception even if the server cannot currently be reached.
  active=false;if(native)await native.unregister();else if(transport?.unregister)await transport.unregister();else{const {disableWebPush}=await import('./firebase-push-web.js');await disableWebPush();}
  transport=null;await api({action:'disable'});status.textContent=t('Notificaciones push desactivadas en este dispositivo.','Push notifications disabled on this device.');
 });
 test.onclick=()=>action(async()=>{const r=await api({action:'test'});status.textContent=r.scheduled?t('Prueba programada. Cierra la app ahora; debería llegar durante la próxima revisión del servidor (aproximadamente un minuto). La recepción aún debe comprobarse.','Test scheduled. Close the app now; it should arrive during the next server check (approximately one minute). Receipt still needs verification.'):t('No se pudo programar la prueba.','Could not schedule test.');});
 controls();status.textContent=t('Desactivadas hasta completar la configuración.','Off until setup is completed.');
 // Read-only restore, never requests permission or creates a registration on load.
 if(token())void api().then(r=>{if(disposed)return;active=r.enabled===true;controls();status.textContent=active?t('Registro del servidor activo. Guarda para sincronizar cambios o renovar.','Server enrollment active. Save to synchronize changes or renew.'):t('Push desactivado. Actívalo para guardar tus preferencias.','Push is off. Enable to save your preferences.');}).catch(()=>{});
 return {isActive:()=>active,changed(){if(active)status.textContent=t('Cambios locales pendientes: pulsa Activar / guardar para sincronizarlos.','Local changes pending: press Enable / save to synchronize them.');},dispose(){disposed=true;transport?.dispose?.();section.remove();}};
}
