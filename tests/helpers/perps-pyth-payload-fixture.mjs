export function pythPayloadFixture({timestampUs,feedId=1,channelId=0,priceUnits='10000000000',exponent=-8}={}){
 const b=Buffer.alloc(31);b.writeUInt32LE(2479346549);b.writeBigUInt64LE(BigInt(timestampUs),4);b[12]=channelId;b[13]=1;
 b.writeUInt32LE(feedId,14);b[18]=2;b[19]=0;b.writeBigInt64LE(BigInt(priceUnits),20);b[28]=4;b.writeInt16LE(exponent,29);return b;
}
