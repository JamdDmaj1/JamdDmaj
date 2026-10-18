// Untrusted form values only. Native validation, simulation and biometrics remain mandatory.
export function perpsNavigationDraft(value){
 const allowed=['asset','side','margin','leverage','referencePrice','stopLoss','takeProfit'];
 if(!value||Object.keys(value).some(key=>!allowed.includes(key))||!['BTC','ETH','SOL'].includes(value.asset)||!['LONG','SHORT'].includes(value.side))throw Error('market');
 const usd=text=>{if(typeof text!=='string'||!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(text))throw Error('amount');const [whole,fraction='']=text.split('.');const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));if(units<=0n)throw Error('amount');return units;};
 const margin=usd(value.margin),price=usd(value.referencePrice);
 if(margin<10000000n||typeof value.leverage!=='string'||!/^([1-9]\d?)(\.\d)?$/.test(value.leverage)||Number(value.leverage)<1.1||Number(value.leverage)>50)throw Error('limits');
 const result={asset:value.asset,side:value.side,margin:value.margin,leverage:value.leverage,referencePrice:value.referencePrice};
 for(const name of ['stopLoss','takeProfit']){
  const text=value[name];if(text==null||text==='')continue;const level=usd(text);
  const above=(value.side==='LONG')===(name==='takeProfit');if(level===price||(level>price)!==above)throw Error('exit');result[name]=text;
 }
 return Object.freeze(result);
}
