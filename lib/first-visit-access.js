// First-visit onboarding only, not an API authorization or a wallet connection.
export const FIRST_VISIT_KEY='jamd.firstVisitAccess.v1';
export async function firstVisitSessionStatus(win){
 let token;try{token=typeof win.JamdTrial?.getToken==='function'?win.JamdTrial.getToken():win.sessionStorage?.getItem('jamdWebTrialSession');}catch{return false;}
 if(!/^[a-f0-9]{64}$/.test(token||''))return false;
 try{const base=win.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'',r=await win.fetch(base+'/api/perps-identity',{headers:{Authorization:'Bearer '+token},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok||r.redirected||!r.headers.get('content-type')?.includes('application/json'))return false;const text=await r.text();if(text.length>4096)return false;const v=JSON.parse(text),now=Date.now();
  const current=typeof win.JamdTrial?.getToken==='function'?win.JamdTrial.getToken():win.sessionStorage?.getItem('jamdWebTrialSession');
  return current===token&&v?.ok===true&&/^[a-f0-9]{64}$/.test(v.accountHash||'')&&Number.isSafeInteger(v.verifiedAt)&&v.verifiedAt>=now-10000&&v.verifiedAt<=now+2000;
 }catch{return false;}
}
export function setupFirstVisitAccess(language,doc=document,win=window,{verify=()=>firstVisitSessionStatus(win)}={}){
 const dialog=doc.createElement('dialog');if(typeof dialog.showModal!=='function')return {ready:Promise.resolve(),dispose(){}};
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 dialog.id='first-visit-access';dialog.setAttribute('aria-label',t('Bienvenido a JamdDmaj','Welcome to JamdDmaj'));dialog.style.cssText='background:#101a2a;color:#e5edf8;border:1px solid #354a66;border-radius:20px;padding:28px;width:min(500px,92vw);max-height:90dvh';
 const login=node('button',t('Iniciar sesión con Google','Sign in with Google')),check=node('button',t('Ya inicié sesión · comprobar','Already signed in · check')),status=node('p');login.type=check.type='button';status.setAttribute('role','status');
 dialog.append(node('h2',t('Bienvenido a JamdDmaj','Welcome to JamdDmaj')),node('p',t('Antes de comenzar, inicia sesión para identificar tu cuenta y no confundir tus billeteras. Después conecta tu wallet en Activos.','Before getting started, sign in to identify your account and avoid mixing up wallets. Then connect your wallet in Assets.')),node('p',t('Google no importa claves ni conecta Phantom. La billetera del bot se prepara por separado y nunca se activa al iniciar sesión.','Google does not import keys or connect Phantom. The bot wallet is prepared separately and never activates on sign-in.')),login,check,status);doc.body.append(dialog);
 let disposed=false,busy=false;
 function acknowledged(){try{return win.localStorage?.getItem(FIRST_VISIT_KEY)==='true';}catch{return false;}}
 async function validate(){if(busy||disposed)return false;busy=true;check.disabled=true;try{if(await verify()){if(disposed)return false;try{win.localStorage?.setItem(FIRST_VISIT_KEY,'true');}catch{}dialog.close();return true;}status.textContent=t('Todavía no hay una sesión verificada en esta pestaña. Completa el acceso con Google y vuelve a comprobar.','This tab does not have a verified session yet. Complete Google sign-in and check again.');return false;}finally{busy=false;check.disabled=false;}}
 function openGoogle(){
  if(doc.getElementById('googleSignInBtn')&&doc.documentElement.dataset.settingsReady!=='true'){win.addEventListener('jamd-settings-ready',openGoogle,{once:true});return;}
  if(doc.getElementById('googleSignInBtn')){dialog.close();doc.documentElement.dataset.accountOnboarding='true';doc.getElementById('settingsBtn')?.click();doc.querySelector('[data-settings-panel="account"]')?.click();const button=doc.getElementById('googleSignInBtn');button.scrollIntoView?.({block:'center'});button.focus?.();}
  else win.location.assign('./index.html?signin=google#lang='+encodeURIComponent(language));
 }
 login.onclick=openGoogle;check.onclick=validate;dialog.addEventListener('cancel',e=>e.preventDefault());
 const focus=()=>{if(!acknowledged())void validate();};win.addEventListener?.('focus',focus);
 const ready=(async()=>{if(acknowledged())return;if(await validate()||disposed)return;dialog.showModal();})();
 if(new URLSearchParams(win.location?.search||'').get('signin')==='google')ready.then(()=>{if(!disposed)openGoogle();});
 return {ready,dispose(){disposed=true;win.removeEventListener?.('focus',focus);win.removeEventListener?.('jamd-settings-ready',openGoogle);dialog.close();dialog.remove();}};
}
