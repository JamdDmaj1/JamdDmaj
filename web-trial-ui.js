import {registerPlugin} from '@capacitor/core';
// Checks the existing session, not a saved profile. Never renews access,
// returns credentials, clears a token, or grants financial authority.
export async function inspectGoogleSession({readToken,fetchImpl=globalThis.fetch,apiRoot='',now=Date.now}={}){
 if(typeof readToken!=='function'||typeof fetchImpl!=='function'||!['','https://www.jamddmaj.com'].includes(apiRoot))return 'unavailable';
 let token;try{token=readToken();}catch{return 'missing';}
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return 'missing';
 let reader;
 try{
  const response=await fetchImpl(apiRoot+'/api/perps-identity',{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(readToken()!==token)return 'changed';
  if(response.status===401)return 'rejected';
  if(!response.ok||response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))return 'unavailable';
  reader=response.body?.getReader();if(!reader)return 'unavailable';let size=0;const parts=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)return 'unavailable';parts.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),at=now();
  if(readToken()!==token)return 'changed';
  return value?.ok===true&&/^[a-f0-9]{64}$/.test(value.accountHash||'')&&Number.isSafeInteger(at)&&Number.isSafeInteger(value.verifiedAt)
   &&value.verifiedAt>=at-10000&&value.verifiedAt<=at+2000?'valid':'unavailable';
 }catch{return 'unavailable';}finally{if(reader)try{await reader.cancel();}catch{}}
}

export const trialCopy = {
 en:["AI trial","Sign in with Google to start.","20 credits for 7 days, once per verified Google account, not per device. One credit per successful managed AI request. No automatic renewal. Own API keys are separate.","Credits remaining","Expires","Trial unavailable, expired or exhausted. Sign in again or check your balance."],
 es:["Prueba de IA","Inicia sesión con Google para empezar.","20 créditos durante 7 días, una vez por cuenta de Google verificada, no por dispositivo. Un crédito por solicitud de IA administrada completada. Sin renovación automática. Tu propia clave API es independiente.","Créditos restantes","Vence","Trial no disponible, vencido o agotado. Inicia sesión otra vez o revisa tu saldo."],
 fr:["Essai IA","Connectez-vous avec Google pour commencer.","20 crédits pendant 7 jours, une fois par compte Google vérifié, pas par appareil. Un crédit par requête IA gérée réussie. Sans renouvellement automatique. Votre clé API reste indépendante.","Crédits restants","Expiration","Essai indisponible, expiré ou épuisé. Reconnectez-vous ou vérifiez votre solde."],
 de:["KI-Testzugang","Zum Start mit Google anmelden.","20 Credits für 7 Tage, einmal pro bestätigtem Google-Konto, nicht pro Gerät. Ein Credit je erfolgreicher verwalteter KI-Anfrage. Keine automatische Verlängerung. Eigene API-Schlüssel sind unabhängig.","Verbleibende Credits","Ablauf","Testzugang nicht verfügbar, abgelaufen oder aufgebraucht. Erneut anmelden oder Guthaben prüfen."],
 pt:["Teste de IA","Entre com Google para começar.","20 créditos por 7 dias, uma vez por conta Google verificada, não por dispositivo. Um crédito por solicitação de IA gerenciada concluída. Sem renovação automática. Sua chave API é independente.","Créditos restantes","Expira","Teste indisponível, expirado ou esgotado. Entre novamente ou consulte o saldo."],
 it:["Prova IA","Accedi con Google per iniziare.","20 crediti per 7 giorni, una volta per account Google verificato, non per dispositivo. Un credito per richiesta IA gestita completata. Nessun rinnovo automatico. Le proprie chiavi API sono indipendenti.","Crediti rimanenti","Scadenza","Prova non disponibile, scaduta o esaurita. Accedi di nuovo o controlla il saldo."],
 ja:["AI試用","Googleでログインして開始してください。","認証済みGoogleアカウントごとに1回、7日間で20クレジット。端末単位ではありません。管理型AIリクエストの成功ごとに1クレジット。自動更新なし。個人のAPIキーは別扱いです。","残りクレジット","有効期限","試用を利用できないか、期限切れまたは残高不足です。再ログインするか残高を確認してください。"],
 ko:["AI 체험","Google로 로그인하여 시작하세요.","인증된 Google 계정당 한 번, 7일 동안 20크레딧. 기기당이 아닙니다. 관리형 AI 요청 성공 시 1크레딧. 자동 갱신 없음. 개인 API 키는 별도입니다.","남은 크레딧","만료","체험을 사용할 수 없거나 만료 또는 소진되었습니다. 다시 로그인하거나 잔액을 확인하세요."],
 zh:["AI试用","使用Google登录即可开始。","每个已验证Google账号仅限一次，7天内20积分，不按设备计算。每次成功的托管AI请求消耗1积分。不自动续期。个人API密钥独立使用。","剩余积分","到期时间","试用不可用、已到期或积分耗尽。请重新登录或检查余额。"],
 ar:["تجربة الذكاء الاصطناعي","سجّل الدخول عبر Google للبدء.","20 رصيداً لمدة 7 أيام، مرة لكل حساب Google موثّق وليس لكل جهاز. رصيد واحد لكل طلب ذكاء اصطناعي مُدار ناجح. دون تجديد تلقائي. مفاتيح API الخاصة مستقلة.","الرصيد المتبقي","تنتهي","التجربة غير متاحة أو منتهية أو مستنفدة. سجّل الدخول مجدداً أو راجع الرصيد."]
};
// Keep the legacy export name for installed clients, but describe the new policy.
for (const [language,copy] of Object.entries(trialCopy)) {
  copy[0]=language==='es'?'IA gratuita':'Free AI';
  copy[2]=language==='es'?'50 mensajes gratis cada 5 horas por cuenta de Google verificada. No se acumulan. Los fallos del proveedor no consumen mensajes. No necesitas una clave personal de OpenRouter. Se mantienen los controles contra abuso.':'50 free messages every 5 hours per verified Google account. Unused messages do not accumulate. Provider failures do not consume messages. No personal OpenRouter key is required. Abuse protection still applies.';
  copy[3]=language==='es'?'Mensajes disponibles':'Messages remaining';
  copy[4]=language==='es'?'Se renuevan':'Renews';
  copy[5]=language==='es'?'Inicia sesión con Google o revisa la hora de renovación de tu cuota gratuita.':'Sign in with Google or check when your free allowance renews.';
}
export function managedChatError(code,status,language='en'){
 const es=language==='es';
 if(code==='trial-provider-unavailable')return es?'El proveedor de IA no completó una respuesta válida. No confirma un problema con tu sesión ni falta de mensajes. Código: CHAT_PROVIDER_UNAVAILABLE.':'The AI provider did not complete a valid response. This does not establish a session or message allowance problem. Code: CHAT_PROVIDER_UNAVAILABLE.';
 if(code==='trial-upstream')return es?'El proveedor de IA rechazó o no completó la respuesta. No es un fallo de acceso de Google. La solicitud fue reembolsada. Código: CHAT_PROVIDER_'+Number(status)+'.':'The AI provider rejected or did not complete the response. This is not a Google access failure. The request was refunded. Code: CHAT_PROVIDER_'+Number(status)+'.';
 if(status===401||code==='trial-login')return es?'Tu sesión de IA venció. Vuelve a iniciar sesión con Google; no necesitas una clave de OpenRouter.':'Your AI session expired. Sign in with Google again; no OpenRouter key is required.';
 if(status===429)return es?'Se alcanzó un límite temporal de solicitudes. Espera un momento antes de reintentar.':'A temporary request limit was reached. Wait briefly before trying again.';
 if(code?.startsWith('credits-')||code?.startsWith('trial-exhausted'))return es?'Tu cuota gratuita se agotó. Revisa la hora de renovación en tu cuenta.':'Your free allowance is exhausted. Check the renewal time in your account.';
 if(status>=500&&status<=599)return es?'El servicio de chat devolvió un error del servidor. Esto no confirma que tu sesión haya vencido ni que se agotaran tus mensajes. Inténtalo más tarde. Código: CHAT_SERVICE_'+status+'.':'The chat service returned a server error. This does not confirm an expired session or exhausted messages. Try again later. Code: CHAT_SERVICE_'+status+'.';
 return es?'La IA no está disponible temporalmente. No necesitas introducir un token personal.':'AI is temporarily unavailable. You do not need to enter a personal token.';
}
if (typeof document !== "undefined") {
  let record = null, paidCredits = 0, failed = false;
  const paidCopy={en:"Recharged credits",es:"Créditos recargados",fr:"Crédits rechargés",de:"Aufgeladene Credits",pt:"Créditos recarregados",it:"Crediti ricaricati",ja:"チャージ済みクレジット",ko:"충전 크레딧",zh:"已充值积分",ar:"الأرصدة المشحونة"};
  const key = "jamdWebTrialSession";
  const getToken = () => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
  const nativeSession = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.()==='android'
    ? registerPlugin('AccountSession') : null;
  let accepting = false;
  const ready = (async()=>{
    if (!nativeSession || getToken()) return;
    try {
      const restored = await nativeSession.restore();
      // A concurrent fresh Google sign-in always wins over a restored session.
      if (!accepting && !getToken() && /^[a-f0-9]{64}$/.test(restored?.token||'')) sessionStorage.setItem(key,restored.token);
    } catch { /* Older installed builds have no plugin. Require Google, not a fake session. */ }
  })();
  const panel = document.createElement("section");
  panel.id = "jamdTrialPanel";
  panel.className = "backup-status";
  panel.setAttribute("aria-live","polite");
  document.getElementById("syncAccountStatus")?.after(panel);
  const language = () => document.documentElement.lang.split("-")[0];
  const copy = () => trialCopy[language()] || trialCopy.en;
  function render() {
    const c = copy(); panel.lang = trialCopy[language()] ? language() : "en";
    panel.dir = panel.lang === "ar" ? "rtl" : "ltr";
    const node = (tag,value) => {const el=document.createElement(tag);el.textContent=value;return el;};
    panel.replaceChildren(node("h3",c[0]),node("p",c[2]));
    if (record) panel.append(node("p", `${c[3]}: ${new Intl.NumberFormat(panel.lang).format(record.status === "expired" ? 0 : record.credits)} / ${new Intl.NumberFormat(panel.lang).format(50)} · ${c[4]}: ${new Date(record.expiresAt*1000).toLocaleString(panel.lang)}`));
    if (record) panel.append(node("p",`${paidCopy[panel.lang]||paidCopy.en}: ${new Intl.NumberFormat(panel.lang).format(paidCredits)}`));
    if (failed || (record && record.status !== "active" && paidCredits < 1)) panel.append(node("p",c[5]));
    else if (!record) panel.append(node("p",c[1]));
  }
  async function refresh() {
    await ready;
    if (!getToken()) return render();
    try {
      const base = !window.Capacitor?.isNativePlatform?.() && location.protocol === "https:" && location.hostname !== 'localhost' ? location.origin : "https://www.jamddmaj.com";
      const response = await fetch(`${base}/api/trial`,{headers:{Authorization:`Bearer ${getToken()}`},cache:"no-store"});
      const data=await response.json();
      if (!response.ok) throw Error();
      record=data.trial; paidCredits=Number(data.paidCredits||0); failed=false;
    } catch {failed=true;}
    render();
  }
  window.JamdTrial = {
    getToken, ready, refresh, error:(code,status)=>managedChatError(code,status,language()),
    sessionStatus:async()=>{await ready;return inspectGoogleSession({readToken:getToken,apiRoot:window.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':''});},
    async accept(value) {
      if(!/^[a-f0-9]{64}$/.test(value?.token||''))throw Error('session-format-rejected');
      accepting=true;sessionStorage.setItem(key,value.token);record=value.trial;failed=false;render();
      if(nativeSession)try{await nativeSession.save({token:value.token});}catch{/* Current session remains usable; no plaintext fallback. */}
    }
  };
  ready.then(()=>window.dispatchEvent(new Event('jamd-account-session-ready')));
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  render(); refresh();
}
