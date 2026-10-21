// Strict bounded decoder for Pyth's standard little-endian payload. Parsing is
// not authentication: signed-message verification and native signer trust are
// required by the second entry point. No signer or send transport is accepted.
import {verifyPerpsDovesSignedMessage} from './perps-oracle-ed25519.js';
import {requirePerpsPythTrustedSigner} from './perps-pyth-storage.js';
export function decodePerpsPythPayload(encoded){
 const fail=()=>{throw Error('INVALID_PERPS_PYTH_PAYLOAD');};
 if(typeof encoded!=='string'||encoded.length>1644)fail();
 const b=Buffer.from(encoded,'base64');if(b.length<14||b.length>1232||b.toString('base64')!==encoded)fail();let at=0;
 const take=n=>{if(at+n>b.length)fail();const x=b.subarray(at,at+n);at+=n;return x;};
 const u8=()=>take(1)[0],u16=()=>take(2).readUInt16LE(),i16=()=>take(2).readInt16LE(),u32=()=>take(4).readUInt32LE(),u64=()=>take(8).readBigUInt64LE(),i64=()=>take(8).readBigInt64LE();
 if(u32()!==2479346549)fail();const timestampUs=u64(),channelId=u8(),count=u8();if(timestampUs===0n||count<1||count>32)fail();
 const feeds=[];
 for(let i=0;i<count;i++){
  const feedId=u32(),propertyCount=u8();if(feedId===0||propertyCount<1||propertyCount>13||feeds.some(f=>f.feedId===feedId))fail();
  const properties={};
  for(let j=0;j<propertyCount;j++){
   const tag=u8();if(Object.hasOwn(properties,tag)||tag>12)fail();let value;
   if([0,1,2,5,10,11].includes(tag)){const n=i64();value=n===0n?null:n.toString();}
   else if(tag===3)value=u16();
   else if(tag===4||tag===9)value=i16();
   else {const present=u8();if(present>1)fail();value=present?(tag===6?i64():u64()).toString():null;}
   properties[tag]=value;
  }
  feeds.push(Object.freeze({feedId,properties:Object.freeze(properties)}));
 }
 if(at!==b.length)fail();return Object.freeze({timestampUs:timestampUs.toString(),channelId,feeds:Object.freeze(feeds)});
}
export function readSignedPerpsPythPayload(instructions,keys,index,{storage,nowSeconds,maxAgeSeconds=30}={}){
 if(!Number.isSafeInteger(nowSeconds)||nowSeconds<0||!Number.isSafeInteger(maxAgeSeconds)||maxAgeSeconds<1||maxAgeSeconds>30)throw Error('INVALID_PERPS_PYTH_PAYLOAD');
 const selected=verifyPerpsDovesSignedMessage(instructions,keys,index);requirePerpsPythTrustedSigner(storage,selected.publicKeyHex,nowSeconds);
 const data=Buffer.from(instructions[index].dataBase64,'base64'),payload=decodePerpsPythPayload(data.subarray(114,114+selected.messageSize).toString('base64'));
 const time=BigInt(payload.timestampUs),now=BigInt(nowSeconds)*1000000n;
 if(time<now-BigInt(maxAgeSeconds)*1000000n||time>now+2000000n)throw Error('STALE_PERPS_PYTH_PAYLOAD');
 return Object.freeze({...payload,publicKeyHex:selected.publicKeyHex,instructionIndex:index});
}
export function requirePerpsPythFeed(payload,feedId,channelId){
 const feed=payload.feeds.find(f=>f.feedId===feedId),price=feed?.properties[0],exponent=feed?.properties[4];
 if(payload.channelId!==channelId||typeof price!=='string'||BigInt(price)<=0n||!Number.isInteger(exponent)||exponent< -18||exponent>0)throw Error('MISMATCHED_PERPS_PYTH_FEED');
 return Object.freeze({feedId,channelId,priceUnits:price,exponent,timestampUs:payload.timestampUs});
}
