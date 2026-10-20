import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {buildUnsignedPerpsCloseConversionWire,minimumPerpsConversionUsdcUnits} from '../lib/perps-close-conversion-wire.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,decodeServerPerpsCustody,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),blockhash=bs58.encode(Buffer.alloc(32,9)),TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
function custody(asset,{disabled=false}={}){
 const c=PERPS_CUSTODIES[asset],i=['BTC','ETH','SOL','USDC'].indexOf(asset),b=Buffer.alloc(416);Buffer.from('01b830515d833f91','hex').copy(b);
 for(const [offset,key]of [[8,PERPS_POOL],[40,c.mint]])Buffer.from(bs58.decode(key)).copy(b,offset);
 Buffer.alloc(32,30+i).copy(b,72);b[104]=c.decimals;b[105]=Number(c.stable);Buffer.alloc(32,40+i).copy(b,106);b[138]=2;b.writeBigUInt64LE(500000n,175);b[199]=Number(!disabled);Buffer.alloc(32,50+i).copy(b,384);
 return decodeServerPerpsCustody(asset,c.address,{owner:PERPS_PROGRAM,executable:false,lamports:3000000,data:[b.toString('base64'),'base64']});
}
function decode(wire){
 const b=Buffer.from(wire.serializedTxBase64,'base64');assert.equal(b[0],1);assert(b.subarray(1,65).every(n=>n===0));
 const message=b.subarray(65);assert.equal(message.toString('base64'),wire.messageBase64);let p=0;
 assert.equal(message[p++],1);assert.equal(message[p++],0);const readonly=message[p++],count=message[p++];
 const keys=Array.from({length:count},()=>{const key=bs58.encode(message.subarray(p,p+32));p+=32;return key;});
 const bh=bs58.encode(message.subarray(p,p+32));p+=32;const length=message[p++];
 const instructions=Array.from({length},()=>{const program=keys[message[p++]],n=message[p++],accounts=Array.from(message.subarray(p,p+n),i=>keys[i]);p+=n;const size=message[p++],data=message.subarray(p,p+size);p+=size;return {program,accounts,data};});
 assert.equal(p,message.length);assert(b.length<=1232);return {keys,instructions,readonly,blockhash:bh};
}
const base={walletAddress:wallet,asset:'SOL',amountUnits:'100000',minimumUsdcUnits:'10000',nativeSolInput:true,closeWrappedAccount:true,blockhash,lastValidBlockHeight:'999999999'};
test('protected conversion wire matches the confirmed Swap2 native IDL, with one empty owner signature and exact asset/USDC roles',async()=>{
 const record=JSON.parse(readFileSync(new URL('../security/native-tests/jupiter-perps-idl-layout.json',import.meta.url),'utf8')).closeConversionSwap2Layout;
 assert.equal(record.idlSha256,'1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653');
 assert.equal(record.discriminatorHex,createHash('sha256').update('global:swap2').digest().subarray(0,8).toString('hex'));
 assert.equal(record.accounts.length,17);assert.equal(record.unsignedDiagnostic.signaturesAdded,false);assert.equal(record.unsignedDiagnostic.sameBankControlComparison,false);
 for(const asset of ['BTC','ETH','SOL'])for(const nativeSolInput of asset==='SOL'?[false,true]:[false]){
  const c=custody(asset),u=custody('USDC'),wire=await buildUnsignedPerpsCloseConversionWire({...base,asset,nativeSolInput,closeWrappedAccount:nativeSolInput},c,u),d=decode(wire);
  const id=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side:'LONG'}),core=d.instructions.filter(i=>i.program===PERPS_PROGRAM);
  assert.equal(core.length,1);assert.equal(core[0].data.length,record.bytes);assert.equal(core[0].data.subarray(0,8).toString('hex'),record.discriminatorHex);
  assert.equal(core[0].data.readBigUInt64LE(record.amountInOffset),100000n);assert.equal(core[0].data.readBigUInt64LE(record.minimumOutOffset),10000n);
  assert.deepEqual(core[0].accounts,[wallet,wire.source,wire.destination,id.transferAuthority,id.perpetuals,PERPS_POOL,c.address,c.dovesAgOracle,c.dovesAgOracle,c.tokenAccount,u.address,u.dovesAgOracle,u.dovesAgOracle,u.tokenAccount,TOKEN,id.eventAuthority,PERPS_PROGRAM]);
  const associated=async mint=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(wallet),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
  assert.equal(wire.source,await associated(c.mint));assert.equal(wire.destination,await associated(u.mint));assert.equal(d.blockhash,blockhash);
  assert.equal(d.keys[0],wallet);assert.equal(wire.readyForSigning,false);assert.equal(wire.requiresFinalizedProceedsAndJournalBinding,true);assert(Object.isFrozen(wire));
  assert.deepEqual(new Set(d.keys.slice(0,d.keys.length-d.readonly)),new Set([wallet,wire.source,wire.destination,PERPS_POOL,c.address,c.tokenAccount,u.address,u.tokenAccount]));
 }
});
test('native SOL setup wraps exactly the requested proceeds and cleanup is explicit; token input never spends native SOL',async()=>{
 for(const closeWrappedAccount of [false,true]){
  const wire=await buildUnsignedPerpsCloseConversionWire({...base,closeWrappedAccount},custody('SOL'),custody('USDC')),d=decode(wire);
  const system=d.instructions.filter(i=>i.program===SYSTEM);assert.equal(system.length,1);assert.equal(system[0].data.readUInt32LE(0),2);assert.equal(system[0].data.readBigUInt64LE(4),100000n);
  const sync=d.instructions.filter(i=>i.program===TOKEN&&i.data[0]===17),close=d.instructions.filter(i=>i.program===TOKEN&&i.data[0]===9);
  assert.equal(sync.length,1);assert.equal(close.length,Number(closeWrappedAccount));
  if(closeWrappedAccount)assert.deepEqual(close[0].accounts,[wire.source,wallet,wallet]);
 }
 const d=decode(await buildUnsignedPerpsCloseConversionWire({...base,nativeSolInput:false,closeWrappedAccount:false},custody('SOL'),custody('USDC')));
 assert(!d.instructions.some(i=>[SYSTEM,TOKEN].includes(i.program)));assert.equal(d.instructions.filter(i=>i.program===ATA).length,1);
});
test('amounts and positive minimum are exact u64 values, while tips, ledger and additional signers/routes are absent',async()=>{
 const max='18446744073709551615',wire=await buildUnsignedPerpsCloseConversionWire({...base,amountUnits:max,minimumUsdcUnits:max},custody('SOL'),custody('USDC')),d=decode(wire);
 const swap=d.instructions.find(i=>i.program===PERPS_PROGRAM);assert.equal(swap.data.readBigUInt64LE(8).toString(),max);assert.equal(swap.data.readBigUInt64LE(16).toString(),max);
 const budget=d.instructions.filter(i=>i.program===COMPUTE);assert.equal(budget.length,2);assert.equal(budget[0].data.readUInt32LE(1),400000);assert.equal(budget[1].data.readBigUInt64LE(1),1000n);
 assert(d.instructions.every(i=>[COMPUTE,ATA,SYSTEM,TOKEN,PERPS_PROGRAM].includes(i.program)));
});
test('copied custody, disabled swaps, mismatched assets and malformed/widened monetary inputs fail before a wire exists',async()=>{
 const c=custody('SOL'),u=custody('USDC');
 for(const patch of [{walletAddress:'bad'},{blockhash:'bad'},{asset:'USDC'},{amountUnits:'0'},{amountUnits:'01'},{amountUnits:'1e5'},{amountUnits:100000},{amountUnits:'18446744073709551616'},
  {minimumUsdcUnits:'0'},{minimumUsdcUnits:10000},{minimumUsdcUnits:'18446744073709551616'},{nativeSolInput:'true'},{closeWrappedAccount:1},{nativeSolInput:false},{lastValidBlockHeight:'0'},{lastValidBlockHeight:999},{computeUnitPriceMicroLamports:-1},{computeUnitPriceMicroLamports:10001},{computeUnitPriceMicroLamports:NaN}])await assert.rejects(buildUnsignedPerpsCloseConversionWire({...base,...patch},c,u));
 for(const [a,b]of [[{...c},u],[c,{...u}],[custody('ETH'),u],[c,c],[custody('SOL',{disabled:true}),u],[c,custody('USDC',{disabled:true})]])await assert.rejects(buildUnsignedPerpsCloseConversionWire(base,a,b));
 const input={...base},pending=buildUnsignedPerpsCloseConversionWire(input,c,u);input.amountUnits='1';input.minimumUsdcUnits='1';assert.equal((await pending).amountUnits,'100000');
});
test('independent USDC conversion bound rounds inward, handles depegs and never substitutes an assumed one-dollar USDC',()=>{
 const p={amountUnits:'100000',inputDecimals:9,inputPriceLowerUsdUnits:'106500000',usdcPriceUpperUsdUnits:'999900',maxSlippageBps:100};
 const min=BigInt(minimumPerpsConversionUsdcUnits(p)),n=100000n*106500000n*1000000n*9900n,d=1000000000n*999900n*10000n;
 assert(min*d>=n);assert((min-1n)*d<n);
 assert(BigInt(minimumPerpsConversionUsdcUnits({...p,usdcPriceUpperUsdUnits:'1100000'}))<min);
 assert(BigInt(minimumPerpsConversionUsdcUnits({...p,usdcPriceUpperUsdUnits:'900000'}))>min);
 assert(BigInt(minimumPerpsConversionUsdcUnits({...p,maxSlippageBps:1}))>=min);
 assert.equal(minimumPerpsConversionUsdcUnits({...p,amountUnits:'1',inputPriceLowerUsdUnits:'1'}),'1');
 for(const patch of [{maxSlippageBps:0},{maxSlippageBps:101},{inputDecimals:19},{inputDecimals:NaN},{inputPriceLowerUsdUnits:'0'},{usdcPriceUpperUsdUnits:'0'},{amountUnits:'0'},
  {amountUnits:'18446744073709551615',inputDecimals:0,inputPriceLowerUsdUnits:'18446744073709551615',usdcPriceUpperUsdUnits:'1'}])assert.throws(()=>minimumPerpsConversionUsdcUnits({...p,...patch}));
});
