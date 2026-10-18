// Server-only structural gate, matching NativePerpsTransaction/SolanaMessage.
// NOT approval to sign: chain accounts, instruction policy, intent and simulated
// effects must still be independently validated before any custody signer runs.
import {createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
function fail(){throw Error('INVALID_PERPS_ENVELOPE');}
function freezeArray(values){return Object.freeze(Array.from(values));}
export function decodeServerPerpsEnvelope(encoded,payer){
 if(typeof encoded!=='string'||encoded.length>1644)fail();
 const wire=Buffer.from(encoded,'base64');
 if(wire.length<194||wire.length>1232||wire.toString('base64')!==encoded||wire[0]!==3)fail();
 if(wire.subarray(1,129).some(n=>n!==0)||!wire.subarray(129,193).some(n=>n!==0))fail();
 const message=wire.subarray(193);let offset=0;
 const u8=()=>{if(offset>=message.length)fail();return message[offset++];};
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||n>message.length-offset)fail();const b=message.subarray(offset,offset+n);offset+=n;return b;};
 const compact=()=>{
  let value=0;
  for(let i=0;i<3;i++){
   const byte=u8();if(i===2&&(byte&252)!==0)fail();value|=(byte&127)<<(i*7);
   if(!(byte&128)){if(i>0&&(byte&127)===0)fail();return value;}
  }
  fail();
 };
 const prefix=u8(),version=(prefix&128)?0:-1;
 if((prefix&128)&&prefix!==128)fail();
 const signatures=version===0?u8():prefix,readonlySigned=u8(),readonlyUnsigned=u8(),count=compact();
 if(signatures!==3||![1,2].includes(readonlySigned)||count<3||count>256||readonlyUnsigned>count-3)fail();
 const keys=Array.from({length:count},()=>bs58.encode(take(32)));
 if(new Set(keys).size!==count||keys[0]!==payer)fail();
 const blockhash=bs58.encode(take(32)),instructionCount=compact();
 if(instructionCount<1||instructionCount>64)fail();
 const instructions=Array.from({length:instructionCount},()=>{
  const program=u8(),accounts=freezeArray(take(compact())),dataBase64=take(compact()).toString('base64');
  return Object.freeze({program,accounts,dataBase64});
 });
 const lookups=[];let loaded=0;
 if(version===0){
  const tables=compact();if(tables>32)fail();
  for(let i=0;i<tables;i++){
   const address=bs58.encode(take(32)),writable=freezeArray(take(compact())),readonly=freezeArray(take(compact()));
   const indices=[...writable,...readonly];
   if(!indices.length||new Set(indices).size!==indices.length||lookups.some(l=>l.address===address))fail();
   loaded+=indices.length;if(count+loaded>256)fail();
   lookups.push(Object.freeze({address,writable,readonly}));
  }
 }
 if(offset!==message.length)fail();
 for(const instruction of instructions){
  if(instruction.program===0||instruction.program>=count||instruction.accounts.some(i=>i>=count+loaded))fail();
 }
 const apiKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(keys[2]))]),format:'der',type:'spki'});
 if(!verify(null,message,apiKey,wire.subarray(129,193)))fail();
 return Object.freeze({stage:'STRUCTURE_ONLY',readyForSigning:false,serializedTxBase64:encoded,version,
  readonlySigned,readonlyUnsigned,staticKeys:freezeArray(keys),blockhash,accountCount:count+loaded,
  instructions:Object.freeze(instructions),lookups:Object.freeze(lookups)});
}
