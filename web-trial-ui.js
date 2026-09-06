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
if (typeof document !== "undefined") {
  let record = null, paidCredits = 0, failed = false;
  const paidCopy={en:"Recharged credits",es:"Créditos recargados",fr:"Crédits rechargés",de:"Aufgeladene Credits",pt:"Créditos recarregados",it:"Crediti ricaricati",ja:"チャージ済みクレジット",ko:"충전 크레딧",zh:"已充值积分",ar:"الأرصدة المشحونة"};
  const key = "jamdWebTrialSession";
  const getToken = () => { try { return sessionStorage.getItem(key) || ""; } catch { return ""; } };
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
    if (record) panel.append(node("p", `${c[3]}: ${new Intl.NumberFormat(panel.lang).format(record.status === "expired" ? 0 : record.credits)} / ${new Intl.NumberFormat(panel.lang).format(20)} · ${c[4]}: ${new Date(record.expiresAt*1000).toLocaleString(panel.lang)}`));
    if (record) panel.append(node("p",`${paidCopy[panel.lang]||paidCopy.en}: ${new Intl.NumberFormat(panel.lang).format(paidCredits)}`));
    if (failed || (record && record.status !== "active" && paidCredits < 1)) panel.append(node("p",c[5]));
    else if (!record) panel.append(node("p",c[1]));
  }
  async function refresh() {
    if (!getToken()) return render();
    try {
      const base = location.protocol === "https:" ? location.origin : "https://www.jamddmaj.com";
      const response = await fetch(`${base}/api/trial`,{headers:{Authorization:`Bearer ${getToken()}`},cache:"no-store"});
      const data=await response.json();
      if (!response.ok) throw Error();
      record=data.trial; paidCredits=Number(data.paidCredits||0); failed=false;
    } catch {failed=true;}
    render();
  }
  window.JamdTrial = {
    getToken, refresh, error:()=>copy()[5],
    accept(value) {sessionStorage.setItem(key,value.token);record=value.trial;failed=false;render();}
  };
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  render(); refresh();
}
