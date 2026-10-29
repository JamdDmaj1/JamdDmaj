// First-visit onboarding only, not an API authorization or a wallet connection.
export const FIRST_VISIT_KEY='jamd.firstVisitAccess.v1';
export async function firstVisitSessionStatus(win){
 if(win.JamdTrial?.ready)await win.JamdTrial.ready;
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
 dialog.id='first-visit-access';dialog.setAttribute('aria-label',t('Bienvenido a JamdDmaj','Welcome to JamdDmaj'));dialog.className='jamd-welcome';
 const style=node('style');style.textContent=`
 #first-visit-access.jamd-welcome{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;overflow:auto;border:1px solid #ffffff18;border-radius:28px;background:#10111c;color:#f4f3ff;font:400 15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 32px 100px #0009,0 0 80px #8751ee12;color-scheme:dark;isolation:isolate}
 #first-visit-access::backdrop{background:#05060dcc;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
 #first-visit-access .jw-content{padding:32px;background:radial-gradient(ellipse at 95% 0%,#7951da22,transparent 55%)}
 #first-visit-access .jw-brand{display:flex;align-items:center;gap:11px;margin-bottom:28px}
 #first-visit-access .jw-mark{display:grid;place-items:center;width:42px;height:42px;flex:none;border:1px solid #c7a8ff60;border-radius:14px;background:linear-gradient(140deg,#ab73ff,#703aeb 60%,#395ac7);font-size:16px;font-weight:800;letter-spacing:-1px;box-shadow:0 5px 22px #8b51ed30}
 #first-visit-access .jw-brand-name{font-weight:750;font-size:16px;letter-spacing:-.4px}
 #first-visit-access .jw-eyebrow{margin:0;color:#aaa0c5;font-size:10px;font-weight:650;letter-spacing:1.9px;text-transform:uppercase}
 #first-visit-access h2{margin:0 0 12px;font-size:clamp(27px,5vw,34px);line-height:1.15;font-weight:750;letter-spacing:-1.1px;max-width:420px;color:#f6f4ff}
 #first-visit-access .jw-intro{margin:0 0 24px;color:#aba9bf;font-size:14px;line-height:1.65;max-width:440px}
 #first-visit-access .jw-steps{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
 #first-visit-access .jw-step{padding:16px;border:1px solid #ffffff0d;border-radius:16px;background:#ffffff03}
 #first-visit-access .jw-step-top{display:flex;gap:9px;align-items:center;margin-bottom:7px}
 #first-visit-access .jw-number{display:grid;place-items:center;width:22px;height:22px;flex:none;border-radius:7px;font-size:11px;font-weight:750;background:#a980ff1c;color:#c9aeff}
 #first-visit-access .jw-step h3{margin:0;font-size:13px;font-weight:650;color:#e4dff4}
 #first-visit-access .jw-step p{margin:0;color:#9390a8;font-size:12px;line-height:1.6}
 #first-visit-access .jw-actions{display:grid;gap:10px}
 #first-visit-access button{appearance:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:11px;width:100%;min-height:50px;margin:0;padding:12px 18px;border-radius:13px;font:650 14px/1.4 system-ui,sans-serif;cursor:pointer;transition:background .18s ease,transform .18s ease,box-shadow .18s ease;color:#f7f5ff}
 #first-visit-access button.jw-login{background:linear-gradient(105deg,#9560ee,#7840e7);border:1px solid #bc92ff50;box-shadow:0 6px 22px #7840e72b}
 #first-visit-access button.jw-login:hover{background:linear-gradient(105deg,#a270f5,#8750ee);box-shadow:0 8px 25px #7840e745;transform:translateY(-1px)}
 #first-visit-access .jw-google{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:#fff;color:#4285f4;font:bold 18px/1 Arial,sans-serif}
 #first-visit-access button.jw-check{background:transparent;border:1px solid #ffffff12;color:#b9b4ce;min-height:44px;font-size:12px;font-weight:500}
 #first-visit-access button.jw-check:hover{background:#ffffff06;border-color:#ffffff26;color:#ede7fb}
 #first-visit-access button:focus-visible{outline:3px solid #cbb2ff;outline-offset:3px}
 #first-visit-access button:disabled{opacity:.5;cursor:wait;transform:none}
 #first-visit-access .jw-status{margin:14px 0 0;color:#aaa3bd;text-align:center;font-size:11px;line-height:1.65;min-height:18px}
 #first-visit-access .jw-trust{display:flex;align-items:flex-start;gap:10px;padding:18px 32px;border-top:1px solid #ffffff0b;background:#090b133d;color:#85839a;font-size:11px;line-height:1.65}
 #first-visit-access .jw-trust p{margin:0}
 #first-visit-access .jw-shield{flex:none;color:#b59adc;font-size:18px;line-height:1.3}
 #first-visit-access[open]{animation:jw-enter .24s ease-out}
 @keyframes jw-enter{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
 @media(max-width:420px){#first-visit-access .jw-content{padding:24px}#first-visit-access .jw-brand{margin-bottom:24px}#first-visit-access .jw-steps{gap:8px}#first-visit-access .jw-step{padding:12px}#first-visit-access .jw-trust{padding:16px 24px}#first-visit-access .jw-step-top{gap:6px}#first-visit-access .jw-step h3{font-size:12px}}
 @media(prefers-reduced-motion:reduce){#first-visit-access[open]{animation:none}#first-visit-access button{transition:none}}
 `;
 const login=node('button',t('Iniciar sesión con Google','Sign in with Google')),check=node('button',t('Ya inicié sesión · comprobar','Already signed in · check')),status=node('p');login.type=check.type='button';status.setAttribute('role','status');
 const content=node('div');content.className='jw-content';const brand=node('div');brand.className='jw-brand';const mark=node('span','JD');mark.className='jw-mark';mark.setAttribute('aria-hidden','true');const brandText=node('div'),brandName=node('div','JamdDmaj');brandName.className='jw-brand-name';const eyebrow=node('p',t('TU ESPACIO. CONECTADO.','YOUR SPACE. CONNECTED.'));eyebrow.className='jw-eyebrow';brandText.append(brandName,eyebrow);brand.append(mark,brandText);
 const intro=node('p',t('Tu cuenta, tus mercados y tus billeteras. Comienza con un acceso seguro.','Your account, your markets, your wallets. Start with a secure sign-in.'));intro.className='jw-intro';
 const steps=node('div');steps.className='jw-steps';for(const [number,title,description]of [['01',t('Accede a tu cuenta','Sign in'),t('Identifica tu perfil con Google.','Identify your profile with Google.')],['02',t('Conecta tu wallet','Connect your wallet'),t('Elige tu billetera en Activos.','Choose your wallet in Assets.')]]){const step=node('div');step.className='jw-step';const top=node('div');top.className='jw-step-top';const n=node('span',number);n.className='jw-number';top.append(n,node('h3',title));step.append(top,node('p',description));steps.append(step);}
 const google=node('span','G');google.className='jw-google';google.setAttribute('aria-hidden','true');login.textContent='';login.className='jw-login';login.append(google,node('span',t('Iniciar sesión con Google','Sign in with Google')));check.className='jw-check';status.className='jw-status';
 const actions=node('div');actions.className='jw-actions';actions.append(login,check);content.append(brand,node('h2',t('Bienvenido a JamdDmaj','Welcome to JamdDmaj')),intro,steps,actions,status);
 const trust=node('div');trust.className='jw-trust';const shield=node('span','◇');shield.className='jw-shield';shield.setAttribute('aria-hidden','true');trust.append(shield,node('p',t('Tus claves siguen en tu wallet. Google no conecta Phantom ni importa claves. La billetera del bot es independiente y no se activa al iniciar sesión.','Your keys stay in your wallet. Google does not connect Phantom or import keys. The bot wallet is separate and never activates on sign-in.')));dialog.append(style,content,trust);doc.body.append(dialog);
 let disposed=false,busy=false;
 function acknowledged(){try{return win.localStorage?.getItem(FIRST_VISIT_KEY)==='true';}catch{return false;}}
 async function validate(){if(busy||disposed)return false;busy=true;check.disabled=true;status.textContent=t('Comprobando tu acceso…','Checking your access…');try{if(await verify()){if(disposed)return false;try{win.localStorage?.setItem(FIRST_VISIT_KEY,'true');}catch{}dialog.close();return true;}status.textContent=t('No se pudo confirmar el acceso. Si cerraste la app, puede haberse perdido o vencido la sesión. Usa «Iniciar sesión con Google» para recuperar el acceso; no cambia tu billetera. Si no tienes conexión, inténtalo de nuevo cuando vuelva.','Access could not be confirmed. Closing the app may have lost the session, or it may have expired. Use “Sign in with Google” to restore access; this does not change your wallet. If you are offline, try again when connected.');login.focus?.();return false;}catch{status.textContent=t('No se pudo comprobar el acceso. Revisa tu conexión e inténtalo de nuevo.','Could not check access. Check your connection and try again.');return false;}finally{busy=false;check.disabled=false;}}
 function openGoogle(){
  if(doc.getElementById('googleSignInBtn')&&doc.documentElement.dataset.settingsReady!=='true'){win.addEventListener('jamd-settings-ready',openGoogle,{once:true});return;}
  if(doc.getElementById('googleSignInBtn')){dialog.close();doc.documentElement.dataset.accountOnboarding='true';doc.getElementById('settingsBtn')?.click();doc.querySelector('[data-settings-panel="account"]')?.click();const button=doc.getElementById('googleSignInBtn');button.scrollIntoView?.({block:'center'});button.focus?.();}
  else win.location.assign('./index.html?signin=google#lang='+encodeURIComponent(language));
 }
 login.onclick=openGoogle;check.onclick=validate;dialog.addEventListener('cancel',e=>e.preventDefault());
 const focus=()=>{if(!acknowledged())void validate();};win.addEventListener?.('focus',focus);
 win.addEventListener?.('jamd-account-session-ready',focus);
 const ready=(async()=>{if(acknowledged())return;if(await validate()||disposed)return;dialog.showModal();})();
 if(new URLSearchParams(win.location?.search||'').get('signin')==='google')ready.then(()=>{if(!disposed)openGoogle();});
 return {ready,dispose(){disposed=true;win.removeEventListener?.('focus',focus);win.removeEventListener?.('jamd-account-session-ready',focus);win.removeEventListener?.('jamd-settings-ready',openGoogle);dialog.close();dialog.remove();}};
}
