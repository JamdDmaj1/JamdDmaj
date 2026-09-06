import { payForDevnetCredits } from "./lib/jamd-devnet-credit-payment.js";

const copy = {
  en:["Recharge with JAMD","Devnet test package","10 test JAMD","20 AI credits","Connect your Phantom wallet and keep Google signed in.","Pay with test JAMD","Approve the visible Devnet transaction in your wallet.","Waiting for final confirmation…","Recharge completed.","Could not verify the recharge. No credits were added."],
  es:["Recargar con JAMD","Paquete de prueba en Devnet","10 JAMD de prueba","20 créditos de IA","Conecta tu wallet Phantom y mantén Google iniciado.","Pagar con JAMD de prueba","Aprueba la transacción visible de Devnet en tu wallet.","Esperando confirmación final…","Recarga completada.","No se pudo verificar la recarga. No se agregaron créditos."],
  fr:["Recharger avec JAMD","Forfait test Devnet","10 JAMD de test","20 crédits IA","Connectez Phantom et gardez Google connecté.","Payer en JAMD de test","Approuvez la transaction Devnet visible dans votre wallet.","Confirmation finale en attente…","Recharge terminée.","Recharge non vérifiée. Aucun crédit ajouté."],
  de:["Mit JAMD aufladen","Devnet-Testpaket","10 Test-JAMD","20 KI-Credits","Phantom verbinden und bei Google angemeldet bleiben.","Mit Test-JAMD zahlen","Bestätige die sichtbare Devnet-Transaktion in deiner Wallet.","Warte auf endgültige Bestätigung…","Aufladung abgeschlossen.","Aufladung konnte nicht bestätigt werden. Keine Credits hinzugefügt."],
  pt:["Recarregar com JAMD","Pacote de teste Devnet","10 JAMD de teste","20 créditos de IA","Conecte a Phantom e mantenha o Google conectado.","Pagar com JAMD de teste","Aprove a transação Devnet visível na carteira.","Aguardando confirmação final…","Recarga concluída.","Não foi possível verificar a recarga. Nenhum crédito foi adicionado."],
  it:["Ricarica con JAMD","Pacchetto test Devnet","10 JAMD di test","20 crediti IA","Collega Phantom e mantieni Google connesso.","Paga con JAMD di test","Approva la transazione Devnet visibile nel wallet.","Attesa conferma finale…","Ricarica completata.","Ricarica non verificata. Nessun credito aggiunto."],
  ja:["JAMDでチャージ","Devnetテストパッケージ","テスト用JAMD 10枚","AIクレジット20","Phantomを接続し、Googleログインを維持してください。","テストJAMDで支払う","ウォレットに表示されるDevnet取引を承認してください。","最終確認を待っています…","チャージ完了。","チャージを確認できませんでした。クレジットは追加されていません。"],
  ko:["JAMD로 충전","Devnet 테스트 패키지","테스트 JAMD 10개","AI 크레딧 20개","Phantom을 연결하고 Google 로그인을 유지하세요.","테스트 JAMD로 결제","지갑에 표시되는 Devnet 거래를 승인하세요.","최종 확인 대기 중…","충전 완료.","충전을 확인하지 못했습니다. 크레딧이 추가되지 않았습니다."],
  zh:["使用JAMD充值","Devnet测试套餐","10枚测试JAMD","20个AI积分","连接Phantom并保持Google登录。","使用测试JAMD支付","请在钱包中批准显示的Devnet交易。","正在等待最终确认…","充值完成。","无法验证充值，未增加积分。"],
  ar:["الشحن باستخدام JAMD","حزمة اختبار Devnet","10 JAMD تجريبية","20 رصيد ذكاء اصطناعي","اربط Phantom وأبقِ تسجيل Google فعالاً.","الدفع بـ JAMD التجريبية","وافق على معاملة Devnet الظاهرة في محفظتك.","بانتظار التأكيد النهائي…","اكتمل الشحن.","تعذر التحقق من الشحن. لم تتم إضافة أرصدة."]
};

let wallet=null,account=null,busy=false;
const panel=document.createElement("section"); panel.className="backup-status"; panel.setAttribute("aria-live","polite");
const language=()=>document.documentElement.lang.split("-")[0];
const text=()=>copy[language()]||copy.en;
const status=document.createElement("p");
const button=document.createElement("button"); button.type="button"; button.className="pill-btn";
function render(){const c=text();panel.lang=copy[language()]?language():"en";panel.dir=panel.lang==="ar"?"rtl":"ltr";const h=document.createElement("h3");h.textContent=c[0];const p=document.createElement("p");p.textContent=`${c[1]} · ${c[2]} → ${c[3]}`;const note=document.createElement("p");note.textContent=c[4];button.textContent=c[5];button.disabled=busy;panel.replaceChildren(h,p,note,button,status);}
window.addEventListener("jamddmaj:wallet-connected",event=>{wallet=event.detail?.wallet;account=event.detail?.account;});
window.addEventListener("jamddmaj:wallet-disconnected",()=>{wallet=null;account=null;});
new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
button.addEventListener("click",async()=>{const c=text();if(busy)return;if(!window.JamdTrial?.getToken?.()||!wallet||!account){status.textContent=c[4];return;}busy=true;render();status.textContent=c[6];try{const signature=await payForDevnetCredits(wallet,account);status.textContent=c[7];let response;for(let i=0;i<20;i++){response=await fetch("/api/jamd-credit-topup",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${window.JamdTrial.getToken()}`},body:JSON.stringify({signature,wallet:account.address})});if(response.status!==409)break;await new Promise(resolve=>setTimeout(resolve,1500));}if(!response?.ok)throw new Error("verification");status.textContent=c[8];await window.JamdTrial.refresh();}catch{status.textContent=c[9];}finally{busy=false;render();}});
document.getElementById("jamdTrialPanel")?.after(panel);render();
