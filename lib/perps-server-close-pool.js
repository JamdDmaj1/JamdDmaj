// Pinned program-owned Pool layout, read from the confirmed mainnet Anchor IDL
// at slot 460210968. This compares configuration/effects, not payout economics
// or signing authority. Unknown layout changes fail closed.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PERPS_PROGRAM} from './perps-server-custody.js';
const TAG=createHash('sha256').update('account:Pool').digest().subarray(0,8);
function fail(){throw Error('PERPS_CLOSE_POOL_CONFIGURATION_MISMATCH');}
function decode(account,requiredCustodies){
 if(account?.owner!==PERPS_PROGRAM||account.executable!==false||!Array.isArray(account.data)||account.data[1]!=='base64')fail();
 const b=Buffer.from(account.data[0],'base64');
 if(b.toString('base64')!==account.data[0]||b.length>8192||b.length<16||!b.subarray(0,8).equals(TAG))fail();
 const nameLength=b.readUInt32LE(8);if(nameLength<1||nameLength>64||b.length<16+nameLength)fail();
 const name=b.subarray(12,12+nameLength);if(!Buffer.from(name.toString('utf8'),'utf8').equals(name)||name.includes(0))fail();
 const count=b.readUInt32LE(12+nameLength);if(count<1||count>16)fail();
 const start=16+nameLength,offset=start+count*32;if(b.length<offset+236)fail();
 const custodies=Array.from({length:count},(_,i)=>bs58.encode(b.subarray(start+i*32,start+(i+1)*32)));
 if(new Set(custodies).size!==count||requiredCustodies.some(key=>!custodies.includes(key))||b[offset+219]>1)fail();
 for(const at of [offset+128,offset+203])if(b.readBigInt64LE(at)<0n)fail();
 return {b,offset};
}
export function checkPerpsClosePoolConfiguration(before,after,requiredCustodies){
 if(!Array.isArray(requiredCustodies)||requiredCustodies.length<1)fail();
 const a=decode(before,requiredCustodies),b=decode(after,requiredCustodies),p=a.offset;
 if(p!==b.offset||a.b.length!==b.b.length||before.lamports!==after.lamports)fail();
 // Only AUM, collected realized fees and AUM observation time/slot are mutable.
 // All fee parameters, limits, custodies, authority and unknown tail bytes stay
 // byte-for-byte identical. APR reset/distribution is not a close capability.
 if(b.b.readBigUInt64LE(p+144)<a.b.readBigUInt64LE(p+144)
  ||b.b.readBigInt64LE(p+203)<a.b.readBigInt64LE(p+203)
  ||b.b.readBigUInt64LE(p+228)<a.b.readBigUInt64LE(p+228))fail();
 for(const [offset,length]of [[p,16],[p+144,8],[p+203,8],[p+228,8]]){a.b.fill(0,offset,offset+length);b.b.fill(0,offset,offset+length);}
 if(!a.b.equals(b.b))fail();
}
