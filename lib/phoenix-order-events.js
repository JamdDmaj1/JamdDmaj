// Narrow decoder for native Phoenix length-delimited CPI events. Layout source:
// Ellipsis-Labs/rise-public rust/events/src/{lib.rs,market_events/orderbook.rs}.
// Event bytes are evidence only after the caller verifies the exact finalized
// signed wire. This parser never treats free-form log strings as fill evidence.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PHOENIX_IDENTITIES as ID,phoenixKey} from './phoenix-market-plan.js';

const tag=name=>createHash('sha256').update('global:'+name).digest().subarray(0,8);
const LENGTHS=tag('log_event_lengths'),LOG=tag('log');
const fail=code=>{throw Error('PHOENIX_EVENTS_'+code);};
function symbol(bytes){
 const end=bytes.indexOf(0),text=bytes.subarray(0,end<0?bytes.length:end).toString('ascii');
 if(!/^[A-Za-z0-9_-]{1,16}$/.test(text)||(end>=0&&bytes.subarray(end).some(b=>b!==0)))fail('SYMBOL');
 return text;
}
function decodeHeader(b){
 if(b.length!==107)fail('HEADER');
 return Object.freeze({symbol:symbol(b.subarray(17,33)),assetId:b.readUInt32LE(33),tickSize:b.readUInt32LE(37).toString(),
  baseLotsDecimals:b.readInt8(41),quoteDecimals:b[42],signer:bs58.encode(b.subarray(43,75)),trader:bs58.encode(b.subarray(75,107))});
}
function decodeSummary(b){
 if(b.length!==106||b[49]>1)fail('SUMMARY');
 return Object.freeze({trader:bs58.encode(b.subarray(1,33)),sequence:b.readBigUInt64LE(33).toString(),
  side:b[49]===0?'LONG':'SHORT',baseLotsFilled:b.readBigUInt64LE(50).toString(),quoteLotsFilled:b.readBigUInt64LE(58).toString(),
  feeUnits:b.readBigUInt64LE(66).toString(),postBaseLots:b.readBigInt64LE(74).toString(),
  postVirtualQuoteLots:b.readBigInt64LE(82).toString(),postQuoteCollateralUnits:b.readBigInt64LE(90).toString(),
  cumulativeFundingSnapshot:b.readBigInt64LE(98).toString()});
}

export function decodePhoenixOrderEvents({innerInstructions,staticAccountKeys,outerInstructionIndex,expected}={}){
 if(!Array.isArray(innerInstructions)||innerInstructions.length>64||!Array.isArray(staticAccountKeys)||
    staticAccountKeys.length<1||staticAccountKeys.length>256||!Number.isSafeInteger(outerInstructionIndex)||outerInstructionIndex<0||
    !expected||!Number.isSafeInteger(expected.slot)||expected.slot<1)fail('INPUT');
 for(const address of [expected.walletAddress,expected.traderAddress])phoenixKey(address);
 const packet=Buffer.from(expected.orderPacketBase64??'','base64');
 if(packet.length<2||packet.length>512||packet.toString('base64')!==expected.orderPacketBase64||packet[0]!==2)fail('PACKET');
 const selected=innerInstructions.filter(g=>g.index===outerInstructionIndex);
 if(selected.length!==1||!Array.isArray(selected[0].instructions)||selected[0].instructions.length>1024)fail('GROUP');
 const batches=new Map(),events=[];let totalBytes=0;
 for(const ix of selected[0].instructions){
  // Providers may send either the index into the account keys or the program id.
  const program=typeof ix?.programId==='string'?ix.programId:
   (Number.isInteger(ix?.programIdIndex)&&ix.programIdIndex>=0&&ix.programIdIndex<staticAccountKeys.length?staticAccountKeys[ix.programIdIndex]:null);
  if(typeof program!=='string')fail('PROGRAM');
  if(program!==ID.program)continue;
  if(typeof ix.data!=='string'||ix.data.length>23000)fail('DATA');
  let b;try{b=Buffer.from(bs58.decode(ix.data));}catch{fail('DATA');}
  if(bs58.encode(b)!==ix.data||b.length>16384)fail('DATA');
  totalBytes+=b.length;if(totalBytes>1048576)fail('SIZE');
  if(b.length<8)continue;
  const lengthsTag=b.subarray(0,8).equals(LENGTHS),logTag=b.subarray(0,8).equals(LOG);
  if(!lengthsTag&&!logTag)continue;
  if(b.length<16)fail('BATCH');
  const batch=b.readUInt32LE(8),count=b.readUInt32LE(12);
  if(count>512)fail('COUNT');
  if(lengthsTag){
   if(b.length!==16+count*2)fail('LENGTHS');
   const lengths=[];for(let i=0;i<count;i++){const size=b.readUInt16LE(16+i*2);if(size<1||size>16384)fail('LENGTHS');lengths.push(size);}
   const queue=batches.get(batch)??[];queue.push(lengths);if(queue.length>32)fail('COUNT');batches.set(batch,queue);
  }else{
   const lengths=batches.get(batch)?.shift();if(!lengths||lengths.length!==count)fail('UNPAIRED_BATCH');
   let cursor=16;
   for(const size of lengths){if(cursor+size>b.length)fail('TRUNCATED');events.push(b.subarray(cursor,cursor+size));cursor+=size;}
   if(cursor!==b.length||events.length>4096)fail('TRAILING');
  }
 }
 if([...batches.values()].some(q=>q.length))fail('UNPAIRED_BATCH');
 let currentHeader=null,slotSeen=false,packetSeen=false,summary=null,rejected=false,timestamp=null;
 for(const b of events){
  if(b[0]===0){
   if(b.length!==17||b.readBigUInt64LE(9)!==BigInt(expected.slot))fail('SLOT');
   timestamp=b.readBigUInt64LE(1).toString();slotSeen=true;
  }else if(b[0]===1){
   currentHeader=decodeHeader(b);
  }else if([4,6,44].includes(b[0])){
   if(!currentHeader||currentHeader.trader!==expected.traderAddress)continue;
   if(currentHeader.signer!==expected.walletAddress||currentHeader.symbol!==expected.symbol||
      currentHeader.assetId!==expected.assetId||currentHeader.tickSize!==expected.tickSize||
      currentHeader.baseLotsDecimals!==expected.baseLotsDecimals||currentHeader.quoteDecimals!==6)fail('IDENTITY');
   if(b[0]===44){
    if(b.length!==1+packet.length+40||packetSeen||!b.subarray(1,1+packet.length).equals(packet)||
       bs58.encode(b.subarray(1+packet.length,1+packet.length+32))!==expected.traderAddress)fail('PACKET');
    packetSeen=true;
   }else if(b[0]===6){
    if(summary||!packetSeen)fail('SUMMARY');summary=decodeSummary(b);if(summary.trader!==expected.traderAddress)fail('IDENTITY');
   }else{
    // OrderRejected carries the same u128 client id as the submitted IOC.
    // Compare with the packet's explicit client id supplied by the wire policy.
    if(b.length!==70||typeof expected.clientOrderId!=='string')fail('REJECTION');
    const nonce=b.readBigUInt64LE(5)+(b.readBigUInt64LE(13)<<64n);
    if(nonce.toString()!==expected.clientOrderId)fail('REJECTION');rejected=true;
   }
  }
 }
 if(!slotSeen||!packetSeen||(!summary&&!rejected))fail('MISSING_EVIDENCE');
 if(summary&&rejected)fail('CONFLICT');
 return Object.freeze({stage:'PHOENIX_NATIVE_ORDER_EVENTS',readyForSigning:false,timestamp,slot:expected.slot,
  outcome:summary?(summary.baseLotsFilled==='0'?'NO_FILL':'FILLED'):'REJECTED',summary,
  eventCount:events.length,requiresExactFinalizedTransaction:true});
}
