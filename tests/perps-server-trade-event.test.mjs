import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import layout from '../lib/perps-event-layout.json' with {type:'json'};
import {decodeServerPerpsTradeEvent} from '../lib/perps-server-trade-event.js';
import {PERPS_CUSTODIES,PERPS_POOL,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const walletAddress=bs58.encode(Buffer.alloc(32,11));
async function fixture(name='InstantDecreasePositionEvent',asset='SOL',side='LONG'){
 const schema=layout.events.find(e=>e.name===name),identities=await deriveServerPerpsIdentities({walletAddress,asset,side}),collateral=PERPS_CUSTODIES[side==='LONG'?asset:'USDC'];
 const fields={};
 for(const [key,type]of schema.fields)fields[key]=typeof type==='object'?null:type==='publicKey'?walletAddress:type==='bool'?false:type==='u8'?0:'0';
 Object.assign(fields,{owner:walletAddress,pool:PERPS_POOL,positionKey:identities.position,positionSide:side==='LONG'?1:2,positionMint:PERPS_CUSTODIES[asset].mint,
  positionCustody:PERPS_CUSTODIES[asset].address,positionCollateralCustody:collateral.address,feeUsd:'30000',positionFeeUsd:'10000',fundingFeeUsd:'5000',priceImpactFeeUsd:'2000'});
 if(Object.hasOwn(fields,'positionCollateralMint'))fields.positionCollateralMint=collateral.mint;
 if(Object.hasOwn(fields,'pnlDelta'))Object.assign(fields,{pnlDelta:'1234567',hasProfit:false});
 function encode(type,value){
  if(typeof type==='object')return value===null?Buffer.from([0]):Buffer.concat([Buffer.from([1]),encode(type.option,value)]);
  if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='u8'||type==='bool')return Buffer.from([Number(value)]);
  const b=Buffer.alloc(8);if(type==='i64')b.writeBigInt64LE(BigInt(value));else b.writeBigUInt64LE(BigInt(value));return b;
 }
 return {fields,schema,encode:()=>Buffer.concat([createHash('sha256').update('event:'+name).digest().subarray(0,8),...schema.fields.map(([key,type])=>encode(type,fields[key]))])};
}
test('all pinned increase/decrease/liquidation layouts bind all six supported position PDAs with exact dollars',async()=>{
 assert.equal(layout.idlSha256,'1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653');
 for(const {name}of layout.events)for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await fixture(name,asset,side),event=await decodeServerPerpsTradeEvent(f.encode(),{walletAddress});
  assert.equal(event.eventName,name);assert.equal(event.asset,asset);assert.equal(event.side,side);
  assert.equal(event.action,/Increase/.test(name)?'Increase':/Liquidate/.test(name)?'Liquidate':'Decrease');
  assert.equal(event.signedPnlUsdUnits,/Increase/.test(name)?'0':'-1234567');
  assert.equal(event.conservativeLossUsdUnits,/Increase/.test(name)?'30000':'1264567');
  assert.equal(event.requiresVerifiedChainOrigin,true);assert.equal(event.readyForSigning,false);assert.ok(Object.isFrozen(event.fields));
 }
});
test('profit never refunds the daily loss ceiling and aggregate/components are not blindly double-counted',async()=>{
 const f=await fixture();f.fields.hasProfit=true;
 assert.equal((await decodeServerPerpsTradeEvent(f.encode(),{walletAddress})).conservativeLossUsdUnits,'30000');
 f.fields.feeUsd='1000';f.fields.fundingFeeUsd='9007199254740993';
 const e=await decodeServerPerpsTradeEvent(f.encode(),{walletAddress});
 assert.equal(e.feeComponentsUsdUnits,'9007199254752993');assert.equal(e.conservativeLossUsdUnits,'9007199254752993');
});
test('liquidation also reserves the original collateral that was not recovered',async()=>{
 const f=await fixture('LiquidateFullPositionEvent');Object.assign(f.fields,{originalPositionCollateralUsd:'10000000',transferAmountUsd:'2000000',liquidationFeeUsd:'500000'});
 const e=await decodeServerPerpsTradeEvent(f.encode(),{walletAddress});assert.equal(e.conservativeLossUsdUnits,'8000000');
});
test('mismatched owner, pool, market, collateral, side, mint or derived position cannot become trade evidence',async()=>{
 for(const change of [{owner:PERPS_POOL},{pool:walletAddress},{positionKey:walletAddress},{positionSide:0},{positionSide:3},{positionMint:walletAddress},{positionCustody:walletAddress},{positionCollateralCustody:walletAddress}]){
  const f=await fixture();Object.assign(f.fields,change);await assert.rejects(decodeServerPerpsTradeEvent(f.encode(),{walletAddress}),/INVALID_SERVER_PERPS_TRADE_EVENT/);
 }
 const f=await fixture('LiquidateFullPositionEvent');f.fields.positionCollateralMint=PERPS_CUSTODIES.USDC.mint;await assert.rejects(decodeServerPerpsTradeEvent(f.encode(),{walletAddress}));
});
test('truncated, extended, noncanonical bool and option payloads fail rather than silently losing fees',async()=>{
 const f=await fixture(),encoded=f.encode();
 for(const payload of [encoded.subarray(0,-1),Buffer.concat([encoded,Buffer.from([0])]),Buffer.alloc(7),Buffer.alloc(2049)])await assert.rejects(decodeServerPerpsTradeEvent(payload,{walletAddress}));
 f.fields.hasProfit=2;await assert.rejects(decodeServerPerpsTradeEvent(f.encode(),{walletAddress}));
 const g=await fixture();g.fields.referral=walletAddress;const optional=g.encode(),tagOffset=optional.length-(8*7+1+32+1);optional[tagOffset]=2;
 await assert.rejects(decodeServerPerpsTradeEvent(optional,{walletAddress}));
});
test('unknown events grant nothing and nonempty optional fields are decoded without rounding',async()=>{
 assert.equal(await decodeServerPerpsTradeEvent(Buffer.alloc(8),{walletAddress}),null);
 const f=await fixture('DecreasePositionEvent');Object.assign(f.fields,{transferToken:'18446744073709551615',priceSlippage:'1',referral:walletAddress});
 const event=await decodeServerPerpsTradeEvent(f.encode(),{walletAddress});assert.equal(event.fields.transferToken,'18446744073709551615');assert.equal(event.fields.referral,walletAddress);
});
