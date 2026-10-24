// Untrusted form values only. Native validation, simulation and biometrics remain mandatory.
export function perpsNavigationDraft(value){
 const allowed=['asset','side','margin','leverage','referencePrice','stopLoss','takeProfit'];
 if(!value||Object.keys(value).some(key=>!allowed.includes(key))||!['BTC','ETH','SOL'].includes(value.asset)||!['LONG','SHORT'].includes(value.side))throw Error('market');
 const usd=text=>{if(typeof text!=='string'||!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(text))throw Error('amount');const [whole,fraction='']=text.split('.');const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));if(units<=0n)throw Error('amount');return units;};
 let margin,price;
 try{margin=usd(value.margin);}catch{throw Error('margin');}
 if(margin<10000000n)throw Error('margin');
 try{price=usd(value.referencePrice);}catch{throw Error('referencePrice');}
 if(typeof value.leverage!=='string'||!/^([1-9]\d?)(\.\d)?$/.test(value.leverage)||Number(value.leverage)<1.1||Number(value.leverage)>50)throw Error('leverage');
 const result={asset:value.asset,side:value.side,margin:value.margin,leverage:value.leverage,referencePrice:value.referencePrice};
 for(const name of ['stopLoss','takeProfit']){
  const text=value[name];if(text==null||text==='')continue;let level;try{level=usd(text);}catch{throw Error('exit');}
  const above=(value.side==='LONG')===(name==='takeProfit');if(level===price||(level>price)!==above)throw Error('exit');result[name]=text;
 }
 return Object.freeze(result);
}

// The HTTP review is display evidence, not a wallet grant or an executable
// quote. Bind it to the exact current form/account and discard stale replies.
export function validateWebPerpsReview(value,draft,walletAddress,now=Date.now()){
 const names=['stage','readyForSigning','tradingEnabled','walletAddress','draft','observedAt','observedSlot','expiresAt','availableUsdcUnits','payerLamports','marginUsdcUnits','sizeUsdUnits','networkFeeLamports','rentLockedLamports','requiresWalletSignature','requiresDurableSubmissionJournal'];
 if(!value||Object.keys(value).sort().join(',')!==names.sort().join(',')||value.stage!=='MANUAL_PERPS_REVIEW_VALIDATED'
  ||value.readyForSigning!==false||value.tradingEnabled!==false||value.requiresWalletSignature!==true||value.requiresDurableSubmissionJournal!==true
  ||value.walletAddress!==walletAddress||JSON.stringify(perpsNavigationDraft(value.draft))!==JSON.stringify(perpsNavigationDraft(draft)))throw Error('review');
 for(const name of ['observedAt','observedSlot','expiresAt'])if(!Number.isSafeInteger(value[name])||value[name]<0)throw Error('review');
 if(!Number.isSafeInteger(now)||value.observedAt>now+2000||now-value.observedAt>15000||value.expiresAt<=now||value.expiresAt<=value.observedAt||value.expiresAt>now+15000)throw Error('expired');
 const units=name=>{const text=value[name];if(typeof text!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(text)||BigInt(text)>18446744073709551615n)throw Error('units');return BigInt(text);};
 const [whole,fraction='']=draft.margin.split('.'),margin=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 if(units('marginUsdcUnits')!==margin||units('availableUsdcUnits')<margin||units('sizeUsdUnits')===0n
  ||units('networkFeeLamports')<1n||units('networkFeeLamports')>1000000n||units('rentLockedLamports')>30000000n
  ||units('payerLamports')<units('networkFeeLamports')+units('rentLockedLamports')+1000000n)throw Error('funding');
 const [l,decimal='0']=draft.leverage.split('.');if(units('sizeUsdUnits')>margin*(BigInt(l)*10n+BigInt(decimal))/10n)throw Error('size');
 return Object.freeze({...value,draft:perpsNavigationDraft(value.draft)});
}
