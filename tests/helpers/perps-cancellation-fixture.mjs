// Synthetic unsigned owner/keeper slots, signed only by an unfunded fixture API
// seed. No mainnet wallet or submission transport is used by this helper.
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
export async function cancellationFixture(cleanup,{legacyClose=false,createAta=false,versioned=false,readonlyKeeper=false,mutate=()=>{}}={}){
 const owner=cleanup.walletAddress,exit=cleanup.pendingExits[0].address,mint=PERPS_CUSTODIES.USDC.mint;
 const derive=async who=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(who),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
 const [ownerAta,requestAta,ids]=await Promise.all([derive(owner),derive(exit),deriveServerPerpsIdentities({walletAddress:owner,asset:'SOL',side:'LONG'})]);
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,23)]),format:'der',type:'pkcs8'});
 const api=bs58.encode(createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32)),keeper=bs58.encode(Buffer.alloc(32,42));
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
 const blockhash=bs58.encode(Buffer.alloc(32,29)),lookup=bs58.encode(Buffer.alloc(32,43));
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
