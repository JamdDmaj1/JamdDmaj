function lamports(value){
 if(typeof value==='bigint'&&value>=0n)return value;
 if(Number.isSafeInteger(value)&&value>=0)return BigInt(value);
 throw Error('FAIR_COST_UNAVAILABLE');
}
export function fairLaunchCostReview(simulation,{kind,owner,platformFeeLamports=0n,now=Date.now()}={}){
 const s=simulation?.value;
 if(!['create','liquidity'].includes(kind)||s?.err!==null)throw Error('FAIR_COST_UNAVAILABLE');
 const before=lamports(s.preBalances?.[0]),after=lamports(s.postBalances?.[0]),network=lamports(s.fee),platform=lamports(platformFeeLamports);
 const total=before-after,reserves=total-network-platform;
 if(total<0n||reserves<0n||!Number.isSafeInteger(now))throw Error('FAIR_COST_UNAVAILABLE');
 return Object.freeze({cluster:'solana:devnet',kind,owner,platformFeeLamports:platform.toString(),networkFeeLamports:network.toString(),accountReservesLamports:reserves.toString(),estimatedTotalLamports:total.toString(),balanceAfterLamports:after.toString(),expiresAt:now+45000});
}
export function formatTestSol(value){const amount=BigInt(value);return `${amount/1000000000n}.${(amount%1000000000n).toString().padStart(9,'0')}`;}
