// Server-only, additional cryptographic check of exact compiled instruction
// bytes. This does not authenticate a Pyth trusted signer, price contents or
// replace native precompile execution. No custody signing capability is used.
import {createPublicKey,verify,createHash} from 'node:crypto';
import {ed25519} from '@noble/curves/ed25519.js';
const ED='Ed25519SigVerify111111111111111111111111111';
const SPKI=Buffer.from('302a300506032b6570032100','hex');
function fail(){throw Error('INVALID_PERPS_ORACLE_ED25519');}
function bytes(ix){
 if(typeof ix?.dataBase64!=='string'||ix.dataBase64.length>1644)fail();
 const b=Buffer.from(ix.dataBase64,'base64');if(b.length>1232||b.toString('base64')!==ix.dataBase64)fail();return b;
}
export function verifyPerpsOracleEd25519(instructions,keys,index){
 if(!Array.isArray(instructions)||instructions.length>64||!Array.isArray(keys)||!Number.isSafeInteger(index)||index<0)fail();
 const ix=instructions[index];if(!ix||keys[ix.program]!==ED||!Array.isArray(ix.accounts)||ix.accounts.length)fail();
 const data=bytes(ix);if(data.length<2||data[1]!==0||data[0]<1||data[0]>8||data.length<2+14*data[0])fail();
 const slice=(instructionIndex,offset,size)=>{
  const actualIndex=instructionIndex===65535?index:instructionIndex;
  if(actualIndex>=instructions.length)fail();const source=bytes(instructions[actualIndex]);
  if(offset+size>source.length)fail();return source.subarray(offset,offset+size);
 };
 const signatures=[];
 for(let i=0;i<data[0];i++){
  const at=2+14*i,values=Array.from({length:7},(_,j)=>data.readUInt16LE(at+2*j));
  const [signatureOffset,signatureInstructionIndex,publicKeyOffset,publicKeyInstructionIndex,messageOffset,messageSize,messageInstructionIndex]=values;
  const signature=slice(signatureInstructionIndex,signatureOffset,64),publicKey=slice(publicKeyInstructionIndex,publicKeyOffset,32),message=slice(messageInstructionIndex,messageOffset,messageSize);
  const key=createPublicKey({key:Buffer.concat([SPKI,publicKey]),format:'der',type:'spki'});
  // OpenSSL alone accepts some small-order keys (including the identity).
  // Require strict RFC8032 verification too; native VM verification is still
  // mandatory and Pyth trusted-signer membership remains a separate check.
  if(!ed25519.verify(signature,message,publicKey,{zip215:false})||!verify(null,message,key,signature))fail();
  signatures.push(Object.freeze({signatureOffset,signatureInstructionIndex,publicKeyOffset,publicKeyInstructionIndex,messageOffset,messageSize,messageInstructionIndex,
   publicKeyHex:publicKey.toString('hex'),messageSha256:createHash('sha256').update(message).digest('hex')}));
 }
 return Object.freeze(signatures);
}
// Bind the selected signature to the exact serialized SolanaMessage in DOVES'
// Vec<u8> at byte 12. A valid signature over unrelated bytes is insufficient.
export function verifyPerpsDovesSignedMessage(instructions,keys,index){
 const data=bytes(instructions[index]);if(data.length<118||data.subarray(0,8).toString('hex')!=='cb3b5fb0ec154999')fail();
 const length=data.readUInt32LE(8);if(length<102||data.length!==16+length||data.readUInt32LE(12)!==2182742457)fail();
 const payloadLength=data.readUInt16LE(112);if(length!==102+payloadLength||data[15+length]>1)fail();
 const edIndex=data.readUInt16LE(12+length),signatureIndex=data[14+length];if(edIndex>=index)fail();
 const signatures=verifyPerpsOracleEd25519(instructions,keys,edIndex),selected=signatures[signatureIndex];
 if(!selected||selected.signatureOffset!==16||selected.publicKeyOffset!==80||selected.messageOffset!==114||selected.messageSize!==payloadLength
  ||selected.signatureInstructionIndex!==index||selected.publicKeyInstructionIndex!==index||selected.messageInstructionIndex!==index)fail();
 return selected;
}
