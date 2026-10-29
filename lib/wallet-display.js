// Public display data only. Does not grant signing or spending authority.
import {currentWalletPortfolio} from './wallet-portfolio-store.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {currentWalletTradingState} from './wallet-trading-state.js';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function walletDisplayBalance(data,now=Date.now()){
 const age=now-Date.parse(data?.updatedAt);
 if(data?.ok!==true||data.network!=='solana:mainnet'||(data.partial!==false&&data.balancesComplete!==true)||!Array.isArray(data.tokens)||!Number.isFinite(age)||age< -5000||age>120000)return null;
 const rows=data.tokens.filter(t=>t.mint===USDC);if(rows.some(t=>!Number.isFinite(t.amount)||t.amount<0))return null;
 const usdc=rows.reduce((a,t)=>a+t.amount,0);if(!Number.isFinite(usdc))return null;
 return {usdc,estimatedUsd:Number.isFinite(data.estimatedValueUsd)&&data.estimatedValueUsd>=0?data.estimatedValueUsd:null};
}
export function bindWalletDisplay(doc,language,output,slider,amount,canSize=()=>true){
 let expiry;
 const render=data=>{
  clearTimeout(expiry);const observed=walletDisplayBalance(data),state=currentWalletTradingState(doc);
  const unified=Boolean(selectedWalletAccount(doc));
  const value=unified?(state?.availableUsdcUnits==null?null:{usdc:Number(BigInt(state.availableUsdcUnits))/1e6,estimatedUsd:observed?.estimatedUsd??null}):observed;
  output.textContent=value?(language==='es'?'USDC en billetera: ':'Wallet USDC: ')+value.usdc.toLocaleString(language,{maximumFractionDigits:6})+(value.estimatedUsd===null?'':(language==='es'?' · Valor total estimado: $':' · Estimated total value: $')+value.estimatedUsd.toLocaleString(language,{maximumFractionDigits:2})):(language==='es'?'USDC en billetera: — · conecta o actualiza en Activos':'Wallet USDC: — · connect or refresh in Assets');
  if(unified)output.textContent=value?(language==='es'?'Disponible para dimensionar: ':'Available for sizing: ')+value.usdc.toLocaleString(language,{maximumFractionDigits:6})+' USDC':(language==='es'?'Disponible: — · actualiza la cuenta y comprueba operaciones pendientes.':'Available: — · refresh account and check pending operations.');
  if(selectedWalletAccount(doc)?.source==='watch')output.textContent=(language==='es'?'Solo consulta · USDC en billetera: ':'View only · Wallet USDC: ')+(state?.snapshot? (Number(BigInt(state.snapshot.availableUsdcUnits))/1e6).toLocaleString(language,{maximumFractionDigits:6}):'—');
  if(slider){
   slider.disabled=!value||value.usdc<=0||!canSize();
   // Refreshing public balances must not change an order the user is editing.
   if(!value)slider.value='0';
   const syncAmount=()=>{
    const entered=Number(amount.value);
    slider.value=!slider.disabled&&Number.isFinite(entered)&&entered>0
     ?String(Math.min(100,Math.max(0,entered/value.usdc*100))):'0';
   };
   amountSync=syncAmount;
   syncAmount();
   slider.oninput=()=>{
    if(unified){const current=currentWalletTradingState(doc);if(current?.account!==state?.account||current?.availableUsdcUnits!==state?.availableUsdcUnits){render(currentWalletPortfolio(doc));return;}}
    const percent=Number(slider.value);
    if(!value||!canSize()||!Number.isFinite(percent)||percent<0||percent>100)return;
    if(unified){const sized=BigInt(state.availableUsdcUnits)*BigInt(Math.floor(percent*100))/10000n;amount.value=(sized/1000000n).toString()+'.'+(sized%1000000n).toString().padStart(6,'0');}
    else amount.value=(Math.floor(value.usdc*percent/100*1e6)/1e6).toFixed(6);
    amount.dispatchEvent?.(new Event('input',{bubbles:true}));
   };
  }
  if(value){expiry=setTimeout(()=>render(currentWalletPortfolio(doc)),unified?Math.max(1,30001-(Date.now()-state.snapshot.observedAt)):Math.max(1,120001-(Date.now()-Date.parse(data.updatedAt))));expiry?.unref?.();}
 };
 let amountSync=()=>{};
 const amountChanged=()=>amountSync();amount.addEventListener?.('input',amountChanged);
 const listener=e=>render(e.detail);doc.addEventListener?.('jamd-wallet-portfolio',listener);render(currentWalletPortfolio(doc));
 const trading=()=>render(currentWalletPortfolio(doc));doc.addEventListener?.('jamd-trading-state',trading);
 doc.defaultView?.addEventListener?.('pagehide',()=>{clearTimeout(expiry);doc.removeEventListener?.('jamd-wallet-portfolio',listener);doc.removeEventListener?.('jamd-trading-state',trading);amount.removeEventListener?.('input',amountChanged);},{once:true});
 return ()=>render(currentWalletPortfolio(doc));
}
