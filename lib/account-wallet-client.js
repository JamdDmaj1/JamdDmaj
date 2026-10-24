import bs58 from 'bs58';
export function validateAccountWallet(v){
 if(v===null)return null;
 if(!v||Object.keys(v).sort().join(',')!=='address,linkedAt,network,readOnly,revision,signingAuthorized,version'||v.version!==1||v.network!=='solana:mainnet'||v.readOnly!==true||v.signingAuthorized!==false||typeof v.address!=='string'||v.address.length>44||bs58.decode(v.address).length!==32||bs58.encode(bs58.decode(v.address))!==v.address||typeof v.revision!=='string'||!/^[a-f0-9]{64}$/.test(v.revision)||!Number.isSafeInteger(v.linkedAt)||v.linkedAt<0)throw Error('INVALID_PUBLIC_LINK');
 return Object.freeze({...v});
}
export function createAccountWalletClient({fetchImpl=globalThis.fetch,readToken,apiRoot=''}={}){
 if(typeof fetchImpl!=='function'||typeof readToken!=='function'||!['','https://www.jamddmaj.com'].includes(apiRoot))throw Error('INVALID_PUBLIC_LINK_CLIENT');
 async function request(body){
  const token=readToken();if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('LOGIN_REQUIRED');
  const response=await fetchImpl(apiRoot+'/api/account-wallet',{method:body?'POST':'GET',cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(readToken()!==token)throw Error('SESSION_CHANGED');if(response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw Error('PUBLIC_LINK_UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)throw Error('PUBLIC_LINK_UNAVAILABLE');let bytes=[],size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>2048)throw Error('PUBLIC_LINK_UNAVAILABLE');bytes.push(item.value);}}finally{await reader.cancel().catch(()=>{});}
  const all=new Uint8Array(size);let at=0;for(const part of bytes){all.set(part,at);at+=part.length;}const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  if(readToken()!==token)throw Error('SESSION_CHANGED');if(response.status!==200||result?.ok!==true)throw Error(['LOGIN_REQUIRED','LINK_CHANGED_REFRESH_FIRST'].includes(result?.error)?result.error:'PUBLIC_LINK_UNAVAILABLE');
  if(Object.keys(result).sort().join(',')!=='ok,wallet')throw Error('PUBLIC_LINK_UNAVAILABLE');return validateAccountWallet(result.wallet);
 }
 return Object.freeze({read:()=>request(),save:({address,expectedRevision,explicitApproval})=>{if(explicitApproval!==true)throw Error('PUBLIC_LINK_APPROVAL_REQUIRED');return request({address,expectedRevision,explicitApproval:true});}});
}
