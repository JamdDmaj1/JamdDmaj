const KEY=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',JUP='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
// Conservative accounting: only a simple Jupiter exchange against USDC is a priced trade.
// Transfers, multi-asset operations and other quote currencies remain unpriced movements.
export function tokenHistoryEntry(tx,wallet,mint,signature){
 if(!KEY.test(wallet)||!KEY.test(mint)||!SIG.test(signature)||tx?.transaction?.signatures?.[0]!==signature||tx?.meta?.err!==null||!Number.isSafeInteger(tx.blockTime)||tx.blockTime<=0)return null;
 const keys=tx.transaction.message?.accountKeys;if(!Array.isArray(keys))return null;
 const amounts=new Map();
 for(const [side,rows]of [[-1,tx.meta.preTokenBalances],[1,tx.meta.postTokenBalances]]){
  if(!Array.isArray(rows))return null;
  for(const row of rows){if(row.owner!==wallet)continue;const a=row.uiTokenAmount;
   if(!KEY.test(row.mint)||!a||!/^\d{1,30}$/.test(a.amount)||!Number.isInteger(a.decimals)||a.decimals<0||a.decimals>18)return null;
   const value=Number(a.amount)/10**a.decimals;if(!Number.isFinite(value))return null;
   amounts.set(row.mint,(amounts.get(row.mint)||0)+side*value);
  }
 }
 const delta=amounts.get(mint)||0;if(!Number.isFinite(delta)||Math.abs(delta)<1e-15)return null;
 const instructions=[...(tx.transaction.message.instructions||[]),...(tx.meta.innerInstructions||[]).flatMap(x=>x.instructions||[])];
 const usd=amounts.get(USDC)||0,other=[...amounts].filter(([m,n])=>m!==mint&&m!==USDC&&Math.abs(n)>1e-12);
 const priced=mint!==USDC&&keys.some(k=>k.pubkey===wallet&&k.signer===true)&&instructions.some(ix=>ix.programId===JUP)&&other.length===0&&delta*usd<0;
 return {signature,at:tx.blockTime*1000,kind:priced?(delta>0?'buy':'sell'):(delta>0?'in':'out'),quantity:Math.abs(delta),totalUsdc:priced?Math.abs(usd):null,priceUsdc:priced?Math.abs(usd/delta):null};
}
export function summarizeTokenHistory(entries){const unique=[...new Map(entries.map(e=>[e.signature,e])).values()],buys=unique.filter(e=>e.kind==='buy'),sells=unique.filter(e=>e.kind==='sell');const quantity=buys.reduce((n,e)=>n+e.quantity,0),spent=buys.reduce((n,e)=>n+e.totalUsdc,0);return{buys:buys.length,sells:sells.length,spentUsdc:spent,averageUsdc:quantity?spent/quantity:null};}
export function createTokenHistoryReader(fetchImpl){
 let sequence=0;
 async function rpc(method,params,signal){
  for(const endpoint of ['https://solana-rpc.publicnode.com','https://api.mainnet-beta.solana.com'])try{
   const id=++sequence,response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error();const body=await response.json();if(body.id!==id||body.error||!Object.hasOwn(body,'result'))throw Error();return body.result;
  }catch(error){if(signal.aborted)throw error;}
  throw Error('HISTORY_UNAVAILABLE');
 }
 return async(wallet,mint,before,signal)=>{
  if(!KEY.test(wallet)||!KEY.test(mint)||before&&!SIG.test(before))throw Error('HISTORY_IDENTITY');
  if(await rpc('getGenesisHash',[],signal)!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('HISTORY_NETWORK');
  const rows=await rpc('getSignaturesForAddress',[wallet,{limit:10,commitment:'finalized',...(before?{before}:{})}],signal);
  if(!Array.isArray(rows)||rows.length>10||rows.some(r=>!SIG.test(r.signature)))throw Error('HISTORY_RESPONSE');
  const entries=[];let unavailable=0;
  await Promise.all(rows.filter(r=>r.err===null&&r.confirmationStatus==='finalized').map(async row=>{
   try{const tx=await rpc('getTransaction',[row.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}],signal);if(!tx){unavailable++;return;}const e=tokenHistoryEntry(tx,wallet,mint,row.signature);if(e)entries.push(e);}catch(error){if(signal.aborted)throw error;unavailable++;}
  }));
  return{wallet,mint,entries:entries.sort((a,b)=>b.at-a.at),before:rows.length===10?rows.at(-1).signature:null,scanned:rows.length,unavailable};
 };
}
