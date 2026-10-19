// Server-only, read-only reconciliation of an already recorded broadcast.
// This proves transaction identity/status, NOT instruction safety or permission to sign.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const proofs=new WeakSet();
function fail(){throw Error('UNVERIFIED_PERPS_RECEIPT');}
function key(value,length){try{const bytes=bs58.decode(value);if(bytes.length!==length||bs58.encode(bytes)!==value)fail();return Buffer.from(bytes);}catch{fail();}}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function transactionError(value){
 if(value===null)return;
 if(typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(value))return;
 if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1){
  const [name]=Object.keys(value);
  if(/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(name)&&value[name]!==undefined&&JSON.stringify(value).length<=4096)return;
 }
 fail();
}
function wireIdentity(encoded,record){
 if(typeof encoded!=='string'||encoded.length>1644)fail();
 const wire=Buffer.from(encoded,'base64');if(wire.toString('base64')!==encoded||wire.length>1232||wire.length<193+4+96+33||wire[0]!==3)fail();
 const message=wire.subarray(193),header=message[0]===128?1:0;
 if((message[0]&128)&&message[0]!==128)fail();
 if(message[header]!==3||![1,2].includes(message[header+1]))fail();
 let cursor=header+3,count=0,shift=0;
 for(let i=0;i<3;i++){
  if(cursor>=message.length)fail();const byte=message[cursor++];count|=(byte&127)<<shift;
  if(!(byte&128)){if(i>0&&(byte&127)===0)fail();break;}if(i===2)fail();shift+=7;
 }
 if(count<3||count>256||cursor+count*32+33>message.length)fail();
 const owner=key(record.walletAddress,32);if(!message.subarray(cursor,cursor+32).equals(owner))fail();
 if(!wire.subarray(1,65).equals(key(record.signature,64)))fail();
 for(let i=0;i<3;i++){
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),message.subarray(cursor+i*32,cursor+(i+1)*32)]),format:'der',type:'spki'});
  if(!verify(null,message,publicKey,wire.subarray(1+i*64,65+i*64)))fail();
 }
 // The recorded owner-signed envelope had no keeper signature yet. Restore
 // precisely that slot, retaining owner/API signatures and every message byte.
 const canonical=Buffer.from(wire);canonical.fill(0,65,129);
 if(createHash('sha256').update(canonical).digest('hex')!==record.wireHash)fail();
}
export function isVerifiedPerpsBroadcastReceipt(receipt){return !!receipt&&proofs.has(receipt);}
export async function readPerpsBroadcastReceipt(record,request=liveRpc,{now=Date.now,requireFinalized=false}={}){
 key(record?.walletAddress,32);key(record?.signature,64);
 if(typeof record?.wireHash!=='string'||!/^[a-f0-9]{64}$/.test(record.wireHash))fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const response=await request('getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}]);
 if(!Array.isArray(response?.value)||response.value.length!==1)fail();
 const status=response.value[0];if(status===null)return null;
 if(!['confirmed','finalized'].includes(status?.confirmationStatus))return null;
 if(requireFinalized&&status.confirmationStatus!=='finalized')return null;
 transactionError(status.err);
 // Releasing failed collateral requires rooted history, not a fork's
 // provisional failure that could still be replaced by successful execution.
 if(status.err!==null&&status.confirmationStatus!=='finalized')return null;
 const slot=integer(status.slot);if(integer(response.context?.slot)<slot)fail();
 const transaction=await request('getTransaction',[record.signature,{encoding:'base64',commitment:status.confirmationStatus==='finalized'?'finalized':'confirmed',maxSupportedTransactionVersion:0}]);
 if(transaction===null)return null;
 if(integer(transaction?.slot)!==slot||!Array.isArray(transaction.transaction)||transaction.transaction.length!==2||transaction.transaction[1]!=='base64')fail();
 if(!transaction.meta||!Object.hasOwn(transaction.meta,'err')||!Object.hasOwn(status,'err')
   ||JSON.stringify(transaction.meta.err)!==JSON.stringify(status.err))fail();
 transactionError(transaction.meta.err);
 wireIdentity(transaction.transaction[0],record);
 const observedAt=integer(now()),blockTime=integer(transaction.blockTime);
 if(blockTime*1000>observedAt+2000||!Number.isSafeInteger(blockTime*1000))fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const proof=Object.freeze({walletAddress:record.walletAddress,signature:record.signature,wireHash:record.wireHash,
  network:'solana-mainnet',slot,observedAt,confirmationStatus:status.confirmationStatus,executionDay:new Date(blockTime*1000).toISOString().slice(0,10),
  state:transaction.meta.err===null?'CONFIRMED':'FAILED'});
 proofs.add(proof);return proof;
}
async function liveRpc(method,params){
 if(!['getGenesisHash','getSignatureStatuses','getTransaction'].includes(method))fail();
 const response=await fetch('https://api.mainnet-beta.solana.com',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)fail();const text=await response.text();if(text.length>200000)fail();
 const body=JSON.parse(text);if(body.id!==1||body.jsonrpc!=='2.0'||body.error||!Object.hasOwn(body,'result'))fail();return body.result;
}
