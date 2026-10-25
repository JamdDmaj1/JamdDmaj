// Browser/server canonical boundary for ONE operator-paid ATA creation.
// No arbitrary payer, recipient, token, instruction, message or transaction.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {ed25519} from '@noble/curves/ed25519.js';
import {PERPS_PLATFORM_FEE as FEE} from './perps-platform-fee.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
function fail(){throw Error('INVALID_RECIPIENT_SETUP_REVIEW');}
function key(s){try{const b=bs58.decode(s);if(b.length!==32||bs58.encode(b)!==s)fail();return b;}catch{fail();}}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function units(s,max){if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(s)||BigInt(s)>max)fail();return BigInt(s);}
function join(arrays){const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){out.set(a,offset);offset+=a.length;}return out;}
function equal(a,b){return a.length===b.length&&a.every((n,i)=>n===b[i]);}
export function setupBase64(bytes){return btoa(String.fromCharCode(...bytes));}
export function setupBytes(text){if(typeof text!=='string'||text.length>1644)fail();let b;try{b=Uint8Array.from(atob(text),c=>c.charCodeAt(0));}catch{fail();}if(b.length>1232||setupBase64(b)!==text)fail();return b;}
export function createRecipientSetupProtocol({recipient=FEE.recipient,mint=FEE.mint}={}){
 const FEE=Object.freeze({recipient,mint});key(recipient);key(mint);
async function compileRecipientSetupMessage(blockhash){
 const [destination]=await getProgramDerivedAddress({programAddress:ATA,seeds:[key(FEE.recipient),key(TOKEN),key(FEE.mint)]});
 const keys=[FEE.recipient,destination,FEE.mint,SYSTEM,TOKEN,ATA];
 return {destination,message:join([Uint8Array.from([1,0,4,6]),...keys.map(key),key(blockhash),Uint8Array.from([1,5,6,0,1,0,2,3,4,1,1])])};
}
async function validateRecipientSetupPacket(packet,{now=Date.now()}={}){
 if(!packet||packet.stage!=='UNSIGNED_FEE_RECIPIENT_USDC_SETUP'||packet.network!=='solana-mainnet'||packet.owner!==FEE.recipient||packet.payer!==FEE.recipient
  ||packet.mint!==FEE.mint||packet.operation!=='CREATE_ASSOCIATED_USDC_ACCOUNT_IDEMPOTENT'||packet.usdcTransferredUnits!=='0'
  ||packet.readyForSigning!==false||packet.signed!==false||packet.submitted!==false||packet.requiresFreshWalletReview!==true)fail();
 const at=integer(now),created=integer(packet.preparedAt),expires=integer(packet.reviewExpiresAt);
 if(created>at+2000||at>=expires||expires!==created+60000)fail();integer(packet.observedSlot);integer(packet.lastValidBlockHeight);
 const rent=units(packet.rentReserveLamports,10000000n),fee=units(packet.networkFeeLamports,10000n),total=units(packet.estimatedTotalLamports,10010000n),balance=units(packet.operatorBalanceLamports,BigInt(Number.MAX_SAFE_INTEGER));
 if(rent===0n||fee===0n||total!==rent+fee||balance<total)fail();
 const compiled=await compileRecipientSetupMessage(packet.blockhash),wire=setupBytes(packet.serializedTxBase64);
 if(packet.destination!==compiled.destination||wire.length!==compiled.message.length+65||wire[0]!==1||wire.subarray(1,65).some(n=>n!==0)||!equal(wire.subarray(65),compiled.message))fail();
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',compiled.message));
 if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!==packet.messageSha256)fail();
 return Object.freeze({walletAddress:FEE.recipient,destination:compiled.destination,wire,expiresAt:expires});
}
async function inspectSignedRecipientSetup(encoded){
 const wire=setupBytes(encoded);if(wire.length!==304||wire[0]!==1)fail();
 const blockhash=bs58.encode(wire.subarray(261,293)),compiled=await compileRecipientSetupMessage(blockhash);
 if(!equal(wire.subarray(65),compiled.message)||!ed25519.verify(wire.subarray(1,65),compiled.message,key(FEE.recipient)))fail();
 return Object.freeze({signature:bs58.encode(wire.subarray(1,65)),blockhash,destination:compiled.destination,wire});
}
async function validateSignedRecipientSetup(packet,encoded,{now=Date.now()}={}){
 const checked=await validateRecipientSetupPacket(packet,{now}),signed=await inspectSignedRecipientSetup(encoded);
 if(!equal(signed.wire.subarray(65),checked.wire.subarray(65)))fail();return signed;
}
 return Object.freeze({policy:FEE,compileRecipientSetupMessage,validateRecipientSetupPacket,inspectSignedRecipientSetup,validateSignedRecipientSetup});
}
export const recipientSetupProtocol=createRecipientSetupProtocol();
export const {compileRecipientSetupMessage,validateRecipientSetupPacket,inspectSignedRecipientSetup,validateSignedRecipientSetup}=recipientSetupProtocol;
