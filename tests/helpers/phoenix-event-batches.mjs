import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {PHOENIX_IDENTITIES as ID} from '../../lib/phoenix-market-plan.js';
// Independent layout writer, matching the official real-transaction parity test.
export function phoenixEventBatches({wire,plan,traderAddress,slot,timestamp,quote,fee,postBase,postVirtual,postCollateral}){
 const message=getCompiledTransactionMessageDecoder().decode(Buffer.from(wire.messageBase64,'base64'));
 const slotEvent=Buffer.alloc(17);slotEvent.writeBigUInt64LE(BigInt(timestamp),1);slotEvent.writeBigUInt64LE(BigInt(slot),9);
 const header=Buffer.alloc(107);header[0]=1;header.writeBigUInt64LE(1n,1);header.write(plan.symbol,17,'ascii');
 header.writeUInt32LE(plan.market.assetId,33);header.writeUInt32LE(Number(plan.market.tickSize),37);header.writeInt8(plan.market.baseLotsDecimals,41);header[42]=6;
 header.set(bs58.decode(plan.walletAddress),43);header.set(bs58.decode(traderAddress),75);
 const orderData=Buffer.from(message.instructions.at(-1).data).subarray(8),packet=Buffer.alloc(1+orderData.length+40);
 packet[0]=44;packet.set(orderData,1);packet.set(bs58.decode(traderAddress),1+orderData.length);packet.writeBigUInt64LE(1n,packet.length-8);
 const summary=Buffer.alloc(106);summary[0]=6;summary.set(bs58.decode(traderAddress),1);summary.writeBigUInt64LE(1n,33);summary[49]=plan.side==='LONG'?0:1;
 summary.writeBigUInt64LE(BigInt(plan.baseLots),50);summary.writeBigUInt64LE(BigInt(quote),58);summary.writeBigUInt64LE(BigInt(fee),66);
 summary.writeBigInt64LE(BigInt(postBase),74);summary.writeBigInt64LE(BigInt(postVirtual),82);summary.writeBigInt64LE(BigInt(postCollateral),90);
 const events=[slotEvent,header,packet,summary],prefix=name=>createHash('sha256').update('global:'+name).digest().subarray(0,8);
 const table=Buffer.alloc(16+events.length*2);prefix('log_event_lengths').copy(table);table.writeUInt32LE(events.length,12);events.forEach((b,i)=>table.writeUInt16LE(b.length,16+i*2));
 const head=Buffer.alloc(16);prefix('log').copy(head);head.writeUInt32LE(events.length,12);
 return [{index:message.instructions.length-1,instructions:[table,Buffer.concat([head,...events])].map(b=>({programIdIndex:message.staticAccounts.indexOf(ID.program),data:bs58.encode(b)}))}];
}
