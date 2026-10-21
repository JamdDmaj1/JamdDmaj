// Unfunded, in-memory finalized-transaction model. Invalid fixed blockhash,
// ephemeral owner key, no network or sending method. Not a real transaction.
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey,sign,createHash} from 'node:crypto';
import bs58 from 'bs58';
import {conversionFixture} from './perps-conversion-fixture.mjs';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',hash=b=>createHash('sha256').update(b).digest('hex');
export async function conversionReceiptFixture({identityPoint=false,fixturePrivateKey=null,finalizedSlot=120,...options}={}){
 const pair=fixturePrivateKey?{privateKey:fixturePrivateKey,publicKey:createPublicKey(fixturePrivateKey)}:generateKeyPairSync('ed25519'),publicKey=identityPoint?Buffer.from([1,...Array(31).fill(0)]):pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
 const f=await conversionFixture({...options,walletAddress:bs58.encode(publicKey)}),message=Buffer.from(f.wire.messageBase64,'base64');
 const signature=identityPoint?Buffer.from([1,...Array(63).fill(0)]):sign(null,message,pair.privateKey),signed=Buffer.concat([Buffer.from([1]),signature,message]);
 const keys=Array.from({length:message[3]},(_,i)=>bs58.encode(message.subarray(4+i*32,36+i*32))),index=k=>{const i=keys.indexOf(k);assert.ok(i>=0);return i;};
 const ids=await deriveServerPerpsIdentities({walletAddress:f.walletAddress,asset:f.wire.asset,side:'LONG'}),coreIndex=f.wire.nativeSolInput?6:3;
 const balances=map=>keys.map(k=>Number(map.get(k)?.lamports??0));
 const tokens=map=>keys.flatMap((k,i)=>{
  const a=map.get(k);if(a?.owner!==TOKEN)return [];const b=Buffer.from(a.data[0],'base64'),mint=bs58.encode(b.subarray(0,32));
  return [{accountIndex:i,mint,owner:bs58.encode(b.subarray(32,64)),programId:TOKEN,uiTokenAmount:{amount:b.readBigUInt64LE(64).toString(),decimals:mint===f.c.mint?f.c.decimals:f.u.decimals}}];
 });
 const transfer=(source,destination,authority,amount)=>{
  const b=Buffer.alloc(9);b[0]=3;b.writeBigUInt64LE(amount,1);return {programIdIndex:index(TOKEN),accounts:[source,destination,authority].map(index),data:bs58.encode(b),stackHeight:2};
 };
 const gross=f.amount*100000000n/10n**BigInt(f.c.decimals),event=Buffer.alloc(216);
 Buffer.from('e445a52e51cb9a1d286bd41adf8827dc','hex').copy(event);
 for(const [at,key]of [[16,f.c.address],[48,f.u.address],[80,PERPS_POOL],[152,f.walletAddress],[184,f.wire.destination]])Buffer.from(bs58.decode(key)).copy(event,at);
 for(const [at,n]of [[112,f.amount],[120,gross],[128,gross],[136,f.received],[144,50n]])event.writeBigUInt64LE(n,at);
 const meta={err:null,fee:5400,preBalances:balances(f.before),postBalances:balances(f.after),preTokenBalances:tokens(f.before),postTokenBalances:tokens(f.after),
  innerInstructions:[{index:coreIndex,instructions:[transfer(f.wire.source,f.c.tokenAccount,f.walletAddress,f.amount),transfer(f.u.tokenAccount,f.wire.destination,ids.transferAuthority,f.received),
   {programIdIndex:index(PERPS_PROGRAM),accounts:[index(ids.eventAuthority)],data:bs58.encode(event),stackHeight:2}]}]};
 const time=f.options.now(),identity={signature:bs58.encode(signature),wireHash:hash(signed),createdAt:time-1000,minimumSlot:105};
 const status={confirmationStatus:'finalized',slot:finalizedSlot,err:null},transaction={slot:finalizedSlot,blockTime:time/1000,transaction:[signed.toString('base64'),'base64'],meta};
 let elapsed=0;const calls=[],request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:Math.max(130,finalizedSlot+10)},value:[status]};if(method==='getTransaction')return transaction;throw Error('WRITE_OR_UNEXPECTED_RPC');
 };
 return {...f,identity,status,transaction,keys,index,event,coreIndex,calls,request,receiptOptions:{request,now:()=>time,monotonicNow:()=>elapsed},expire(){elapsed=10001;},backward(){elapsed=-1;}};
}
