import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {verifyPerpsOracleEd25519,verifyPerpsDovesSignedMessage} from '../lib/perps-oracle-ed25519.js';
const ED='Ed25519SigVerify111111111111111111111111111',keys=[ED,'test-doves'];
// Only unfunded, ephemeral oracle test keys. No wallet or financial message is
// signed here; these payload bytes cannot be submitted as Solana transactions.
function fixture({embedded=false,count=1}={}){
 const pair=generateKeyPairSync('ed25519'),message=Buffer.from('unfunded oracle test payload'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
 const length=102+message.length,data=Buffer.alloc(16+length);Buffer.from('cb3b5fb0ec154999','hex').copy(data);data.writeUInt32LE(length,8);data.writeUInt32LE(2182742457,12);
 sign(null,message,pair.privateKey).copy(data,16);publicKey.copy(data,80);data.writeUInt16LE(message.length,112);message.copy(data,114);data.writeUInt16LE(0,12+length);data[15+length]=1;
 const header=2+14*count,ed=Buffer.alloc(embedded?header+96+message.length:header);ed[0]=count;
 for(let i=0;i<count;i++){
  const values=embedded?[header+32,65535,header,65535,header+96,message.length,65535]:[16,1,80,1,114,message.length,1];
  values.forEach((value,j)=>ed.writeUInt16LE(value,2+i*14+j*2));
 }
 if(embedded){publicKey.copy(ed,header);sign(null,message,pair.privateKey).copy(ed,header+32);message.copy(ed,header+96);}
 return {instructions:[{program:0,accounts:[],dataBase64:ed.toString('base64')},{program:1,accounts:[],dataBase64:data.toString('base64')}],message,publicKey};
}
function change(f,index,mutate){const data=Buffer.from(f.instructions[index].dataBase64,'base64');mutate(data);f.instructions[index].dataBase64=data.toString('base64');}
test('independent crypto verifies exact cross-instruction and embedded messages with bounded multiple signatures',()=>{
 for(const embedded of [false,true])for(const count of [1,2,8]){
  const f=fixture({embedded,count}),result=verifyPerpsOracleEd25519(f.instructions,keys,0);
  assert.equal(result.length,count);assert.equal(result[0].publicKeyHex,f.publicKey.toString('hex'));
  assert.equal(result[0].messageSha256,createHash('sha256').update(f.message).digest('hex'));
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result[0]));
  if(!embedded)assert.deepEqual(verifyPerpsDovesSignedMessage(f.instructions,keys,1),result[0]);
 }
});
test('tampered signature, key, message, signature count, offsets, index and noncanonical encodings fail before any RPC',()=>{
 for(const mode of ['signature','key','message','count0','count9','truncated','offset','ref','pad','accounts','program','base64','secondSignature']){
  const f=fixture({count:2});
  if(['signature','key','message'].includes(mode))change(f,1,b=>{b[{signature:16,key:80,message:114}[mode]]^=1;});
  if(mode==='count0'||mode==='count9')change(f,0,b=>{b[0]=mode==='count0'?0:9;});
  if(mode==='truncated')f.instructions[0].dataBase64=Buffer.from([1,0]).toString('base64');
  if(mode==='offset')change(f,0,b=>b.writeUInt16LE(65535,2));
  if(mode==='ref')change(f,0,b=>b.writeUInt16LE(64,4));
  if(mode==='pad')change(f,0,b=>{b[1]=1;});
  if(mode==='accounts')f.instructions[0].accounts=[0];
  if(mode==='program')f.instructions[0].program=1;
  if(mode==='base64')f.instructions[0].dataBase64+='\n';
  if(mode==='secondSignature')change(f,0,b=>b.writeUInt16LE(17,16));
  assert.throws(()=>verifyPerpsOracleEd25519(f.instructions,keys,0),mode);
 }
});
test('a valid signature over embedded or different bytes cannot authorize a DOVES price update',()=>{
 const embedded=fixture({embedded:true});verifyPerpsOracleEd25519(embedded.instructions,keys,0);
 assert.throws(()=>verifyPerpsDovesSignedMessage(embedded.instructions,keys,1));
 for(const mode of ['magic','length','payloadLength','edIndex','sigIndex','tag','trailing','flag']){
  const f=fixture(),length=Buffer.from(f.instructions[1].dataBase64,'base64').readUInt32LE(8);
  change(f,1,b=>{
   if(mode==='magic')b[12]^=1;
   if(mode==='length')b.writeUInt32LE(length-1,8);
   if(mode==='payloadLength')b.writeUInt16LE(0,112);
   if(mode==='edIndex')b.writeUInt16LE(1,12+length);
   if(mode==='sigIndex')b[14+length]=1;
   if(mode==='tag')b[0]^=1;
   if(mode==='flag')b[15+length]=2;
  });
  if(mode==='trailing')f.instructions[1].dataBase64=Buffer.concat([Buffer.from(f.instructions[1].dataBase64,'base64'),Buffer.from([0])]).toString('base64');
  assert.throws(()=>verifyPerpsDovesSignedMessage(f.instructions,keys,1),mode);
 }
});

test('small-order identity keys, noncanonical points and noncanonical scalars cannot pass the independent verifier',()=>{
 for(const mode of ['identity','noncanonicalKey','noncanonicalR','noncanonicalScalar']){
  const f=fixture();change(f,1,b=>{
   if(mode==='identity'){
    b.fill(0,16,112);b[16]=1;b[80]=1;
   }
   if(mode==='noncanonicalKey'||mode==='noncanonicalR'){
    const start=mode==='noncanonicalKey'?80:16;b.fill(255,start,start+32);b[start]=237;b[start+31]=127;
   }
   if(mode==='noncanonicalScalar'){
    const order=2n**252n+27742317777372353535851937790883648493n;
    let scalar=0n;for(let i=31;i>=0;i--)scalar=(scalar<<8n)+BigInt(b[48+i]);scalar+=order;
    for(let i=0;i<32;i++){b[48+i]=Number(scalar&255n);scalar>>=8n;}
   }
  });
  assert.throws(()=>verifyPerpsOracleEd25519(f.instructions,keys,0),mode);
 }
});
