// Fixed no-referral parent registration profile. Public builder output is
// independently reconstructed before it can become an unsigned simulation.
// This module has no signer, sender, provider authorization or default network.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress,createTransactionMessage,setTransactionMessageFeePayer,
 setTransactionMessageLifetimeUsingBlockhash,appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction} from '@solana/kit';
import {buildRegisterTraderIx,buildOnboardTraderDelegatedIx,decodePermission} from '@ellipsis-labs/rise';
import {PHOENIX_IDENTITIES as ID,phoenixKey,requirePhoenixUnsignedPlan} from './phoenix-market-plan.js';
import {requireFreshPhoenixNativeMarket} from './phoenix-native-market.js';
import {requireFreshPhoenixChainAccount,decodePhoenixRpcTrader,decodePhoenixRpcPayer} from './phoenix-chain-account.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';
const GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',LOG='GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS';
const ONBOARDER='EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z',PERMISSION='6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr';
const AUTHORITY='8wTcJdg4Xw3wnvmBu7Sokn3c2UnnHUhuB5g9sfeCMidR',GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const preparations=new WeakMap(),simulations=new WeakMap();
// Providers may shape account objects differently between calls; only these fields matter.
function sameAccount(a,b){if(a===null||b===null)return a===b;return a.owner===b.owner&&Number(a.lamports)===Number(b.lamports)&&JSON.stringify(a.data)===JSON.stringify(b.data);}
const fail=code=>{throw Error('PHOENIX_PARENT_'+code);};
const shape=ix=>({programAddress:ix.programAddress,accounts:ix.accounts.map(a=>({address:a.address,role:a.role})),data:[...ix.data]});
function raw(a,length){
 if(!a||a.owner!==ID.program||a.executable!==false||!Number.isSafeInteger(a.lamports)||a.lamports<0||a.data?.[1]!=='base64'||typeof a.data[0]!=='string')fail('PERMISSION');
 const b=Buffer.from(a.data[0],'base64');if(b.length!==length||b.toString('base64')!==a.data[0])fail('PERMISSION');return b;
}
function permission(a){const p=decodePermission(raw(a,168));
 if(p.permissionAuthority!==AUTHORITY||p.delegatedKey!==ONBOARDER||p.permission!==16n||p.expiresAtTimestamp!==0n||p.allowedSignerActions<0n)fail('PERMISSION');return p;
}
function bank(reply,length,slot){if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<slot||!Array.isArray(reply.value)||reply.value.length!==length)fail('BANK');return reply;}
const freezeIx=ix=>Object.freeze({...ix,accounts:Object.freeze(ix.accounts.map(Object.freeze)),data:Object.freeze(ix.data)});
export async function preparePhoenixParentOnboarding({plan,native,account,built,blockhash,lastValidBlockHeight}={}, {request,now=Date.now}={}){
 requirePhoenixUnsignedPlan(plan);if(plan.close||typeof request!=='function'||typeof now!=='function')fail('INPUT');phoenixKey(blockhash);
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1)fail('INPUT');
 function fresh(){requireFreshPhoenixNativeMarket(native,{plan,request});requireFreshPhoenixChainAccount(account,{walletAddress:plan.walletAddress,request,minimumSlot:plan.observedSlot});
  const at=now();if(!Number.isSafeInteger(at)||at<account.observedAt||at>=plan.expiresAt)fail('EXPIRED');}
 fresh();const wallet=plan.walletAddress,parent=account.subaccounts.find(a=>a.subaccountIndex===0);
 if(!parent||parent.exists)fail('ALREADY_REGISTERED');
 const [address]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['trader',bs58.decode(wallet),new Uint8Array([0]),new Uint8Array([0])]});
 if(parent.address!==address||wallet===ONBOARDER||built?.traderPda!==address||built.traderOnboarder!==ONBOARDER||built.txFeePayer!==wallet||
    built.maxPositions!==32||built.includeRegisterTrader!==true||!Array.isArray(built.instructions)||built.instructions.length!==2)fail('BUILDER');
 const protocol={programAddress:ID.program,logAuthorityAddress:LOG,globalConfigurationAddress:GLOBAL};
 const instructions=[buildRegisterTraderIx({...protocol,payer:wallet,trader:wallet,traderAccount:address,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0}),
  buildOnboardTraderDelegatedIx({...protocol,authority:ONBOARDER,permissionAccount:PERMISSION,traderAccount:address,
   globalTraderIndex:native.exchangeKeys.globalTraderIndex,activeTraderBuffer:native.exchangeKeys.activeTraderBuffer})].map(shape);
 let received;try{received=built.instructions.map(ix=>shape({programAddress:ix.programId,data:ix.data,accounts:ix.keys.map(a=>{
  if(typeof a.isSigner!=='boolean'||typeof a.isWritable!=='boolean')fail('BUILDER');return {address:a.pubkey,role:(a.isSigner?2:0)|(a.isWritable?1:0)};})}));}catch{fail('BUILDER');}
 if(JSON.stringify(received)!==JSON.stringify(instructions))fail('BUILDER');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const derived=await derivePhoenixWalletAccounts(wallet,plan.isolatedSubaccountIndex);
 const addresses=[wallet,ONBOARDER,PERMISSION,address,derived.usdcAta,derived.canonicalAta];
 // Token ATA identity is independently bound by the sealed account reader.
 if(addresses.some(a=>typeof a!=='string'))fail('ACCOUNT');
 const before=structuredClone(bank(await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:Math.max(account.observedSlot,native.observedSlot)}]),addresses.length,Math.max(account.observedSlot,native.observedSlot)));
 if(before.value[3]!==null)fail('ALREADY_REGISTERED');if(permission(before.value[2]).allowedSignerActions<1n)fail('PERMISSION');decodePhoenixRpcPayer(before.value[0]);fresh();
 let message=createTransactionMessage({version:'legacy'});message=setTransactionMessageFeePayer(wallet,message);
 message=setTransactionMessageLifetimeUsingBlockhash({blockhash,lastValidBlockHeight:BigInt(lastValidBlockHeight)},message);
 message=appendTransactionMessageInstructions(instructions.map(ix=>({...ix,data:Uint8Array.from(ix.data)})),message);
 const transaction=compileTransaction(message),encoded=getBase64EncodedWireTransaction(transaction),wire=Buffer.from(encoded,'base64');
 if(wire[0]!==2||wire.length>1232)fail('WIRE');
 const result=Object.freeze({stage:'PHOENIX_PARENT_UNSIGNED',walletAddress:wallet,parentAddress:address,onboarder:ONBOARDER,maxPositions:32,
  instructions:Object.freeze(instructions.map(freezeIx)),serializedTxBase64:encoded,messageBase64:wire.subarray(129).toString('base64'),
  messageHash:createHash('sha256').update(wire.subarray(129)).digest('hex'),lastValidBlockHeight,expiresAt:Math.min(plan.expiresAt,account.observedAt+10000),
  readyForSigning:false,requiresProtocolCosignature:true,requiresSameWireSimulation:true,requiresDurableOwnerConsent:true});
 preparations.set(result,{fresh,request,now,addresses,before,account});fresh();return result;
}
export function requirePhoenixParentOnboarding(value){const p=preparations.get(value);if(!p)fail('UNVERIFIED');p.fresh();if(p.now()>=value.expiresAt)fail('EXPIRED');return p;}
export async function simulatePhoenixParentOnboarding(value){
 const p=requirePhoenixParentOnboarding(value),{request,before,addresses}=p;
 const fee=await request('getFeeForMessage',[value.messageBase64,{commitment:'confirmed',minContextSlot:before.context.slot}]);
 if(!Number.isSafeInteger(fee?.context?.slot)||fee.context.slot<before.context.slot||fee.value!==10000)fail('FEE');
 const rent=await request('getMinimumBalanceForRentExemption',[1520,{commitment:'confirmed'}]);
 if(!Number.isSafeInteger(rent)||rent<1||rent>100000000)fail('RENT');requirePhoenixParentOnboarding(value);
 const response=await request('simulateTransaction',[value.serializedTxBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,
  commitment:'confirmed',minContextSlot:before.context.slot,accounts:{encoding:'base64',addresses}}]);
 if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<before.context.slot||response.value?.err!==null||
    !Array.isArray(response.value.accounts)||response.value.accounts.length!==addresses.length||!Number.isSafeInteger(response.value.unitsConsumed)||
    response.value.unitsConsumed<1||response.value.unitsConsumed>400000)fail('SIMULATION');
 const post=response.value.accounts,parent=decodePhoenixRpcTrader(post[3],{address:value.parentAddress,walletAddress:value.walletAddress,index:0});
 if(!parent.exists||!parent.authorityIsWallet||parent.maxPositions!==32||parent.capabilityFlags!==62||parent.positions.length||parent.quoteCollateralUnits!=='0'||
    parent.spotCollateralCount||parent.hasLockedDeposit||parent.hasSplineLiquidity||parent.conditionalOrderCount||parent.withdrawalQueued||post[3].lamports!==rent)fail('EFFECTS');
 if(BigInt(decodePhoenixRpcPayer(before.value[0]))-BigInt(decodePhoenixRpcPayer(post[0]))!==BigInt(fee.value+rent)||
    !sameAccount(post[1],before.value[1])||post[2].lamports!==before.value[2].lamports||
    [4,5].some(i=>!sameAccount(post[i],before.value[i])))fail('EFFECTS');
 // The SDK calls this field allowedSignerActions, but the native program
 // consumes exactly one remaining action on onboarding. It is not a bitmask.
 const expectedPermission=Buffer.from(raw(before.value[2],168));
 expectedPermission.writeBigInt64LE(permission(before.value[2]).allowedSignerActions-1n,96);
 if(!raw(post[2],168).equals(expectedPermission))fail('PERMISSION_EFFECT');requirePhoenixParentOnboarding(value);
 const result=Object.freeze({stage:'PHOENIX_PARENT_SIMULATED',walletAddress:value.walletAddress,parentAddress:value.parentAddress,
  messageHash:value.messageHash,networkFeeLamports:String(fee.value),rentLockedLamports:String(rent),maximumLamports:String(fee.value+rent),
  observedSlot:response.context.slot,readyForSigning:false,requiresProtocolCosignature:true});simulations.set(result,{preparation:value,request});return result;
}
export function requirePhoenixParentSimulation(value,{preparation,request}={}){const p=simulations.get(value);
 if(!p||p.preparation!==preparation||p.request!==request)fail('UNVERIFIED');requirePhoenixParentOnboarding(preparation);return value;
}
