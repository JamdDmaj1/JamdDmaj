import bs58 from 'bs58';

export function tokenNameKey(value){return String(value||'').normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
export function checkedTokenName(input){
 const name=String(input?.name||'').trim(),symbol=String(input?.symbol||'').trim();
 if(!name||new TextEncoder().encode(name).length>60||!tokenNameKey(name)||/[\p{Cc}\p{Cf}]/u.test(name)||! /^[A-Za-z0-9]{1,10}$/.test(symbol))throw Error('TOKEN_NAME_INPUT');
 return {name,symbol};
}
function validMint(mint){try{return typeof mint==='string'&&mint.length<=44&&bs58.decode(mint).length===32;}catch{return false;}}
export function findTokenNameMatches(identity,rows){
 const query=checkedTokenName(identity),found=new Map();
 for(const row of rows.slice(0,1000)){
  if(!validMint(row?.mint))continue;
  const name=String(row.name||'').slice(0,100),symbol=String(row.symbol||'').slice(0,44);
  const nameMatch=tokenNameKey(name)===tokenNameKey(query.name),symbolMatch=tokenNameKey(symbol)===tokenNameKey(query.symbol);
  if(!nameMatch&&!symbolMatch)continue;
  const previous=found.get(row.mint);
  found.set(row.mint,{mint:row.mint,name,symbol,nameMatch:nameMatch||!!previous?.nameMatch,symbolMatch:symbolMatch||!!previous?.symbolMatch,
   sources:[...new Set([...(previous?.sources||[]),String(row.source||'Índice público').slice(0,50)])]});
 }
 return [...found.values()].slice(0,40);
}
/** A lookup is evidence of indexed matches only, never a worldwide reservation. */
export async function lookupTokenName(identity,{fetchImpl=globalThis.fetch,apiKey,now=Date.now}={}){
 identity=checkedTokenName(identity);const queries=[...new Set([identity.name,identity.symbol])];
 async function get(url,headers={}){
  const response=await fetchImpl(url,{headers:{Accept:'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('TOKEN_NAME_SOURCE');
  const reader=response.body?.getReader();if(!reader)throw Error('TOKEN_NAME_SOURCE');let size=0,parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288)throw Error('TOKEN_NAME_SOURCE_SIZE');parts.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));
 }
 const sources=await Promise.all(['DEX Screener','Jupiter Tokens V2'].map(async source=>{
  const results=await Promise.allSettled(queries.map(async query=>{
   const suffix=encodeURIComponent(query);
   if(source==='DEX Screener'){
    const body=await get('https://api.dexscreener.com/latest/dex/search?q='+suffix);
    if(!Array.isArray(body?.pairs))throw Error('TOKEN_NAME_SOURCE');
    return body.pairs.slice(0,100).filter(p=>p.chainId==='solana').flatMap(p=>[p.baseToken,p.quoteToken]).map(t=>({mint:t?.address,name:t?.name,symbol:t?.symbol,source}));
   }
   const body=await get('https://api.jup.ag/tokens/v2/search?query='+suffix,apiKey?{'x-api-key':apiKey}:{});
   if(!Array.isArray(body))throw Error('TOKEN_NAME_SOURCE');return body.slice(0,100).map(t=>({mint:t?.id,name:t?.name,symbol:t?.symbol,source}));
  }));
  return {source,available:results.every(r=>r.status==='fulfilled'),rows:results.flatMap(r=>r.status==='fulfilled'?r.value:[])};
 }));
 const matches=findTokenNameMatches(identity,sources.flatMap(s=>s.rows)),checkedAt=now();
 return {network:'solana:mainnet',...identity,checkedAt,expiresAt:checkedAt+120000,
  status:matches.length?'duplicate':sources.some(s=>s.available)?'no-indexed-match':'unavailable',
  matches,sources:sources.map(({source,available})=>({source,available})),globalUniquenessGuaranteed:false};
}
export function localTokenNameMatches(identity,storage){
 // A failed or confirmed local issuance is not a name reservation. Only rooted
 // successful receipts are useful duplicate evidence; corrupted history fails closed.
 const history=JSON.parse(storage.getItem('jamd.tokenCreator.mainnet.pending.v1.history')||'[]');
 if(!Array.isArray(history))throw Error('TOKEN_NAME_HISTORY');
 return findTokenNameMatches(identity,history.filter(r=>r?.chain==='solana:mainnet'&&r.state==='confirmed').map(r=>({...r,source:'Creación confirmada en este dispositivo'})));
}
