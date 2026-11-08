// Exact wallet-only setup wire/effects. No deposit, order, signer or sender.
import {createHash} from 'node:crypto';
import {createTransactionMessage,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash,
 appendTransactionMessageInstructions,compileTransaction,getBase64EncodedWireTransaction} from '@solana/kit';
import {requirePhoenixIsolatedSetup} from './phoenix-isolated-setup.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';
import {decodePhoenixRpcToken,decodePhoenixRpcTrader,decodePhoenixRpcPayer} from './phoenix-chain-account.js';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',COMPUTE='ComputeBudget111111111111111111111111111111';
const wires=new WeakMap(),simulations=new WeakMap();
const fail=code=>{throw Error('PHOENIX_CHILD_SETUP_'+code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameRawAccount=(a,b)=>a===null||b===null?a===b:a.owner===b.owner&&a.executable===b.executable&&a.lamports===b.lamports&&a.data?.[0]===b.data?.[0]&&a.data?.[1]===b.data?.[1];
const integer=v=>{if(!Number.isSafeInteger(v)||v<0)fail('NUMBER');return v;};
function bank(value,count,slot){if(!Number.isSafeInteger(value?.context?.slot)||value.context.slot<slot||!Array.isArray(value.value)||value.value.length!==count)fail('BANK');return value;}
export function buildPhoenixChildSetupWire(setup,{blockhash,lastValidBlockHeight,computeUnitLimit=300000,computeUnitPriceMicroLamports=1000}={}){
 requirePhoenixIsolatedSetup(setup);phoenixKey(blockhash);
 if(!setup.instructions.length)fail('NO_TRANSACTION');
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1||!Number.isInteger(computeUnitLimit)||computeUnitLimit<100000||computeUnitLimit>1000000||
    !Number.isInteger(computeUnitPriceMicroLamports)||computeUnitPriceMicroLamports<0||computeUnitPriceMicroLamports>10000)fail('BUDGET');
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(computeUnitLimit,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(BigInt(computeUnitPriceMicroLamports),1);
 const instructions=[{programAddress:COMPUTE,accounts:[],data:limit},{programAddress:COMPUTE,accounts:[],data:price},...setup.instructions.map(ix=>({...ix,data:Uint8Array.from(ix.data)}))];
 let message=createTransactionMessage({version:'legacy'});message=setTransactionMessageFeePayer(setup.walletAddress,message);
 message=setTransactionMessageLifetimeUsingBlockhash({blockhash,lastValidBlockHeight:BigInt(lastValidBlockHeight)},message);
 message=appendTransactionMessageInstructions(instructions,message);const compiled=compileTransaction(message),encoded=getBase64EncodedWireTransaction(compiled),raw=Buffer.from(encoded,'base64');
 if(raw.length>1232||raw[0]!==1||raw.subarray(1,65).some(n=>n!==0))fail('WIRE');
 requirePhoenixIsolatedSetup(setup);
 const wire=Object.freeze({stage:'PHOENIX_CHILD_SETUP_WIRE',walletAddress:setup.walletAddress,subaccountIndex:setup.subaccountIndex,parentAddress:setup.parentAddress,traderAddress:setup.traderAddress,
  serializedTxBase64:encoded,messageBase64:Buffer.from(compiled.messageBytes).toString('base64'),messageHash:createHash('sha256').update(compiled.messageBytes).digest('hex'),
  blockhash,lastValidBlockHeight,computeUnitLimit,computeUnitPriceMicroLamports,expiresAt:setup.expiresAt,readyForSigning:false,requiresDurableOwnerConsent:true});
 wires.set(wire,{setup});return wire;
}
export function requirePhoenixChildSetupWire(wire){const p=wires.get(wire);if(!p)fail('UNVERIFIED');return Object.freeze({...requirePhoenixIsolatedSetup(p.setup),wire});}
function semanticWithoutSweep(value){const copy={...value};delete copy.disableCollateralSweep;return copy;}
export async function simulatePhoenixChildSetup(wire,{request}={}){
 const proof=requirePhoenixChildSetupWire(wire),{setup,account,native,plan}=proof;
 if(typeof request!=='function'||proof.request!==request)fail('INPUT');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');
 const a=await derivePhoenixWalletAccounts(wire.walletAddress,wire.subaccountIndex),addresses=[wire.walletAddress,a.usdcAta,a.canonicalAta,setup.parentAddress,a.trader];
 const minimum=Math.max(account.observedSlot,native.observedSlot,plan.observedSlot);
 const before=structuredClone(bank(await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:account.commitment,minContextSlot:minimum}]),5,minimum));
 const parent=account.subaccounts.find(v=>v.subaccountIndex===0),child=account.subaccounts.find(v=>v.subaccountIndex===setup.subaccountIndex);
 const decode=(values)=>({payer:decodePhoenixRpcPayer(values[0]),usdc:decodePhoenixRpcToken(values[1],{mint:ID.usdc,owner:wire.walletAddress}),
  canonical:decodePhoenixRpcToken(values[2],{mint:ID.canonicalUsdc,owner:wire.walletAddress}),parent:decodePhoenixRpcTrader(values[3],{address:setup.parentAddress,walletAddress:wire.walletAddress,index:0}),
  child:decodePhoenixRpcTrader(values[4],{address:a.trader,walletAddress:wire.walletAddress,index:setup.subaccountIndex})});
 const snapshot=decode(before.value);
 if(snapshot.payer!==account.payerLamports||!same(snapshot.usdc,account.usdc)||!same(snapshot.canonical,account.canonical)||!same(snapshot.parent,parent)||!same(snapshot.child,child))fail('SNAPSHOT_CHANGED');
 const fee=await request('getFeeForMessage',[wire.messageBase64,{commitment:account.commitment,minContextSlot:before.context.slot}]);
 const expectedFee=5000+Number((BigInt(wire.computeUnitLimit)*BigInt(wire.computeUnitPriceMicroLamports)+999999n)/1000000n);
 if(!Number.isSafeInteger(fee?.context?.slot)||fee.context.slot<before.context.slot||fee.value!==expectedFee)fail('FEE');
 const rent=setup.createsAccount?integer(await request('getMinimumBalanceForRentExemption',[280,{commitment:account.commitment}])):0;
 if(rent>10000000||setup.createsAccount&&rent<1)fail('RENT');requirePhoenixChildSetupWire(wire);
 const response=await request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,
  commitment:account.commitment,minContextSlot:fee.context.slot,accounts:{encoding:'base64',addresses}}]);
 requirePhoenixChildSetupWire(wire);
 if(!Number.isSafeInteger(response?.context?.slot)||response.context.slot<fee.context.slot||response.value?.err!==null||!Array.isArray(response.value.accounts)||response.value.accounts.length!==5||
    !Number.isSafeInteger(response.value.unitsConsumed)||response.value.unitsConsumed<1||response.value.unitsConsumed>wire.computeUnitLimit)fail('SIMULATION');
 const raw=response.value.accounts,after=decode(raw);
 if(!same(snapshot.usdc,after.usdc)||!same(snapshot.canonical,after.canonical)||!sameRawAccount(before.value[1],raw[1])||!sameRawAccount(before.value[2],raw[2]))fail('TOKENS_CHANGED');
 if(!after.parent.disableCollateralSweep||!same(semanticWithoutSweep(parent),semanticWithoutSweep(after.parent))||before.value[3].lamports!==raw[3].lamports)fail('PARENT_CHANGED');
 const post=after.child;
 if(!post.exists||!post.authorityIsWallet||!post.disableCollateralSweep||post.maxPositions!==1||post.positions.some(p=>p.baseLots!=='0'||p.virtualQuoteLots!=='0')||post.quoteCollateralUnits!=='0'||
    post.withdrawalQueued||post.hasLockedDeposit||post.hasSplineLiquidity||post.spotCollateralCount||post.conditionalOrderCount)fail('CHILD_CHANGED');
 if(setup.createsAccount){
  if(post.positions.length||post.capabilityFlags!==parent.capabilityFlags||post.disablePositionAuthoritySwap!==parent.disablePositionAuthoritySwap||raw[4].lamports!==rent||Buffer.from(raw[4].data[0],'base64').length!==280)fail('CHILD_CHANGED');
 }else if(!same(semanticWithoutSweep(child),semanticWithoutSweep(post))||before.value[4].lamports!==raw[4].lamports)fail('CHILD_CHANGED');
 if(BigInt(snapshot.payer)-BigInt(after.payer)!==BigInt(expectedFee+rent))fail('SOL_CHANGED');
 if(await request('getGenesisHash',[])!==GENESIS)fail('NETWORK');requirePhoenixChildSetupWire(wire);
 const result=Object.freeze({stage:'PHOENIX_CHILD_SETUP_SIMULATED',walletAddress:wire.walletAddress,subaccountIndex:wire.subaccountIndex,messageHash:wire.messageHash,
  parentAddress:setup.parentAddress,traderAddress:a.trader,createsAccount:setup.createsAccount,networkFeeLamports:String(expectedFee),rentLockedLamports:String(rent),
  maximumLamports:String(expectedFee+rent),observedSlot:response.context.slot,readyForSigning:false,authorizesTrading:false,requiresFinalizedReconciliation:true});
 simulations.set(result,{wire,request});return result;
}
export function requirePhoenixChildSetupSimulation(value,{wire,request}={}){const p=simulations.get(value);
 if(!p||p.wire!==wire||p.request!==request)fail('UNVERIFIED');requirePhoenixChildSetupWire(wire);return value;
}
