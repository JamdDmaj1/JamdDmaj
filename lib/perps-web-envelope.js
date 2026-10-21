// Browser-safe structural/cosignature boundary. This is NOT native chain
// validation, a signer grant or permission to submit a transaction.
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
function fail(){throw Error('INVALID_WEB_PERPS_ENVELOPE');}
export function webPerpsBase64(bytes){return btoa(String.fromCharCode(...bytes));}
export function webPerpsBytes(encoded){
 if(typeof encoded!=='string'||encoded.length>1644)fail();
 let bytes;try{bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));}catch{fail();}
 if(bytes.length>1232||webPerpsBase64(bytes)!==encoded)fail();return bytes;
}
export function inspectWebPerpsEnvelope(encoded,payer){
 const wire=webPerpsBytes(encoded);
 if(wire.length<194||wire[0]!==3||wire.subarray(1,129).some(n=>n!==0)||!wire.subarray(129,193).some(n=>n!==0))fail();
 const message=wire.subarray(193);let offset=0;
 const byte=()=>{if(offset>=message.length)fail();return message[offset++];};
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||n>message.length-offset)fail();const value=message.subarray(offset,offset+n);offset+=n;return value;};
 const compact=()=>{let value=0;for(let i=0;i<3;i++){const n=byte();if(i===2&&(n&252)!==0)fail();value|=(n&127)<<(7*i);if(!(n&128)){if(i>0&&(n&127)===0)fail();return value;}}fail();};
 const prefix=byte(),version=prefix&128?0:-1;if(prefix&128&&prefix!==128)fail();
 const signatures=version===0?byte():prefix,readonlySigned=byte(),readonlyUnsigned=byte(),count=compact();
 if(signatures!==3||![1,2].includes(readonlySigned)||count<3||count>256||readonlyUnsigned>count-3)fail();
 const keys=Array.from({length:count},()=>bs58.encode(take(32)));
 if(new Set(keys).size!==count||keys[0]!==payer)fail();
 const blockhash=bs58.encode(take(32)),n=compact();if(n<1||n>64)fail();
 const instructions=Array.from({length:n},()=>Object.freeze({program:byte(),accounts:Object.freeze(Array.from(take(compact()))),dataBase64:webPerpsBase64(take(compact()))}));
 const lookups=[];let loaded=0;
 if(version===0){const count=compact();if(count>32)fail();for(let i=0;i<count;i++){
  const address=bs58.encode(take(32)),writable=Object.freeze(Array.from(take(compact()))),readonly=Object.freeze(Array.from(take(compact()))),indices=[...writable,...readonly];
  if(!indices.length||new Set(indices).size!==indices.length||lookups.some(table=>table.address===address))fail();
  loaded+=indices.length;if(keys.length+loaded>256)fail();lookups.push(Object.freeze({address,writable,readonly}));
 }}
 if(offset!==message.length)fail();for(const instruction of instructions)if(instruction.program===0||instruction.program>=keys.length||instruction.accounts.some(i=>i>=keys.length+loaded))fail();
 if(!ed25519.verify(wire.subarray(129,193),message,bs58.decode(keys[2]),{zip215:false}))fail();
 return Object.freeze({stage:'STRUCTURE_ONLY',readyForSigning:false,serializedTxBase64:encoded,version,readonlySigned,readonlyUnsigned,
  staticKeys:Object.freeze(keys),blockhash,accountCount:keys.length+loaded,instructions:Object.freeze(instructions),lookups:Object.freeze(lookups)});
}
export function verifyWebPerpsOwnerSignature(encoded,original,walletAddress){
 inspectWebPerpsEnvelope(original,walletAddress);
 const before=webPerpsBytes(original),signed=webPerpsBytes(encoded);
 if(signed.length!==before.length||signed[0]!==3||signed.subarray(65).some((n,i)=>n!==before[i+65])
  ||!ed25519.verify(signed.subarray(1,65),signed.subarray(193),bs58.decode(walletAddress),{zip215:false}))fail();
 return Object.freeze({signature:bs58.encode(signed.subarray(1,65)),signedBase64:encoded});
}
