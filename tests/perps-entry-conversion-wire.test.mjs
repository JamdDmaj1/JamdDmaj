import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {buildUnsignedPerpsEntryConversionWire,minimumPerpsEntryCollateralUnits,readConstructedPerpsEntryConversionWire} from '../lib/perps-entry-conversion-wire.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import {simulatePerpsEntryConversion,readSimulatedPerpsEntryConversion} from '../lib/perps-entry-conversion-simulation.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),blockhash=bs58.encode(Buffer.alloc(32,9));
function custody(asset){
 const c=PERPS_CUSTODIES[asset],i=['BTC','ETH','SOL','USDC'].indexOf(asset),b=Buffer.alloc(416);Buffer.from('01b830515d833f91','hex').copy(b);
 for(const [offset,key]of [[8,PERPS_POOL],[40,c.mint]])Buffer.from(bs58.decode(key)).copy(b,offset);
 Buffer.alloc(32,30+i).copy(b,72);b[104]=c.decimals;b[105]=Number(c.stable);Buffer.alloc(32,40+i).copy(b,106);b[138]=2;b.writeBigUInt64LE(500000n,175);b[199]=1;Buffer.alloc(32,50+i).copy(b,384);
 return decodeServerPerpsCustody(asset,c.address,{owner:PERPS_PROGRAM,executable:false,lamports:3000000,data:[b.toString('base64'),'base64']});
}
const base={walletAddress:wallet,asset:'BTC',blockhash,usdcUnits:'10000000',minimumCollateralUnits:'12757',lastValidBlockHeight:'999999999'};
test('entry conversion rounds the independent 0.5 percent output floor upward without float or implicit USDC peg',()=>{
 assert.equal(minimumPerpsEntryCollateralUnits({usdcUnits:'10000000',outputDecimals:8,usdcPriceLowerUsdUnits:'1000000',outputPriceUpperUsdUnits:'78000000000',maxSlippageBps:50}),'12757');
 assert.equal(minimumPerpsEntryCollateralUnits({usdcUnits:'10000000',outputDecimals:8,usdcPriceLowerUsdUnits:'990000',outputPriceUpperUsdUnits:'78000000000',maxSlippageBps:50}),'12629');
 for(const maxSlippageBps of [0,49,51,500,'50'])assert.throws(()=>minimumPerpsEntryCollateralUnits({usdcUnits:'10000000',outputDecimals:8,usdcPriceLowerUsdUnits:'1000000',outputPriceUpperUsdUnits:'78000000000',maxSlippageBps}));
});
test('first-leg wires spend exact USDC, keep collateral ATA and have no signing capability',async()=>{
 for(const asset of ['BTC','ETH','SOL']){
  const u=custody('USDC'),c=custody(asset),wire=await buildUnsignedPerpsEntryConversionWire({...base,asset},u,c),b=Buffer.from(wire.serializedTxBase64,'base64');
  assert.equal(b[0],1);assert(b.subarray(1,65).every(v=>v===0));const m=b.subarray(65);let p=4;
  assert.equal(m[0],1);const keys=Array.from({length:m[3]},()=>{const k=bs58.encode(m.subarray(p,p+32));p+=32;return k;});p+=32;
  const count=m[p++],ix=[];for(let i=0;i<count;i++){const program=keys[m[p++]],n=m[p++],accounts=Array.from(m.subarray(p,p+n),j=>keys[j]);p+=n;const len=m[p++],data=m.subarray(p,p+len);p+=len;ix.push({program,accounts,data});}
  assert.equal(p,m.length);assert.equal(count,4);const swap=ix.at(-1);
  assert.equal(swap.program,PERPS_PROGRAM);assert.equal(swap.data.subarray(0,8).toString('hex'),'414b3f4ceb5b5b88');
  assert.equal(swap.data.readBigUInt64LE(8),10000000n);assert.equal(swap.data.readBigUInt64LE(16),12757n);
  assert.equal(swap.accounts[1],wire.source);assert.equal(swap.accounts[2],wire.destination);assert.equal(swap.accounts[6],u.address);assert.equal(swap.accounts[10],c.address);
  assert.equal(wire.readyForSigning,false);assert.equal(wire.requiresFinalizedReceiptBeforeOpening,true);assert.equal(readConstructedPerpsEntryConversionWire(wire).collateral,c);
  assert.throws(()=>readConstructedPerpsEntryConversionWire({...wire}));
 }
});
test('entry wire rejects copied custody, foreign pair, extra permissions and invalid exact inputs',async()=>{
 const u=custody('USDC'),c=custody('BTC');
 await assert.rejects(buildUnsignedPerpsEntryConversionWire(base,{...u},c));
 for(const change of [{asset:'USDC'},{usdcUnits:'0'},{minimumCollateralUnits:'0'},{usdcUnits:'1e7'},{minimumCollateralUnits:'18446744073709551616'},{computeUnitPriceMicroLamports:10001},{closeWrappedAccount:true},{walletAddress:'bad'}])await assert.rejects(buildUnsignedPerpsEntryConversionWire({...base,...change},u,c));
});
test('entry effects reject copied wires and wrong networks without any send capability',async()=>{
 let reads=0;const request=async method=>{reads++;assert.equal(method,'getGenesisHash');return 'wrong-network';};
 const wire=await buildUnsignedPerpsEntryConversionWire(base,custody('USDC'),custody('BTC'));
 await assert.rejects(simulatePerpsEntryConversion({...wire},{request}));assert.equal(reads,0);
 await assert.rejects(simulatePerpsEntryConversion(wire,{request}));assert.equal(reads,1);
 assert.throws(()=>readSimulatedPerpsEntryConversion({stage:'PROTECTED_ENTRY_CONVERSION_EFFECTS_SIMULATED',readyForSigning:false}));
});
