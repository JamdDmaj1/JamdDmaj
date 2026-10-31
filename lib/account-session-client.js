import {registerPlugin} from '@capacitor/core';
export function setupAccountSession({win=window,readToken=()=>win.sessionStorage.getItem('jamdWebTrialSession')||'',writeToken=token=>win.sessionStorage.setItem('jamdWebTrialSession',token),nativePlugin,fetchImpl=win.fetch?.bind(win)}={}){
 if(win.JamdAccountSession)return win.JamdAccountSession;
 const native=win.Capacitor?.isNativePlatform?.()===true;
 if(nativePlugin===undefined)nativePlugin=native&&win.Capacitor?.getPlatform?.()==='android'?registerPlugin('AccountSession'):null;
 let epoch=0,pending=null;
 const valid=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
 const state={status:'checking',ready:null,restore,save,clear};win.JamdAccountSession=state;
 async function browser(action,token){
  if(!['https://www.jamddmaj.com','https://jamddmaj.com'].includes(win.location?.origin))throw Error('session-unavailable');
  const response=await fetchImpl('/api/account-session',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',...token?{Authorization:'Bearer '+token}:{}},body:JSON.stringify({action}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(Error('session-unavailable'),{status:response.status});
  const text=await response.text();if(text.length>1024)throw Error('session-unavailable');const value=JSON.parse(text);if(value.ok!==true)throw Error('session-unavailable');return value;
 }
 async function restore(){
  if(pending)return pending;
  const ticket=epoch;
  pending=(async()=>{
   try{
    if(valid(readToken())){state.status='present';return;}
    const value=nativePlugin?await nativePlugin.restore():!native?await browser('resume'):null;
    if(ticket!==epoch||readToken())return;
    if(valid(value?.token)){writeToken(value.token);state.status='restored';}else state.status='missing';
   }catch(error){if(ticket===epoch)state.status=[401,403].includes(error.status)?'missing':'unavailable';}
  })();
  try{await pending;}finally{pending=null;}
 }
 async function save(token){
  if(!valid(token)||readToken()!==token)throw Error('session-changed');epoch++;
  if(nativePlugin)await nativePlugin.save({token});else if(!native)await browser('remember',token);
  state.status='present';
 }
 async function clear(){epoch++;if(nativePlugin)await nativePlugin.clear();else if(!native)await browser('forget',readToken());writeToken('');state.status='missing';}
 state.ready=restore();return state;
}
