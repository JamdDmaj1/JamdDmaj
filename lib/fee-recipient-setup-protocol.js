// Browser/server canonical boundary for ONE operator-paid ATA creation.
// No arbitrary payer, recipient, token, instruction, message or transaction.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {ed25519} from '@noble/curves/ed25519.js';
import {PERPS_PLATFORM_FEE as FEE} from './perps-platform-fee.js';
import {parseSetupSignedMessage,validateSetupGuard,SETUP_LIGHTHOUSE} from './fee-recipient-setup-guards.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
const COMPUTE='ComputeBudget111111111111111111111111111111';
// Fixed reviewed legacy budget: 100,000 CU * 30,000 micro-lamports = 3,000 lamports.
// Specifying both instructions prevents Phantom's default unsigned-wire rewrite.
export const RECIPIENT_SETUP_PRIORITY=Object.freeze({computeUnits:100000,microLamportsPerUnit:30000,priorityLamports:3000});
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
async function compileRecipientSetupMessage(blockhash,{legacy=false,readonlyOrder,versioned=false}={}){
 if(typeof legacy!=='boolean'||typeof versioned!=='boolean'||legacy&&versioned)fail();
 const [destination]=await getProgramDerivedAddress({programAddress:ATA,seeds:[key(FEE.recipient),key(TOKEN),key(FEE.mint)]});
 const expectedReadonly=[FEE.mint,SYSTEM,TOKEN,ATA,...legacy?[]:[COMPUTE]],ordered=readonlyOrder??expectedReadonly;
 if(!Array.isArray(ordered)||ordered.length!==expectedReadonly.length||new Set(ordered).size!==ordered.length||ordered.some(address=>!expectedReadonly.includes(address)))fail();
 const keys=[FEE.recipient,destination,...ordered];if(new Set(keys).size!==keys.length)fail();
 const index=address=>keys.indexOf(address),ataAccounts=[0,1,0,index(FEE.mint),index(SYSTEM),index(TOKEN)];
 const instructions=legacy?[1,index(ATA),6,...ataAccounts,1,1]:[
  3,index(COMPUTE),0,5,2,160,134,1,0, // SetComputeUnitLimit(100000)
  index(COMPUTE),0,9,3,48,117,0,0,0,0,0,0, // SetComputeUnitPrice(30000)
  index(ATA),6,...ataAccounts,1,1]; // One idempotent associated USDC account creation.
 return {destination,message:join([...versioned?[Uint8Array.of(128)]:[],Uint8Array.from([1,0,legacy?4:5,keys.length]),...keys.map(key),key(blockhash),Uint8Array.from(instructions),...versioned?[Uint8Array.of(0)]:[]])};
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
 const wire=setupBytes(encoded);
 if(wire.length!==304){
  const parsed=parseSetupSignedMessage(wire),{keys,header,instructions,blockhash}=parsed;
  const [destination]=await getProgramDerivedAddress({programAddress:ATA,seeds:[key(FEE.recipient),key(TOKEN),key(FEE.mint)]});
  const guarded=keys.includes(SETUP_LIGHTHOUSE),expected=[FEE.mint,SYSTEM,TOKEN,ATA,COMPUTE,...guarded?[SETUP_LIGHTHOUSE]:[]];
  if(header[0]!==1||header[1]!==0||header[2]!==keys.length-2||keys[0]!==FEE.recipient||keys[1]!==destination
   ||keys.length!==expected.length+2||new Set(keys).size!==keys.length||keys.slice(2).some(k=>!expected.includes(k)))fail();
  const match=(ix,program,accounts,data)=>ix&&keys[ix.program]===program&&equal(Uint8Array.from(ix.accounts),Uint8Array.from(accounts))&&equal(ix.data,Uint8Array.from(data));
  if(!match(instructions[0],COMPUTE,[],[2,160,134,1,0])||!match(instructions[1],COMPUTE,[],[3,48,117,0,0,0,0,0,0])
   ||!match(instructions[2],ATA,[0,1,0,keys.indexOf(FEE.mint),keys.indexOf(SYSTEM),keys.indexOf(TOKEN)],[1]))fail();
  const guards=instructions.slice(3);if(guarded?guards.length<1||guards.length>4:guards.length!==0)fail();
  for(const ix of guards)validateSetupGuard(ix,keys);
  if(!ed25519.verify(wire.subarray(1,65),wire.subarray(65),key(FEE.recipient)))fail();
  return Object.freeze({signature:bs58.encode(wire.subarray(1,65)),blockhash,destination,wire,legacy:false,versioned:parsed.versioned,guards:guards.length});
 }
 if(wire[0]!==1)fail();
 // Historical no-budget signature inspection is for reconciliation only.
 const readonlyOrder=Array.from({length:4},(_,i)=>bs58.encode(wire.subarray(69+(i+2)*32,69+(i+3)*32)));
 const blockhash=bs58.encode(wire.subarray(261,293)),compiled=await compileRecipientSetupMessage(blockhash,{legacy:true,readonlyOrder});
 if(!equal(wire.subarray(65),compiled.message)||!ed25519.verify(wire.subarray(1,65),compiled.message,key(FEE.recipient)))fail();
 return Object.freeze({signature:bs58.encode(wire.subarray(1,65)),blockhash,destination:compiled.destination,wire,legacy:true,versioned:false,guards:0});
}
async function validateSignedRecipientSetup(packet,encoded,{now=Date.now()}={}){
 const checked=await validateRecipientSetupPacket(packet,{now}),signed=await inspectSignedRecipientSetup(encoded);
 if(signed.legacy||signed.blockhash!==packet.blockhash||signed.destination!==checked.destination)fail();return signed;
}
 return Object.freeze({policy:FEE,compileRecipientSetupMessage,validateRecipientSetupPacket,inspectSignedRecipientSetup,validateSignedRecipientSetup});
}
export const recipientSetupProtocol=createRecipientSetupProtocol();
export const {compileRecipientSetupMessage,validateRecipientSetupPacket,inspectSignedRecipientSetup,validateSignedRecipientSetup}=recipientSetupProtocol;
