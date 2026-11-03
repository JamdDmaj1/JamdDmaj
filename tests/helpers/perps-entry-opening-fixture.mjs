// Unfunded exact-wire opening model. RPC is mocked and has no send method.
import {generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
import {inspectServerPerpsPreparation} from '../../lib/perps-server-preparation.js';
import {inspectServerPerpsPreSwapPlan} from '../../lib/perps-server-preswap.js';
import {checkServerPerpsTokenPolicy} from '../../lib/perps-server-token-policy.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
export async function entryOpeningFixture(f,intent,binding,market){
 const ids=await deriveServerPerpsIdentities(intent),pair=generateKeyPairSync('ed25519'),api=bs58.encode(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32)),keeper=bs58.encode(Buffer.alloc(32,2));
 const roles=[keeper,api,f.walletAddress,f.wire.destination,ids.perpetuals,PERPS_POOL,ids.position,market.address,market.dovesAgOracle,market.oracle,market.address,market.dovesAgOracle,market.oracle,market.tokenAccount,PERPS_PROGRAM,PERPS_PROGRAM,TOKEN,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
 const readonly=[ids.perpetuals,TOKEN,SYSTEM,ids.eventAuthority,PERPS_PROGRAM,COMPUTE],signers=[f.walletAddress,keeper,api];
 const keys=[...signers,...new Set(roles.filter(k=>!signers.includes(k)&&!readonly.includes(k))),...readonly];
 const seconds=BigInt(f.receiptOptions.now()/1000);
 const data=Buffer.alloc(42);Buffer.from('a47e44b6dfa640b7','hex').copy(data);data.writeBigUInt64LE(30000000n,8);data[16]=1;data.writeBigUInt64LE(f.received,17);data[25]=1;data.writeBigUInt64LE(100500000n,26);data.writeBigUInt64LE(seconds,34);
 const ix=(program,accounts,bytes)=>Buffer.concat([Buffer.from([keys.indexOf(program),accounts.length,...accounts.map(k=>keys.indexOf(k)),bytes.length]),bytes]);
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(100000,1);const priority=Buffer.alloc(9);priority[0]=3;priority.writeBigUInt64LE(1000n,1);
 const message=Buffer.concat([Buffer.from([3,1,readonly.length,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(f.wire.blockhash)),Buffer.from([3]),ix(COMPUTE,[],budget),ix(COMPUTE,[],priority),ix(PERPS_PROGRAM,roles,data)]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,pair.privateKey),message]).toString('base64');
 const preparation={serializedTxBase64:wire,positionPubkey:ids.position,txMetadata:{blockhash:f.wire.blockhash,lastValidBlockHeight:'1000'}};
 const position=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(position);
 for(const [offset,key]of [[8,f.walletAddress],[40,PERPS_POOL],[72,market.address],[104,market.address]])Buffer.from(bs58.decode(key)).copy(position,offset);
 position.writeBigUInt64LE(seconds-1n,136);position.writeBigUInt64LE(seconds,144);position[152]=1;position.writeBigUInt64LE(100000000n,153);position.writeBigUInt64LE(30000000n,161);position.writeBigUInt64LE(9990000n,169);position[209]=ids.positionBump;
 const before=new Map(),after=new Map();for(const key of [f.walletAddress,f.wire.destination,f.wire.source]){before.set(key,structuredClone(f.after.get(key)));after.set(key,structuredClone(f.after.get(key)));}
 after.get(f.walletAddress).lamports-=2005400;after.set(f.wire.destination,f.token(f.walletAddress,market.mint,17n));
 after.set(ids.position,{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[position.toString('base64'),'base64']});
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return params[0].minContextSlot+1;if(method==='getBlockHeight')return 5;
  if(method==='getMultipleAccounts'){
   if(params[0].length===2&&params[0][0]===market.address){
    const native=structuredClone(f.before.get(market.address)),b=Buffer.from(native.data[0],'base64');b[202]=1;native.data[0]=b.toString('base64');
    return {context:{slot:params[1].minContextSlot+1},value:[native,f.before.get(f.u.address)]};
   }
   return {context:{slot:params[1].minContextSlot+1},value:params[0].map(k=>before.get(k)??null)};
  }
  if(method==='getFeeForMessage')return {context:{slot:params[1].minContextSlot+1},value:5400};
  if(method==='getMinimumBalanceForRentExemption')return 2000000;
  if(method==='simulateTransaction')return {context:{slot:params[1].minContextSlot+1},value:{err:null,unitsConsumed:90000,accounts:params[1].accounts.addresses.map(k=>after.get(k)??null)}};
  throw Error('WRITE_OR_UNEXPECTED_RPC');
 };
 const inspection=await inspectServerPerpsPreparation(preparation,intent,{request,nowSeconds:Number(seconds),minimumSlot:binding.slot});
 const fundingPlan=await inspectServerPerpsPreSwapPlan(inspection,intent,f.u,market,{entryBinding:binding});
 const tokenPolicy=await checkServerPerpsTokenPolicy(inspection,intent);
 return {before,after,request,builderRequest:async()=>Response.json({...preparation,quote:{side:'long'}}),prepared:{stage:inspection.stage,preparation,intent,inspection,fundingPlan,tokenPolicy,custody:{...ids,observedSlot:inspection.observedSlot,market,collateral:market,usdc:f.u}}};
}
