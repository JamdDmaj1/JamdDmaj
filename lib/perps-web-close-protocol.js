// Browser-safe close review protocol. The server independently repeats native
// account/instruction/simulation checks before any one-attempt submission.
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {inspectWebPerpsEnvelope,webPerpsBytes,webPerpsBase64} from './perps-web-envelope.js';
import {webPerpsSha256} from './perps-web-review-protocol.js';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const fields=['version','reviewId','closeId','operation','walletAddress','positionAddress','observedAt','expiresAt','observedSlot','details','material','recordBinding','readyForSigning','tradingEnabled'];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function fail(){throw Error('INVALID_WEB_CLOSE_REVIEW');}
export function webCloseBindingText(packet){const {recordBinding,...rest}=packet;return JSON.stringify(stable(rest));}
export function webCloseKey(value){try{if(typeof value!=='string'||value.length>44||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)fail();return value;}catch{fail();}}
export function inspectWebCloseWire(packet){
 const raw=webPerpsBytes(packet.material.serializedTxBase64);
 if(packet.operation!=='CONVERT'){
  const envelope=inspectWebPerpsEnvelope(packet.material.serializedTxBase64,packet.walletAddress);
  if(envelope.blockhash!==packet.material.blockhash)fail();
  if(packet.operation==='CLOSE'){
   const closes=envelope.instructions.filter(ix=>{const bytes=webPerpsBytes(ix.dataBase64);return ['2e17f02c1e8a5e8c','a2bfc83e8b3eb011'].includes([...bytes.slice(0,8)].map(n=>n.toString(16).padStart(2,'0')).join(''));});
   if(closes.length!==1)fail();const data=webPerpsBytes(closes[0].dataBase64);if(![42,50].includes(data.length)||data[32]!==1||data[33]!==1)fail();
   const price=new DataView(data.buffer,data.byteOffset,data.byteLength).getBigUint64(24,true);
   if(price.toString()!==packet.details.priceLimitUsdUnits)fail();
  }
  return {raw,version:envelope.version===-1?'legacy':0,messageOffset:193};
 }
 // The protected conversion is a legacy, owner-only transaction. It is never
 // treated as an entry/keeper envelope or signed using signAndSendTransaction.
 if(raw.length<165||raw[0]!==1||raw.slice(1,65).some(n=>n!==0)||raw[65]!==1||raw[66]!==0||raw[68]>=128||raw[68]<3)fail();
 const count=raw[68],keysAt=69,blockAt=keysAt+count*32;
 if(blockAt+33>=raw.length||bs58.encode(raw.slice(keysAt,keysAt+32))!==packet.walletAddress||bs58.encode(raw.slice(blockAt,blockAt+32))!==packet.material.blockhash)fail();
 const keys=Array.from({length:count},(_,i)=>bs58.encode(raw.slice(keysAt+i*32,keysAt+(i+1)*32)));if(new Set(keys).size!==keys.length)fail();
 let offset=blockAt+32;const byte=()=>{if(offset>=raw.length||raw[offset]>=128)fail();return raw[offset++];};
 const list=[],n=byte();for(let i=0;i<n;i++){const program=keys[byte()],size=byte(),accounts=Array.from({length:size},()=>keys[byte()]),length=byte();if(offset+length>raw.length||!program||accounts.some(a=>!a))fail();const data=raw.slice(offset,offset+length);offset+=length;list.push({program,accounts,data});}if(offset!==raw.length)fail();
 const d=packet.details,coreIndex=d.nativeSolInput?6:3,core=list[coreIndex],r=core?.accounts,view=core&&new DataView(core.data.buffer,core.data.byteOffset,core.data.byteLength);
 if(core?.program!==PERPS_PROGRAM||core.data.length!==24||[...core.data.slice(0,8)].map(n=>n.toString(16).padStart(2,'0')).join('')!=='414b3f4ceb5b5b88'
  ||view.getBigUint64(8,true).toString()!==d.amountUnits||view.getBigUint64(16,true).toString()!==d.minimumUsdcUnits||r.length!==17
  ||r[0]!==packet.walletAddress||r[1]!==d.source||r[2]!==d.destination||r[5]!==PERPS_POOL||r[6]!==PERPS_CUSTODIES[d.asset]?.address||r[10]!==PERPS_CUSTODIES.USDC.address||r[14]!==TOKEN||r[16]!==PERPS_PROGRAM)fail();
 const expected=[COMPUTE,COMPUTE,...(d.nativeSolInput?[ATA]:[]),ATA,...(d.nativeSolInput?[SYSTEM,TOKEN]:[]),PERPS_PROGRAM,...(d.closeWrappedAccount?[TOKEN]:[])];
 if(list.length!==expected.length||list.some((ix,i)=>ix.program!==expected[i]))fail();
 for(let i=0;i<2;i++){const ix=list[i],v=new DataView(ix.data.buffer,ix.data.byteOffset,ix.data.byteLength);if(ix.accounts.length||i===0&&(ix.data.length!==5||ix.data[0]!==2||v.getUint32(1,true)!==400000)||i===1&&(ix.data.length!==9||ix.data[0]!==3||v.getBigUint64(1,true)>10000n))fail();}
 const own=packet.walletAddress,ata=(ix,destination,mint)=>{if(ix.data.length!==1||ix.data[0]!==1||ix.accounts.join(',')!==[own,destination,own,mint,SYSTEM,TOKEN].join(','))fail();};
 ata(list[d.nativeSolInput?3:2],d.destination,PERPS_CUSTODIES.USDC.mint);
 if(d.nativeSolInput){ata(list[2],d.source,PERPS_CUSTODIES.SOL.mint);const ix=list[4],v=new DataView(ix.data.buffer,ix.data.byteOffset,ix.data.byteLength);
  if(ix.accounts.join(',')!==[own,d.source].join(',')||ix.data.length!==12||v.getUint32(0,true)!==2||v.getBigUint64(4,true).toString()!==d.amountUnits||list[5].accounts.join(',')!==d.source||list[5].data.length!==1||list[5].data[0]!==17)fail();}
 if(d.closeWrappedAccount){const ix=list.at(-1);if(ix.accounts.join(',')!==[d.source,own,own].join(',')||ix.data.length!==1||ix.data[0]!==9)fail();}
 return {raw,version:'legacy',messageOffset:65};
}
export async function validateWebClosePacket(packet,{walletAddress,positionAddress,now=Date.now(),historical=false}={}){
 if(!packet||Object.keys(packet).sort().join(',')!==fields.slice().sort().join(',')||JSON.stringify(packet).length>8192||packet.version!==1
  ||!['CLOSE','CONVERT','CANCEL_EXIT'].includes(packet.operation)||typeof packet.reviewId!=='string'||!/^[a-f0-9]{64}$/.test(packet.reviewId)
  ||typeof packet.closeId!=='string'||!/^wc:[a-f0-9]{64}:[a-f0-9]{64}$/.test(packet.closeId)||packet.readyForSigning!==false||packet.tradingEnabled!==false)fail();
 webCloseKey(packet.walletAddress);webCloseKey(packet.positionAddress);
 if(walletAddress!==packet.walletAddress||positionAddress!==packet.positionAddress||!Number.isSafeInteger(now)||!Number.isSafeInteger(packet.observedAt)||packet.observedAt<30000
  ||!Number.isSafeInteger(packet.expiresAt)||packet.expiresAt<=packet.observedAt||packet.expiresAt-packet.observedAt>15000
  ||!historical&&(now<packet.observedAt-2000||now>=packet.expiresAt)||!Number.isSafeInteger(packet.observedSlot)||packet.observedSlot<1)fail();
 if(!packet.details||Array.isArray(packet.details)||typeof packet.details!=='object'||JSON.stringify(packet.details).length>2048
  ||!packet.material||Object.keys(packet.material).sort().join(',')!=='blockhash,lastValidBlockHeight,serializedTxBase64')fail();
 webCloseKey(packet.material.blockhash);if(typeof packet.material.lastValidBlockHeight!=='string'||!/^[1-9][0-9]{0,19}$/.test(packet.material.lastValidBlockHeight)||BigInt(packet.material.lastValidBlockHeight)>18446744073709551615n)fail();
 if(typeof packet.details.networkFeeLamports!=='string'||!/^[1-9][0-9]{0,6}$/.test(packet.details.networkFeeLamports)||BigInt(packet.details.networkFeeLamports)>1000000n)fail();
 const d=packet.details,u64=(v,positive=false)=>typeof v==='string'&&(positive?/^[1-9][0-9]{0,19}$/:/^(0|[1-9][0-9]{0,19})$/).test(v)&&BigInt(v)<=18446744073709551615n;
 const detailFields={CLOSE:'asset,collateralUsdUnits,networkFeeLamports,priceLimitUsdUnits,receiveAsset,rentLockedLamports,requiresConversion,settlement,side,sizeUsdUnits',CONVERT:'amountUnits,asset,closeWrappedAccount,destination,minimumUsdcUnits,nativeSolInput,networkFeeLamports,source',CANCEL_EXIT:'exitAddress,networkFeeLamports,returnedUsdcUnits'};
 if(Object.keys(d).sort().join(',')!==detailFields[packet.operation])fail();
 if(packet.operation==='CLOSE'&&(!['BTC','ETH','SOL'].includes(d.asset)||!['LONG','SHORT'].includes(d.side)
  ||!['BTC','ETH','SOL','USDC'].includes(d.receiveAsset)||typeof d.requiresConversion!=='boolean'
  ||!['sizeUsdUnits','collateralUsdUnits','priceLimitUsdUnits'].every(k=>u64(d[k],true))||!u64(d.rentLockedLamports)||typeof d.settlement!=='string'))fail();
 if(packet.operation==='CONVERT'){
  if(!['BTC','ETH','SOL'].includes(d.asset)||!u64(d.amountUnits,true)||!u64(d.minimumUsdcUnits,true)||typeof d.nativeSolInput!=='boolean'||typeof d.closeWrappedAccount!=='boolean'||d.nativeSolInput&&d.asset!=='SOL'||d.closeWrappedAccount&&!d.nativeSolInput)fail();
  for(const [address,mint] of [[d.source,PERPS_CUSTODIES[d.asset].mint],[d.destination,PERPS_CUSTODIES.USDC.mint]]){
   const [expected]=await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(packet.walletAddress),bs58.decode(TOKEN),bs58.decode(mint)]});if(address!==expected)fail();
  }
 }
 if(packet.operation==='CANCEL_EXIT'){webCloseKey(d.exitAddress);if(!u64(d.returnedUsdcUnits))fail();}
 const wire=inspectWebCloseWire(packet);if(await webPerpsSha256(webCloseBindingText(packet))!==packet.recordBinding)fail();return Object.freeze({...wire,packet});
}
export function verifyWebCloseSignature(packet,encoded){
 const {raw,version,messageOffset}=inspectWebCloseWire(packet),signed=webPerpsBytes(encoded);
 if(signed.length!==raw.length||signed[0]!==raw[0]||signed.slice(65).some((n,i)=>n!==raw[i+65])
  ||!ed25519.verify(signed.slice(1,65),signed.slice(messageOffset),bs58.decode(packet.walletAddress),{zip215:false}))fail();
 return Object.freeze({signature:bs58.encode(signed.slice(1,65)),signedBase64:webPerpsBase64(signed),version});
}
