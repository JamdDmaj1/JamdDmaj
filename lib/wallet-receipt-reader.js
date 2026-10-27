// Read-only finalized receipts. Never infer an incoming payment from a price
// change, aggregate balance increase, own swap, failed or unfinalized operation.
const KEY=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,SIG=/^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',SYSTEM='11111111111111111111111111111111';
const units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)?BigInt(v):null;
export function incomingWalletReceipts(tx,wallet,signature){
 if(!KEY.test(wallet)||!SIG.test(signature)||tx?.transaction?.signatures?.[0]!==signature||tx?.meta?.err!==null||!Number.isSafeInteger(tx.blockTime)||tx.blockTime<=0)return [];
 const keys=tx.transaction.message?.accountKeys;if(!Array.isArray(keys)||keys.some(k=>typeof k?.pubkey!=='string'||typeof k.signer!=='boolean')||keys.some(k=>k.pubkey===wallet&&k.signer))return [];
 const all=[...(tx.transaction.message.instructions||[]),...(tx.meta.innerInstructions||[]).flatMap(v=>v.instructions||[])],out=new Map(),countedDestinations=new Set();
 const pre=tx.meta.preTokenBalances||[],post=tx.meta.postTokenBalances||[];
 for(const ix of all){const type=ix?.parsed?.type,info=ix?.parsed?.info;if(!info||!['transfer','transferChecked'].includes(type))continue;
  if(ix.programId===SYSTEM&&info.destination===wallet&&info.source!==wallet){
   const index=keys.findIndex(k=>k.pubkey===wallet),n=Number.isSafeInteger(info.lamports)&&info.lamports>0?BigInt(info.lamports):0n;
   if(index<0||!Number.isSafeInteger(tx.meta.preBalances?.[index])||!Number.isSafeInteger(tx.meta.postBalances?.[index])||tx.meta.postBalances[index]-tx.meta.preBalances[index]<Number(n)||n<=0n)continue;
   out.set('SOL',{mint:'SOL',decimals:9,units:String(BigInt(out.get('SOL')?.units||0)+n)});
  }else if([TOKEN,TOKEN2022].includes(ix.programId)){
   const dest=keys.findIndex(k=>k.pubkey===info.destination),source=keys.findIndex(k=>k.pubkey===info.source),after=post.find(v=>v.accountIndex===dest&&v.owner===wallet);
   if(!after||pre.some(v=>v.accountIndex===source&&v.owner===wallet)||post.some(v=>v.accountIndex===source&&v.owner===wallet)||!KEY.test(after.mint))continue;
   const before=pre.find(v=>v.accountIndex===dest&&v.mint===after.mint),a=units(after.uiTokenAmount?.amount),b=before?units(before.uiTokenAmount?.amount):0n;
   const decimals=after.uiTokenAmount?.decimals;if(a===null||b===null||a<=b||!Number.isInteger(decimals)||decimals<0||decimals>18)continue;
   if(type==='transferChecked'&&(info.mint!==after.mint||info.tokenAmount?.decimals!==decimals))continue;
   // Report the observed net receipt, including any Token-2022 transfer fee.
   if(countedDestinations.has(dest))continue;countedDestinations.add(dest);
   out.set(after.mint,{mint:after.mint,decimals,units:String(BigInt(out.get(after.mint)?.units||0)+a-b)});
  }
 }
 return [...out.values()].map(v=>({...v,id:signature+':'+v.mint,signature,wallet,at:tx.blockTime*1000}));
}
export function createWalletReceiptReader({fetchImpl=fetch}={}){
 let id=0;
 async function rpc(method,params){
  // Public nodes may block token-owner indexes. Read-only fallback to the
  // official mainnet endpoint; failure of both is unavailable, never zero.
  const endpoints=method==='getTokenAccountsByOwner'?['https://api.mainnet-beta.solana.com','https://solana-rpc.publicnode.com']:['https://solana-rpc.publicnode.com','https://api.mainnet-beta.solana.com'];
  for(const url of endpoints)try{
   const requestId=++id,r=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!r.ok||r.redirected)throw Error();const text=await r.text();if(text.length>2097152)throw Error();const body=JSON.parse(text);if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error)throw Error();return body.result;
  }catch{/* Only fixed public read endpoints; no signing or send fallback. */}
  throw Error('RECEIPTS_UNAVAILABLE');
 }
 return async(wallet,{cursor=0,since=Date.now()}={})=>{
  if(!KEY.test(wallet))throw Error('INVALID_RECEIPT_WALLET');
  if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('RECEIPTS_NETWORK');
  const accounts=[];
  for(const programId of [TOKEN,TOKEN2022]){const r=await rpc('getTokenAccountsByOwner',[wallet,{programId},{encoding:'jsonParsed',commitment:'finalized'}]);if(!Array.isArray(r?.value))throw Error('RECEIPTS_UNAVAILABLE');for(const a of r.value)if(KEY.test(a.pubkey))accounts.push(a.pubkey);}
  const sorted=[...new Set(accounts)].sort(),start=sorted.length?cursor%sorted.length:0,targets=[wallet];
  for(let n=0;n<Math.min(4,sorted.length);n++)targets.push(sorted[(start+n)%sorted.length]);
  const signatures=new Map();for(const address of targets){const rows=await rpc('getSignaturesForAddress',[address,{limit:8,commitment:'finalized'}]);if(!Array.isArray(rows))throw Error('RECEIPTS_UNAVAILABLE');for(const row of rows)if(SIG.test(row.signature)&&row.err===null&&row.confirmationStatus==='finalized'&&Number.isSafeInteger(row.blockTime)&&row.blockTime*1000>=since)signatures.set(row.signature,row.blockTime);}
  const found=[];for(const [signature]of [...signatures].sort((a,b)=>b[1]-a[1]).slice(0,8)){const tx=await rpc('getTransaction',[signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(tx===null)throw Error('RECEIPTS_NOT_YET_AVAILABLE');found.push(...incomingWalletReceipts(tx,wallet,signature));}
  return {receipts:found,nextCursor:sorted.length?(start+4)%sorted.length:0,partial:sorted.length>4||signatures.size>8};
 };
}
