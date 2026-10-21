import bs58 from 'bs58';
import {PERPS_PYTH_LAZER} from '../../lib/perps-pyth-storage.js';
export function pythStorageFixture(signers=[]){
 const b=Buffer.alloc(381);Buffer.from('d175ffb9c4af4409','hex').copy(b);b.fill(1,8,40);
 Buffer.from(bs58.decode(PERPS_PYTH_LAZER.treasury)).copy(b,40);b.writeBigUInt64LE(1n,72);b[80]=signers.length;
 for(const [i,s]of signers.entries()){
  Buffer.from(s.publicKeyHex,'hex').copy(b,81+40*i);b.writeBigInt64LE(BigInt(s.expiresAtSeconds),113+40*i);
 }
 return {owner:PERPS_PYTH_LAZER.program,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']};
}
