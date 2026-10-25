import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {inspectWebSwapPreparation,from64,to64,publicKey,uint} from './web-swap-policy.js';
import {inspectSwapEvidence,unsignedSwapWire} from './web-swap-evidence.js';
const grants=new WeakMap();
export async function consumeWebSwapGrant(grant,address){
 const value=grants.get(grant);grants.delete(grant);if(!value||value.address!==address)throw Error('WEB_SWAP_APPROVAL_REQUIRED');
 await value.revalidate();return {message:Uint8Array.from(value.message),current:value.current};
}
export function createWebSwapEngine({rpc,fetchImpl=fetch,journal,now=Date.now,isForeground=()=>true}={}){
 if(typeof rpc!=='function'||!journal)throw Error('WEB_SWAP_SERVICES_REQUIRED');
 const reviews=new WeakMap();let generation=0;
 const invalidate=()=>{generation++;};
 function requireCurrent(state){if(state.generation!==generation||state.used||!isForeground()||now()>=state.candidate.expiresAt||now()<state.started)throw Error('WEB_SWAP_REVIEW_EXPIRED');}
 async function validateAgain(state){requireCurrent(state);const evidence=await inspectSwapEvidence(state.candidate,rpc);requireCurrent(state);if(evidence.fee!==state.evidence.fee||evidence.rent!==state.evidence.rent)throw Error('WEB_SWAP_COST_CHANGED');return evidence;}
 async function prepare(intent){
  invalidate();const ticket=generation;if(await journal.read(intent.payer))throw Error('WEB_SWAP_PENDING_CHECK_REQUIRED');
  const response=await fetchImpl('/api/swap-build?'+new URLSearchParams({inputMint:intent.inputMint,outputMint:intent.outputMint,amount:intent.amount,taker:intent.payer,slippageBps:String(intent.slippageBps)}),{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok||response.redirected)throw Error('WEB_SWAP_SERVICE_UNAVAILABLE');const text=await response.text();if(text.length>262144)throw Error('WEB_SWAP_SERVICE_UNAVAILABLE');
  const body=JSON.parse(text);
  if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('WEB_SWAP_NETWORK_MISMATCH');
  // Compile an unsigned candidate with a confirmed chain blockhash, never an
  // unconfirmed provider bank or a replacement after the user has reviewed it.
  const latest=await rpc('getLatestBlockhash',[{commitment:'confirmed'}]);publicKey(latest?.value?.blockhash);if(!Number.isSafeInteger(latest?.context?.slot)||!Number.isSafeInteger(latest.value.lastValidBlockHeight)||latest.value.lastValidBlockHeight<1)throw Error('WEB_SWAP_BLOCKHASH_UNAVAILABLE');
  const preparation={...body.preparation,blockhash:latest.value.blockhash,lastValidBlockHeight:String(latest.value.lastValidBlockHeight)};
  const tables=await resolveWebSwapTables(preparation,rpc),candidate=await inspectWebSwapPreparation(preparation,intent,now(),tables);
  const state={candidate,generation:ticket,used:false,started:now()},evidence=await inspectSwapEvidence(candidate,rpc);state.evidence=evidence;requireCurrent(state);
  const review=Object.freeze({address:intent.payer,inputMint:intent.inputMint,outputMint:intent.outputMint,input:intent.amount,minimum:candidate.minimum.toString(),simulatedOutput:evidence.output,fee:evidence.fee,rent:evidence.rent,expiresAt:candidate.expiresAt});reviews.set(review,state);return review;
 }
 function authorize(review,approval){const state=reviews.get(review);if(approval!==true||!state)throw Error('WEB_SWAP_APPROVAL_REQUIRED');requireCurrent(state);const grant=Object.freeze({});grants.set(grant,{address:review.address,message:state.candidate.message,revalidate:async()=>{if(await journal.read(review.address))throw Error('WEB_SWAP_PENDING_CHECK_REQUIRED');await validateAgain(state);},current:()=>requireCurrent(state)});return grant;}
 async function submit(review,signed){
  const state=reviews.get(review);if(!state)throw Error('WEB_SWAP_APPROVAL_REQUIRED');requireCurrent(state);
  const wire=from64(signed),message=state.candidate.message;
  if(wire.length!==message.length+65||wire[0]!==1||message.some((v,i)=>wire[65+i]!==v)||!ed25519.verify(wire.subarray(1,65),message,bs58.decode(review.address),{zip215:false}))throw Error('WEB_SWAP_SIGNATURE_MISMATCH');
  const evidence=await inspectSwapEvidence(state.candidate,rpc,{signedWire:wire});requireCurrent(state);if(evidence.fee!==state.evidence.fee||evidence.rent!==state.evidence.rent)throw Error('WEB_SWAP_COST_CHANGED');
  const signature=bs58.encode(wire.subarray(1,65));state.used=true;
  await journal.begin({address:review.address,signature,lastValidBlockHeight:state.candidate.lastValidBlockHeight.toString()});
  // No automatic retries, including ambiguous responses. Journal is durable first.
  if(!isForeground()||state.generation!==generation||now()>=state.candidate.expiresAt)throw Error('WEB_SWAP_PENDING_CHECK_REQUIRED');
  const result=await rpc('sendTransaction',[signed,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]);
  if(result!==signature)throw Error('WEB_SWAP_PENDING_CHECK_REQUIRED');return signature;
 }
 async function checkPending(address){const pending=await journal.read(address);if(!pending)return null;
  if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('WEB_SWAP_STATUS_UNVERIFIED');
  const response=await rpc('getSignatureStatuses',[[pending.signature],{searchTransactionHistory:true}]),status=response?.value?.[0];
  if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<1||!Array.isArray(response.value)||response.value.length!==1||status!==null&&(!status||!Object.hasOwn(status,'err')||!Number.isSafeInteger(status.slot)||status.slot<1||status.slot>response.context.slot||!['processed','confirmed','finalized'].includes(status.confirmationStatus)||status.err!==null&&!(typeof status.err==='string'&&status.err.length>0&&status.err.length<=256||typeof status.err==='object'&&!Array.isArray(status.err)&&status.err!==null&&Object.keys(status.err).length>0)))throw Error('WEB_SWAP_STATUS_UNVERIFIED');
  if(status?.confirmationStatus==='finalized'){
   if(status.confirmations!==null)throw Error('WEB_SWAP_STATUS_UNVERIFIED');
   await journal.resolve(address,pending.signature,status.err===null?'FINALIZED':'FAILED');return {signature:pending.signature,state:status.err===null?'FINALIZED':'FAILED'};
  }
  return {...pending,state:status?'CONFIRMING':'UNKNOWN'};
 }
 return Object.freeze({prepare,authorize,submit,checkPending,invalidate});
}
export function createWebSwapRpc({fetchImpl=fetch}={}){
 let id=0;const methods=new Set(['getGenesisHash','getSlot','getLatestBlockhash','getMultipleAccounts','getBlockHeight','isBlockhashValid','getFeeForMessage','getMinimumBalanceForRentExemption','simulateTransaction','sendTransaction','getSignatureStatuses']);
 return async(method,params)=>{if(!methods.has(method))throw Error('UNSUPPORTED_WALLET_RPC');const requestId=++id;
  const response=await fetchImpl('https://solana-rpc.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if(!response.ok||response.redirected)throw Error('WEB_WALLET_NETWORK_UNAVAILABLE');const text=await response.text();if(text.length>2097152)throw Error('WEB_WALLET_NETWORK_UNAVAILABLE');const value=JSON.parse(text);
  if(value.id!==requestId||value.jsonrpc!=='2.0'||value.error||!Object.hasOwn(value,'result'))throw Error('WEB_WALLET_RPC_REJECTED');return value.result;
 };
}
export function signedSwapWire(message,signature){const wire=unsignedSwapWire(message);if(signature.length!==64)throw Error('WEB_SWAP_SIGNATURE_MISMATCH');wire.set(signature,1);return to64(wire);}
export async function resolveWebSwapTables(preparation,rpc){
 const addresses=preparation?.lookupTableAddresses||[];if(!Array.isArray(addresses)||addresses.length>32||new Set(addresses).size!==addresses.length)throw Error('WEB_SWAP_LOOKUP_REJECTED');addresses.forEach(publicKey);if(!addresses.length)return [];
 if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('WEB_SWAP_NETWORK_MISMATCH');
 const result=[];for(let offset=0;offset<addresses.length;offset+=10){const batch=addresses.slice(offset,offset+10),response=await rpc('getMultipleAccounts',[batch,{encoding:'base64',commitment:'confirmed'}]);if(!Number.isSafeInteger(response?.context?.slot)||!Array.isArray(response.value)||response.value.length!==batch.length)throw Error('WEB_SWAP_LOOKUP_REJECTED');
 result.push(...response.value.map((v,i)=>{if(v?.owner!=='AddressLookupTab1e1111111111111111111111111'||v.executable!==false||!Array.isArray(v.data)||v.data[1]!=='base64')throw Error('WEB_SWAP_LOOKUP_REJECTED');const data=from64(v.data[0],8248);
  if(data.length<56||(data.length-56)%32||uint(data,0,4)!==1n||uint(data,4,8)!==18446744073709551615n||uint(data,12,8)>=BigInt(response.context.slot))throw Error('WEB_SWAP_LOOKUP_REJECTED');
  const entries=[];for(let at=56;at<data.length;at+=32)entries.push(bs58.encode(data.subarray(at,at+32)));return {address:batch[i],addresses:entries};
 }));}return result;
}
