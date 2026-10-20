// Synthetic unsigned owner/keeper slots, signed only by an unfunded fixture API
// seed. No mainnet wallet or submission transport is used by this helper.
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
export async function cancellationFixture(cleanup,{legacyClose=false,createAta=false,versioned=false,readonlyKeeper=false,blockhashByte=29,mutate=()=>{}}={}){
 const owner=cleanup.walletAddress,exit=cleanup.pendingExits[0].address,mint=PERPS_CUSTODIES.USDC.mint;
 const derive=async who=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(who),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
 const [ownerAta,requestAta,ids]=await Promise.all([derive(owner),derive(exit),deriveServerPerpsIdentities({walletAddress:owner,asset:'SOL',side:'LONG'})]);
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,23)]),format:'der',type:'pkcs8'});
 const keeperPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,42)]),format:'der',type:'pkcs8'});
 const api=bs58.encode(createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32)),keeper=bs58.encode(createPublicKey(keeperPrivate).export({format:'der',type:'spki'}).subarray(-32));
 const writable=[ownerAta,PERPS_POOL,exit,...versioned?[]:[requestAta]],readonly=[ids.position,mint,TOKEN,SYSTEM,ATA,ids.eventAuthority,PERPS_PROGRAM,COMPUTE];
 const keys=[owner,keeper,api,...writable,...readonly],resolvedKeys=[...keys,...versioned?[requestAta]:[]],index=key=>resolvedKeys.indexOf(key);
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(200000,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(1000n,1);
 const instructions=[{program:index(COMPUTE),accounts:[],data:limit},{program:index(COMPUTE),accounts:[],data:price}];
 if(createAta)instructions.push({program:index(ATA),accounts:[owner,ownerAta,owner,mint,SYSTEM,TOKEN].map(index),data:Buffer.from([1])});
 instructions.push({program:index(PERPS_PROGRAM),accounts:(legacyClose
  ?[keeper,owner,ownerAta,PERPS_POOL,exit,requestAta,ids.position,TOKEN,ids.eventAuthority,PERPS_PROGRAM]
  :[keeper,owner,ownerAta,PERPS_POOL,exit,requestAta,ids.position,mint,TOKEN,SYSTEM,ATA,ids.eventAuthority,PERPS_PROGRAM]).map(index),
  data:Buffer.from(legacyClose?'2869d9bcdc2d6d6e':'7944a21cd82fc842','hex')});
 mutate({keys,resolvedKeys,instructions,index,ownerAta,requestAta,keeper,owner,exit,mint,ids});
 const blockhash=bs58.encode(Buffer.alloc(32,blockhashByte)),lookup=bs58.encode(Buffer.alloc(32,43));
 const header=Buffer.from([...(versioned?[128]:[]),3,readonlyKeeper?2:1,readonly.length,keys.length]);
 const message=Buffer.concat([header,...keys.map(key=>Buffer.from(bs58.decode(key))),Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),
  ...instructions.map(ix=>Buffer.concat([Buffer.from([ix.program,ix.accounts.length,...ix.accounts,ix.data.length]),ix.data])),
  ...versioned?[Buffer.from([1]),Buffer.from(bs58.decode(lookup)),Buffer.from([1,0,0])]:[]]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,apiPrivate),message]);
 const calls=[],request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return cleanup.requestObservedSlot;
  if(method==='getMultipleAccounts'&&params[0][0]===lookup){const data=Buffer.alloc(88);data.writeUInt32LE(1);data.writeBigUInt64LE(18446744073709551615n,4);Buffer.from(bs58.decode(requestAta)).copy(data,56);
   return {context:{slot:cleanup.requestObservedSlot},value:[{owner:'AddressLookupTab1e1111111111111111111111111',executable:false,data:[data.toString('base64'),'base64']}]};}
  throw Error('unexpected fixture-only RPC');
 };
 return {preparation:{serializedTxBase64:wire.toString('base64'),txMetadata:{blockhash,lastValidBlockHeight:'600000'}},request,calls,exitAddress:exit};
}

export function cancellationSimulationFixture(inspection,{requestAccount,positionAccount,newOwnerAta=false,requestTokens=2500000n}={}){
 const system=lamports=>({owner:SYSTEM,executable:false,lamports,data:['','base64']});
 const token=(owner,amount)=>{const data=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(data);Buffer.from(bs58.decode(owner)).copy(data,32);data.writeBigUInt64LE(amount,64);data[108]=1;
  return {owner:TOKEN,executable:false,lamports:2039280,data:[data.toString('base64'),'base64']};};
 const wallet=inspection.walletAddress,keeper=inspection.resolvedKeys[1],fee=15200,oldTokens=newOwnerAta?0n:1000000n;
 const before={
  [wallet]:system(100000000),[keeper]:system(10000000),[inspection.ownerAta]:newOwnerAta?null:token(wallet,oldTokens),
  [PERPS_POOL]:{owner:PERPS_PROGRAM,executable:false,lamports:10000000,data:[createHash('sha256').update('account:Pool').digest().subarray(0,8).toString('base64'),'base64']},
  [inspection.exitAddress]:structuredClone(requestAccount),[inspection.requestAta]:token(inspection.exitAddress,requestTokens),[inspection.positionAddress]:structuredClone(positionAccount)
 };
 const after=structuredClone(before);after[inspection.exitAddress]=null;after[inspection.requestAta]=null;
 after[inspection.ownerAta]=token(wallet,oldTokens+requestTokens);
 after[wallet].lamports+=Number(requestAccount.lamports)+2039280-fee-(newOwnerAta?2039280:0);
 const calls=[],state={before,after,slot:inspection.observedSlot,fee,height:500001,err:null,unitsConsumed:100000,replacementBlockhash:null,rent:2039280};
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return state.slot;
  if(method==='getBlockHeight')return state.height;
  if(method==='getMultipleAccounts')return {context:{slot:state.slot},value:params[0].map(address=>structuredClone(state.before[address]??null))};
  if(method==='getFeeForMessage')return {context:{slot:state.slot},value:state.fee};
  if(method==='simulateTransaction')return {context:{slot:state.slot},value:{err:state.err,unitsConsumed:state.unitsConsumed,replacementBlockhash:state.replacementBlockhash,
   accounts:params[1].accounts.addresses.map(address=>structuredClone(state.after[address]??null))}};
  if(method==='getMinimumBalanceForRentExemption')return state.rent;
  throw Error('unexpected fixture-only simulation method');
 };
 return {state,calls,request};
}

export function cancellationReceiptFixture(inspection,now,{err=null,confirmationStatus='finalized',slot=499999,newOwnerAta=false,requestTokens=2500000n}={}){
 const ownerPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,68)]),format:'der',type:'pkcs8'});
 const keeperPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,42)]),format:'der',type:'pkcs8'});
 if(bs58.encode(createPublicKey(ownerPrivate).export({format:'der',type:'spki'}).subarray(-32))!==inspection.walletAddress)throw Error('UNFUNDED_FIXTURE_IDENTITY_ONLY');
 const wire=Buffer.from(inspection.envelope.serializedTxBase64,'base64'),message=wire.subarray(193);
 sign(null,message,ownerPrivate).copy(wire,1);const partial=Buffer.from(wire);sign(null,message,keeperPrivate).copy(wire,65);
 const record={walletAddress:inspection.walletAddress,signature:bs58.encode(wire.subarray(1,65)),wireHash:createHash('sha256').update(partial).digest('hex')};
 const keys=inspection.resolvedKeys,index=key=>keys.indexOf(key),ownerAta=index(inspection.ownerAta),requestIndex=index(inspection.exitAddress),requestAta=index(inspection.requestAta);
 const pre=keys.map(()=>1);pre[0]=100000000;pre[1]=10000000;pre[index(PERPS_POOL)]=10000000;pre[index(inspection.positionAddress)]=2000000;
 pre[ownerAta]=newOwnerAta?0:2039280;pre[requestIndex]=2000000;pre[requestAta]=2039280;
 const post=[...pre],fee=15200,old=newOwnerAta?0n:1000000n;
 post[0]+=pre[requestIndex]+pre[requestAta]-fee-(newOwnerAta?2039280:0);post[requestIndex]=0;post[requestAta]=0;post[ownerAta]=2039280;
 const balance=(accountIndex,owner,amount)=>({accountIndex,owner,mint:PERPS_CUSTODIES.USDC.mint,programId:TOKEN,uiTokenAmount:{amount:amount.toString(),decimals:6}});
 const preTokenBalances=[...newOwnerAta?[]:[balance(ownerAta,inspection.walletAddress,old)],balance(requestAta,inspection.exitAddress,requestTokens)];
 const postTokenBalances=[balance(ownerAta,inspection.walletAddress,old+requestTokens)],staticCount=inspection.envelope.staticKeys.length;
 const writableCount=inspection.envelope.lookups.reduce((n,table)=>n+table.writable.length,0);
 const status={slot,confirmationStatus,err},transaction={slot,blockTime:now/1000-1,transaction:[wire.toString('base64'),'base64'],meta:{err,fee,innerInstructions:[],
  loadedAddresses:{writable:keys.slice(staticCount,staticCount+writableCount),readonly:keys.slice(staticCount+writableCount)},preBalances:pre,
  postBalances:err===null?post:pre.map((value,i)=>i===0?value-fee:value),preTokenBalances,postTokenBalances:err===null?postTokenBalances:structuredClone(preTokenBalances)}};
 const calls=[],request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:500010},value:[status]};if(method==='getTransaction')return transaction;
  throw Error('unexpected fixture-only receipt method');
 };
 return {record,status,transaction,request,calls};
}
