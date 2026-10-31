import {registerPlugin} from '@capacitor/core';
export function pushStateLabel({enabled=false,expiresAt,permission,known=true,now=Date.now()}={}){
 if(!known)return 'unknown';
 if(permission==='denied')return 'blocked';
 if(enabled&&Number.isFinite(expiresAt)&&expiresAt>now)return 'active';
 return expiresAt&&expiresAt<=now?'expired':'off';
}
export function setupPushControls({host,readPreferences,doc=document,win=window,language='en'}={}){
 const es=language==='es',t=(a,b)=>es?a:b,node=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text||'';return n;};
 const section=node('section');section.className='card';section.id='closed-app-push';
 const status=node('p'),badge=node('strong'),summary=node('div'),refresh=node('button',t('Comprobar estado','Check status')),enable=node('button',t('Activar notificaciones','Enable notifications')),disable=node('button',t('Desactivar en este dispositivo','Disable on this device')),test=node('button',t('Enviar aviso de prueba','Send test notice'));
 badge.setAttribute('role','status');badge.style.cssText='display:inline-block;padding:8px 14px;border-radius:999px;background:#334155;margin:0 0 12px';summary.style.cssText='padding:12px;border:1px solid #334155;border-radius:12px;margin-bottom:12px';
 status.setAttribute('role','status');for(const b of[enable,disable,test,refresh])b.type='button';
 section.append(node('h3',t('Notificaciones con la app cerrada','Closed-app notifications')),node('p',t('Activa el permiso y guarda las alertas de este dispositivo. Revisión aproximada cada minuto; puede haber retrasos. Forzar la detención de Android o bloquear notificaciones impide recibirlas. No activa trading.','Allow notifications and save alerts for this device. Checks approximately every minute; delivery can be delayed. Android force-stop or blocked notifications prevent delivery. Does not enable trading.')),enable,disable,test,status);host?.append(section);
 const root=win.Capacitor?.isNativePlatform?.()||win.location?.hostname==='localhost'?'https://www.jamddmaj.com':'';
 section.insertBefore(badge,enable);section.insertBefore(summary,enable);section.insertBefore(refresh,enable);
 section.append(node('p',t('Se guarda por dispositivo: no debes activarlo cada vez que entras. Solo guarda si cambias las opciones o para renovar antes del vencimiento de 30 días. La entrega de una señal real se comprueba al recibirla.','Saved per device: you do not need to enable it on every visit. Save only when options change or to renew before the 30-day expiry. Receipt of a real signal must still be verified.')));
 let active=false,disposed=false,busy=false,transport=null,phase='PUSH_SETUP',saved=null,known=false,dirty=false,edit=0;
 function renderState(){
  const state=pushStateLabel({enabled:saved?.enabled,expiresAt:saved?.expiresAt,permission:native?undefined:win.Notification?.permission,known});
  active=state==='active';const labels={active:t('Activadas en este dispositivo','Enabled on this device'),off:t('Desactivadas','Disabled'),expired:t('Registro vencido · renovar','Enrollment expired · renew'),blocked:t('Bloqueadas por el dispositivo','Blocked by device settings'),unknown:t('Estado sin comprobar','Status not checked')};
  badge.textContent=labels[state];badge.style.background=active?'#14594c':'#334155';summary.replaceChildren();
  if(known){const p=saved?.preferences;summary.append(node('p',t('Guardado en el servidor: ','Saved on server: ')+(p?t(`Señales de Telegram: ${p.signals?'sí':'no'} · Alertas de precio: ${p.alerts?.length||0}`,`Telegram signals: ${p.signals?'on':'off'} · Price alerts: ${p.alerts?.length||0}`):t('Sin preferencias guardadas','No saved preferences'))));
   for(const a of p?.alerts||[])summary.append(node('p',`${a.coin} ${a.direction==='above'?'≥':'≤'} ${a.target} USD`));
   for(const [key,label]of[['updatedAt',t('Último guardado','Last saved')],['expiresAt',t('Vence','Expires')]])if(Number.isFinite(saved?.[key]))summary.append(node('p',label+': '+new Date(saved[key]).toLocaleString(language)));
  }
  if(dirty)summary.append(node('p',t('Cambios sin guardar: todavía se usan las opciones anteriores del servidor.','Unsaved changes: the server is still using the previous options.')));
  enable.textContent=active?(dirty?t('Guardar cambios','Save changes'):t('Renovar registro · 30 días','Renew enrollment · 30 days')):t('Activar / guardar notificaciones','Enable / save notifications');
  controls();
 }
 let deviceId;try{deviceId=win.localStorage.getItem('jamd.pushDevice.v1');if(!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId||'')){deviceId=win.crypto.randomUUID();win.localStorage.setItem('jamd.pushDevice.v1',deviceId);}}catch{deviceId='';}
 const token=()=>{try{return win.JamdTrial?.getToken?.()||win.sessionStorage.getItem('jamdWebTrialSession')||'';}catch{return '';}};
 const native=win.Capacitor?.isNativePlatform?.()&&win.Capacitor?.getPlatform?.()==='android'?registerPlugin('MarketPush'):null;
 async function api(body){
  const session=token();if(!/^[a-f0-9]{64}$/.test(session))throw Error('PUSH_LOGIN');if(!deviceId)throw Error('PUSH_STORAGE');
  const response=await win.fetch(root+'/api/push-subscriptions'+(body?'':'?deviceId='+encodeURIComponent(deviceId)),{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+session,'Content-Type':'application/json','x-jamddmaj-device':win.localStorage.getItem('jamdV2DeviceId')||''},...body?{body:JSON.stringify({...body,deviceId})}:{},signal:AbortSignal.timeout(20000)});
  if(session!==token())throw Error('PUSH_SESSION_CHANGED');const result=await response.json();if(!response.ok)throw Error(/^PUSH_[A-Z_]+$/.test(result.code||'')?result.code:'PUSH_UNAVAILABLE');return result;
 }
 function errorMessage(error){const messages={PUSH_BROWSER_SERVICE:t('El navegador no pudo conectarse a su servicio push. En Brave, revisa «Use Google services for push messaging» en Privacidad y reinicia el navegador si decides habilitarlo. No hace falta desactivar otras protecciones.','The browser could not connect to its push service. In Brave, check “Use Google services for push messaging” in Privacy and restart the browser if you choose to enable it. Other protections do not need to be disabled.'),PUSH_LOGIN:t('Inicia sesión con Google y vuelve a intentarlo.','Sign in with Google and try again.'),PUSH_NOT_READY:t('El servicio push todavía no está disponible.','Push service is not available yet.'),PUSH_SIGNALS_ACCESS:t('No se pudo autorizar el acceso a señales. Desmarca señales para guardar solo alertas de precio.','Signal access could not be authorized. Uncheck signals to save price alerts only.'),PUSH_PERMISSION_DENIED:t('Permiso de notificaciones denegado. Revísalo en los ajustes del dispositivo.','Notification permission denied. Check device settings.'),PUSH_RATE_LIMIT:t('Espera un minuto antes de volver a intentarlo.','Wait one minute before trying again.')};return messages[error.message]||t('No se pudo completar la configuración. No se confirma la entrega.','Setup could not be completed. Delivery is not confirmed.');}
 function controls(){for(const b of[enable,disable,test,refresh])b.disabled=busy;test.disabled=busy||!active;disable.disabled=busy||!saved?.enabled;}
 async function action(task){if(busy||disposed)return;busy=true;controls();try{await task();}catch(error){const safeCode=/^(PUSH_[A-Z_]{1,60}|messaging\/[a-z-]{1,70}|installations\/[a-z-]{1,70})$/.test(error.code||error.message||'')?(error.code||error.message):phase;status.textContent=errorMessage(error)+' · '+safeCode;}finally{busy=false;controls();}}
 enable.onclick=()=>action(async()=>{
  phase='PUSH_SESSION_CHECK';const ready=await api();if(!ready.configured)throw Error('PUSH_NOT_READY');phase='PUSH_DEVICE_REGISTRATION';
  if(!transport){if(native){const result=await native.register();transport={transport:'android-token',target:result.token};}else{const {registerWebPush}=await import('./firebase-push-web.js');const result=await registerWebPush({win});transport={transport:result.transport,target:result.installationId,dispose:result.dispose,unregister:result.unregister};}}
  phase='PUSH_SAVE_PREFERENCES';const revision=edit,preferences=readPreferences(),result=await api({action:'save',transport:transport.transport,target:transport.target,preferences});
  phase='PUSH_DEVICE_PERMISSION';if(native)await native.setEnabled({enabled:true});saved={...result,preferences,updatedAt:Date.now()};known=true;dirty=revision!==edit;renderState();
  status.textContent=t('Preferencias guardadas en el servidor para este dispositivo. Envía una prueba para comprobar la recepción. Se renuevan al guardar; caducan tras 30 días sin renovar.','Preferences saved on the server for this device. Send a test to check receipt. Save to renew; enrollment expires after 30 days without renewal.');
 });
 disable.onclick=()=>action(async()=>{
  // Stop local reception even if the server cannot currently be reached.
  active=false;if(native)await native.unregister();else if(transport?.unregister)await transport.unregister();else{const {disableWebPush}=await import('./firebase-push-web.js');await disableWebPush();}
  transport=null;await api({action:'disable'});saved={enabled:false};known=true;dirty=false;renderState();status.textContent=t('Notificaciones push desactivadas en este dispositivo.','Push notifications disabled on this device.');
 });
 test.onclick=()=>action(async()=>{const r=await api({action:'test'});status.textContent=r.scheduled?t('Prueba programada. Cierra la app ahora; debería llegar durante la próxima revisión del servidor (aproximadamente un minuto). La recepción aún debe comprobarse.','Test scheduled. Close the app now; it should arrive during the next server check (approximately one minute). Receipt still needs verification.'):t('No se pudo programar la prueba.','Could not schedule test.');});
 async function check(){phase='PUSH_STATUS';const r=await api();if(disposed)return;saved=r;known=true;renderState();status.textContent=active?t('Ya están activadas. No necesitas volver a activarlas al entrar.','Already enabled. You do not need to enable them again on each visit.'):t('Consulta el estado y revisa tus opciones antes de guardar.','Check the status and review your options before saving.');}
 refresh.onclick=()=>action(check);renderState();status.textContent=t('Comprobando registro guardado…','Checking saved enrollment…');
 // Read-only restore, never requests permission or creates a registration on load.
 if(token())void action(check);else status.textContent=t('Inicia sesión para comprobar el registro de este dispositivo.','Sign in to check this device enrollment.');
 return {isActive:()=>active&&saved?.expiresAt>Date.now(),changed(){edit++;dirty=true;renderState();},dispose(){disposed=true;transport?.dispose?.();section.remove();}};
}
