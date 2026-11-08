import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {buildPlaceMarketOrderIx,buildDepositFundsIx,buildEmberDepositIx} from '@ellipsis-labs/rise';
import {decodePhoenixCatalog,planPhoenixOrder,PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {derivePhoenixWalletAccounts,inspectPhoenixInstructionBindings} from '../lib/phoenix-instruction-bindings.js';
const now=1800000000000;
const key=n=>bs58.encode(Uint8Array.from({length:32},(_,i)=>i===31?n:0));
const wallet=key(12),TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const catalog=decodePhoenixCatalog([{symbol:'DOGE',assetId:7,marketStatus:'active',metadata:{assetClass:'crypto'},marketPubkey:key(20),splinePubkey:key(21),tickSize:1,baseLotsDecimals:0,takerFee:0.00035,leverageTiers:[{maxLeverage:10,maxSizeBaseLots:1000000}]}],{observedAt:now});
const makePlan=(patch={})=>planPhoenixOrder({catalog,walletAddress:wallet,symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,referencePrice:'0.123456',observedSlot:1000,clientOrderId:'1',isolatedSubaccountIndex:1,now,...patch});
const meta=(address,role=0)=>({address,role});
async function fixture(plan=makePlan()){
 const a=await derivePhoenixWalletAccounts(wallet,1);
 const keys={globalConfig:'2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ',canonicalMint:ID.canonicalUsdc,globalVault:a.globalVault,perpAssetMap:key(31),globalTraderIndex:[key(32)],activeTraderBuffer:[key(33)],withdrawQueue:key(34)};
 const common={trader:wallet,traderAccount:a.trader,perpAssetMap:keys.perpAssetMap,globalTraderIndex:keys.globalTraderIndex,activeTraderBuffer:keys.activeTraderBuffer};
 const order=buildPlaceMarketOrderIx({...common,orderbook:key(20),splineCollection:key(21),orderPacket:plan.packet});
 const amount=BigInt(plan.marginUsdcUnits);
 const instructions=plan.close?[order]:[
  {programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',accounts:[meta(wallet,3),meta(a.canonicalAta,1),meta(wallet),meta(ID.canonicalUsdc),meta('11111111111111111111111111111111'),meta(TOKEN)],data:new Uint8Array([1])},
  buildEmberDepositIx({owner:wallet,inputMint:ID.usdc,outputMint:ID.canonicalUsdc,inputTokenAccount:a.usdcAta,outputTokenAccount:a.canonicalAta,emberState:a.emberState,emberVault:a.emberVault,amount}),
  buildDepositFundsIx({...common,mint:ID.canonicalUsdc,traderTokenAccount:a.canonicalAta,globalVault:a.globalVault,amount}),order];
 return {plan,keys,pieces:{walletAddress:wallet,close:plan.close,instructions}};
}
const check=f=>inspectPhoenixInstructionBindings(f.plan,f.pieces,{exchangeKeys:f.keys,now:()=>now});
test('official instructions match independently derived wallet token accounts and isolated PDA',async()=>{
 const f=await fixture(),checked=await check(f);assert.equal(checked.readyForSigning,false);assert.equal(checked.instructions.length,4);
 f.pieces.instructions[1].data[0]^=1;assert.notDeepEqual(checked.instructions[1].data,[...f.pieces.instructions[1].data]);
 assert.ok(Object.isFrozen(checked.instructions[0].accounts[0]));assert.ok(Object.isFrozen(checked.instructions[0].data));
});
test('recipient, market, signer role, extra instruction, amount and trailing bytes tampering fail',async()=>{
 const mutations=[
  f=>{f.pieces.instructions[1].accounts[4]={...f.pieces.instructions[1].accounts[4],address:key(99)};},
  f=>{f.pieces.instructions[3].accounts.at(-2).address=key(99);},
  f=>{f.pieces.instructions[3].accounts[3].role=0;},
  f=>{f.pieces.instructions.push(f.pieces.instructions[0]);},
  f=>{f.pieces.instructions[2].data=new Uint8Array(f.pieces.instructions[2].data);f.pieces.instructions[2].data[8]^=1;},
  f=>{f.pieces.instructions[3].data=new Uint8Array([...f.pieces.instructions[3].data,0]);},
  f=>{f.keys.activeTraderBuffer=[f.keys.perpAssetMap];},
  f=>{f.keys.globalVault=key(99);},
  f=>{f.pieces.instructions[3].accounts[4].address=key(99);}
 ];
 for(const mutate of mutations){const f=await fixture();mutate(f);await assert.rejects(()=>check(f),/BINDING/);}
});
test('close only permits one reduce-only order and no collateral withdrawal',async()=>{
 const f=await fixture(makePlan({closeBaseLots:'10',side:'SHORT'}));assert.equal((await check(f)).instructions.length,1);
 f.pieces.instructions.unshift(f.pieces.instructions[0]);await assert.rejects(()=>check(f),/BINDING/);
});
test('binding evidence expires and account zero cannot replace isolated child',async()=>{
 const f=await fixture();await assert.rejects(()=>inspectPhoenixInstructionBindings(f.plan,f.pieces,{exchangeKeys:f.keys,now:()=>now+15000}),/BINDING/);
 await assert.rejects(()=>derivePhoenixWalletAccounts(wallet,0));
});
