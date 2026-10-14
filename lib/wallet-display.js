// Public display data only. Does not grant signing or spending authority.
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function walletDisplayBalance(data,now=Date.now()){
 const age=now-Date.parse(data?.updatedAt);
 if(data?.ok!==true||data.network!=='solana:mainnet'||data.partial!==false||!Array.isArray(data.tokens)||!Number.isFinite(age)||age< -5000||age>120000)return null;
 const rows=data.tokens.filter(t=>t.mint===USDC);if(rows.some(t=>!Number.isFinite(t.amount)||t.amount<0))return null;
 const usdc=rows.reduce((a,t)=>a+t.amount,0);if(!Number.isFinite(usdc))return null;
 return {usdc,estimatedUsd:Number.isFinite(data.estimatedValueUsd)&&data.estimatedValueUsd>=0?data.estimatedValueUsd:null};
}
export function bindWalletDisplay(doc,language,output,slider,amount){
 let expiry;
 const render=data=>{
  clearTimeout(expiry);const value=walletDisplayBalance(data);
  output.textContent=value?(language==='es'?'USDC en billetera: ':'Wallet USDC: ')+value.usdc.toLocaleString(language,{maximumFractionDigits:6})+(value.estimatedUsd===null?'':(language==='es'?' · Valor total estimado: $':' · Estimated total value: $')+value.estimatedUsd.toLocaleString(language,{maximumFractionDigits:2})):(language==='es'?'USDC en billetera: — · conecta o actualiza en Activos':'Wallet USDC: — · connect or refresh in Assets');
  if(slider){
   slider.disabled=!value||value.usdc<=0;
   // Refreshing public balances must not change an order the user is editing.
   if(!value)slider.value='0';
   slider.oninput=()=>{
    const percent=Number(slider.value);
    if(!value||!Number.isFinite(percent)||percent<0||percent>100)return;
    amount.value=(Math.floor(value.usdc*percent/100*1e6)/1e6).toFixed(6);
    amount.dispatchEvent?.(new Event('input',{bubbles:true}));
   };
  }
  if(value){expiry=setTimeout(()=>render(null),Math.max(1,120000-(Date.now()-Date.parse(data.updatedAt))));expiry?.unref?.();}
 };
 const listener=e=>render(e.detail);doc.addEventListener?.('jamd-wallet-portfolio',listener);render(null);
 doc.defaultView?.addEventListener?.('pagehide',()=>{clearTimeout(expiry);doc.removeEventListener?.('jamd-wallet-portfolio',listener);},{once:true});
}
