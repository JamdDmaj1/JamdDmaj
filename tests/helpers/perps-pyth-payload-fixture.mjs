export function pythPayloadFixture({timestampUs,feedId=1,channelId=0,priceUnits='10000000000',exponent=-8,feedUpdateTimestampUs=undefined,confidenceUnits=undefined}={}){
 const extra=[];
 if(confidenceUnits!==undefined){const confidence=Buffer.alloc(9);confidence[0]=5;confidence.writeBigInt64LE(BigInt(confidenceUnits??0),1);extra.push(confidence);}
 if(feedUpdateTimestampUs!==undefined){const updated=Buffer.alloc(feedUpdateTimestampUs===null?2:10);updated[0]=12;updated[1]=feedUpdateTimestampUs===null?0:1;if(feedUpdateTimestampUs!==null)updated.writeBigUInt64LE(BigInt(feedUpdateTimestampUs),2);extra.push(updated);}
 const b=Buffer.alloc(31);b.writeUInt32LE(2479346549);b.writeBigUInt64LE(BigInt(timestampUs),4);b[12]=channelId;b[13]=1;
 b.writeUInt32LE(feedId,14);b[18]=2+extra.length;b[19]=0;b.writeBigInt64LE(BigInt(priceUnits),20);b[28]=4;b.writeInt16LE(exponent,29);return Buffer.concat([b,...extra]);
}
