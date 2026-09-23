import {Capacitor} from '@capacitor/core';
import {Browser} from '@capacitor/browser';

export function setupFunding(language, checkBalance) {
  const es=language==='es', t=(a,b)=>es?a:b;
  const deposit=document.getElementById('deposit'), withdraw=document.getElementById('withdraw');
  const panel=deposit.closest('section'), status=document.getElementById('fundingStatus');
  panel.querySelector('h2').textContent=t('Fondos reales · Tu cuenta de Bitget','Real funds · Your Bitget account');
  panel.querySelector('p').textContent=t('Tu dinero se mantiene en Bitget, no en JamdDmaj. Estos accesos abren Bitget; no realizan transferencias.','Your money stays in Bitget, not JamdDmaj. These links open Bitget; they do not transfer funds.');
  const explanation=document.createElement('p');
  explanation.textContent=t('En Bitget elige la moneda y la red, y comprueba la dirección, memo/tag si corresponde y depósito mínimo. Usa la misma red en origen y destino. El depósito puede llegar a Spot/Fondos: no es automáticamente saldo disponible para futuros. Confirma allí cualquier transferencia o retiro.','In Bitget choose the coin and network, and verify the address, memo/tag if required, and minimum deposit. Use the same network at both ends. Deposits may reach Spot/Funding: they are not automatically available for futures. Confirm any transfer or withdrawal there.');
  panel.append(explanation);
  status.textContent=t('No se ha enviado dinero. Depositar no desactiva la pausa de operaciones.','No funds have been sent. Depositing does not disable the trading pause.');
  for(const [button,action,label,en,url] of [
    [deposit,'deposit','Depositar en Bitget ↗','Deposit on Bitget ↗','https://www.bitget.com/asset/recharge'],
    [withdraw,'withdraw','Retirar en Bitget ↗','Withdraw on Bitget ↗','https://www.bitget.com/asset/withdraw']
  ]) {
    const link=document.createElement('a');link.id=action;link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=t(label,en);link.style.cssText='display:inline-block;padding:10px;margin:4px;border:1px solid #354a66;border-radius:6px;color:#85c9ff;text-decoration:none';
    link.addEventListener('click',async event=>{
      status.textContent=t('Continúa en tu propia cuenta de Bitget. JamdDmaj no ha enviado fondos ni confirmado una transferencia.','Continue in your own Bitget account. JamdDmaj has not sent funds or confirmed a transfer.');
      if(Capacitor.isNativePlatform()){
        event.preventDefault();
        try{await Browser.open({url});}catch{status.textContent=t('No se pudo abrir Bitget. Abre su app oficial; no se envió dinero.','Could not open Bitget. Open its official app; no funds were sent.');}
      }
    });button.replaceWith(link);
  }
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent=t('Consultar saldo real de futuros','Check real futures balance');
  refresh.onclick=()=>{checkBalance.click();checkBalance.scrollIntoView({behavior:'smooth',block:'center'});};panel.append(refresh);
  const stats=document.querySelector('.stats');
  const notice=document.createElement('p');notice.textContent=t('SIMULADOR — el saldo siguiente es ficticio y no recibe tus depósitos.','SIMULATOR — the balance below is virtual and does not receive your deposits.');stats.before(notice);
}
