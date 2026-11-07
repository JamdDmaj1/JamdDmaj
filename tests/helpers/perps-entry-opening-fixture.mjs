// Unfunded exact-wire opening model. RPC is mocked and has no send method.
import {generateKeyPairSync,sign,verify,createHash} from 'node:crypto';
import eventLayout from '../../lib/perps-event-layout.json' with {type:'json'};
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {exactUsdUnits} from '../../lib/jupiter-perps-order.js';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
import {inspectServerPerpsPreparation} from '../../lib/perps-server-preparation.js';
import {inspectServerPerpsPreSwapPlan} from '../../lib/perps-server-preswap.js';
import {checkServerPerpsTokenPolicy} from '../../lib/perps-server-token-policy.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
export async function entryOpeningFixture(f,intent,binding,market){
 const keeperPair=generateKeyPairSync('ed25519');
 const ids=await deriveServerPerpsIdentities(intent),pair=generateKeyPairSync('ed25519'),api=bs58.encode(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32)),keeper=bs58.encode(keeperPair.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const roles=[keeper,api,f.walletAddress,f.wire.destination,ids.perpetuals,PERPS_POOL,ids.position,market.address,market.dovesAgOracle,market.oracle,market.address,market.dovesAgOracle,market.oracle,market.tokenAccount,PERPS_PROGRAM,PERPS_PROGRAM,TOKEN,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
 const seconds=BigInt(f.receiptOptions.now()/1000);
 const ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',exits=[];
 for(const [kind,price,counter]of [['SL',intent.stopLoss,1n],['TP',intent.takeProfit,2n]])if(price!=null){
  const data=Buffer.alloc(50);Buffer.from('7562427f1e3249b9','hex').copy(data);data.writeBigUInt64LE(30000000n,16);
  data.writeBigUInt64LE(BigInt(exactUsdUnits(price)),24);data[32]=kind==='TP'?1:0;data.writeBigUInt64LE(counter,34);data.writeBigUInt64LE(seconds,42);
  const [address,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),data.subarray(34,42),new Uint8Array([2])]});
  const [token]=await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(address),bs58.decode(TOKEN),bs58.decode(f.u.mint)]});
  exits.push({kind,address,bump,token,data,roles:[keeper,api,f.walletAddress,f.wire.source,ids.perpetuals,PERPS_POOL,ids.position,address,token,market.address,market.dovesAgOracle,market.oracle,market.address,f.u.mint,PERPS_PROGRAM,TOKEN,ATA,SYSTEM,ids.eventAuthority,PERPS_PROGRAM]});
 }
 const readonly=[ids.perpetuals,TOKEN,SYSTEM,ids.eventAuthority,PERPS_PROGRAM,COMPUTE,...(exits.length?[ATA]:[])],signers=[f.walletAddress,keeper,api];
 const allRoles=[...roles,...exits.flatMap(exit=>exit.roles)];
 const keys=[...signers,...new Set(allRoles.filter(k=>!signers.includes(k)&&!readonly.includes(k))),...readonly];
 const data=Buffer.alloc(42);Buffer.from('a47e44b6dfa640b7','hex').copy(data);data.writeBigUInt64LE(30000000n,8);data[16]=1;data.writeBigUInt64LE(f.received,17);data[25]=1;data.writeBigUInt64LE(100500000n,26);data.writeBigUInt64LE(seconds,34);
 const ix=(program,accounts,bytes)=>Buffer.concat([Buffer.from([keys.indexOf(program),accounts.length,...accounts.map(k=>keys.indexOf(k)),bytes.length]),bytes]);
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(100000,1);const priority=Buffer.alloc(9);priority[0]=3;priority.writeBigUInt64LE(1000n,1);
 const message=Buffer.concat([Buffer.from([3,1,readonly.length,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(f.wire.blockhash)),Buffer.from([3+exits.length]),ix(COMPUTE,[],budget),ix(COMPUTE,[],priority),ix(PERPS_PROGRAM,roles,data),...exits.map(exit=>ix(PERPS_PROGRAM,exit.roles,exit.data))]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,pair.privateKey),message]).toString('base64');
 const preparation={serializedTxBase64:wire,positionPubkey:ids.position,txMetadata:{blockhash:f.wire.blockhash,lastValidBlockHeight:'1000'}};
 const position=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(position);
 for(const [offset,key]of [[8,f.walletAddress],[40,PERPS_POOL],[72,market.address],[104,market.address]])Buffer.from(bs58.decode(key)).copy(position,offset);
 position.writeBigUInt64LE(seconds-1n,136);position.writeBigUInt64LE(seconds,144);position[152]=1;position.writeBigUInt64LE(100000000n,153);position.writeBigUInt64LE(30000000n,161);position.writeBigUInt64LE(9990000n,169);position[209]=ids.positionBump;
 const before=new Map(),after=new Map();for(const key of [f.walletAddress,f.wire.destination,f.wire.source]){before.set(key,structuredClone(f.after.get(key)));after.set(key,structuredClone(f.after.get(key)));}
 after.get(f.walletAddress).lamports-=2005400+exits.length*4039280;after.set(f.wire.destination,f.token(f.walletAddress,market.mint,17n));
 for(const exit of exits){
  const b=Buffer.alloc(230);Buffer.from('0c26fac72e9a20d8','hex').copy(b);
  for(const [offset,key]of [[8,f.walletAddress],[40,PERPS_POOL],[72,market.address],[104,ids.position],[136,f.u.mint]])Buffer.from(bs58.decode(key)).copy(b,offset);
  b.writeBigUInt64LE(seconds,168);b.writeBigUInt64LE(seconds,176);b.writeBigUInt64LE(30000000n,184);
  b[200]=2;b[201]=1;b[202]=1;b[206]=1;b.writeBigUInt64LE(exit.data.readBigUInt64LE(24),207);b[215]=1;b[216]=exit.data[32];b[217]=1;
  b.writeBigUInt64LE(exit.data.readBigUInt64LE(34),220);b[228]=exit.bump;
  after.set(exit.address,{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']});after.set(exit.token,f.token(exit.address,f.u.mint,0n));
 }
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
  if(method==='getMinimumBalanceForRentExemption')return params[0]===165?2039280:2000000;
  if(method==='simulateTransaction')return {context:{slot:params[1].minContextSlot+1},value:{err:null,unitsConsumed:90000,accounts:params[1].accounts.addresses.map(k=>after.get(k)??null)}};
  throw Error('WRITE_OR_UNEXPECTED_RPC');
 };
 const inspection=await inspectServerPerpsPreparation(preparation,intent,{request,nowSeconds:Number(seconds),minimumSlot:binding.slot});
 const fundingPlan=await inspectServerPerpsPreSwapPlan(inspection,intent,f.u,market,{entryBinding:binding});
 const tokenPolicy=await checkServerPerpsTokenPolicy(inspection,intent);
 // Test-only keeper for this exact generated message, never a general signer.
 const completeFixtureKeeperSignature=encoded=>{
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded||bytes[0]!==3||!bytes.subarray(193).equals(message)
   ||!bytes.subarray(65,129).equals(Buffer.alloc(64))
   ||!verify(null,message,pair.publicKey,bytes.subarray(129,193)))throw Error('FIXTURE_MESSAGE_REQUIRED');
  sign(null,message,keeperPair.privateKey).copy(bytes,65);return bytes.toString('base64');
 };
 const schema=eventLayout.events.find(e=>e.name==='InstantIncreasePositionEvent'),fields={};
 for(const [name,type]of schema.fields)fields[name]=typeof type==='object'?null:type==='publicKey'?f.walletAddress:type==='bool'?false:type==='u8'?0:'0';
 Object.assign(fields,{owner:f.walletAddress,pool:PERPS_POOL,positionKey:ids.position,positionSide:1,positionMint:market.mint,
  positionCustody:market.address,positionCollateralCustody:market.address,sizeUsdDelta:'30000000',feeUsd:'10000'});
 if(Object.hasOwn(fields,'positionCollateralMint'))fields.positionCollateralMint=market.mint;
 const encode=(type,value)=>{
  if(typeof type==='object')return Buffer.from([0]);if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);
  const bytes=Buffer.alloc(8);if(type==='i64')bytes.writeBigInt64LE(BigInt(value));else bytes.writeBigUInt64LE(BigInt(value));return bytes;
 };
 const event=Buffer.concat([createHash('sha256').update('event:'+schema.name).digest().subarray(0,8),...schema.fields.map(([name,type])=>encode(type,fields[name]))]);
 const fixtureTradeMeta={err:null,fee:5400,loadedAddresses:{writable:[],readonly:[]},innerInstructions:[{index:2,instructions:[{
  programIdIndex:keys.indexOf(PERPS_PROGRAM),accounts:[keys.indexOf(ids.eventAuthority)],stackHeight:2,
  data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),event]))}]}]};
 return {before,after,request,completeFixtureKeeperSignature,fixtureTradeMeta,builderRequest:async()=>Response.json({...preparation,quote:{side:'long'}}),prepared:{stage:inspection.stage,preparation,intent,inspection,fundingPlan,tokenPolicy,custody:{...ids,observedSlot:inspection.observedSlot,market,collateral:market,usdc:f.u}}};
}
