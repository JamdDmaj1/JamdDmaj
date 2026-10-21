// Durable close facts, not permission to use custody keys or broadcast. The
// parent remains PREPARED while its separate financial execution is unresolved.
import {createHash} from 'node:crypto';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {perpsClosePayoutRecordBinding,requireVerifiedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {canonicalPerpsCloseSettlement} from './perps-close-settlement.js';
const intents=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_EXECUTION_RECORD');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function hex(s){if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))fail();return s;}
function units(s){if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(s)||BigInt(s)>18446744073709551615n)fail();return BigInt(s);}
function key(s,n){try{const b=bs58.decode(s);if(b.length!==n||bs58.encode(b)!==s)fail();return Buffer.from(b);}catch{fail();}}
export function perpsCloseExecutionParentBinding(parent){
 if(parent?.state!=='PREPARED')fail();const s=JSON.parse(parent.settlement);
 if(canonicalPerpsCloseSettlement(s,{walletAddress:parent.wallet,positionAddress:parent.position})!==parent.settlement||s.version!==2||s.mode!=='COLLATERAL_THEN_USDC')fail();
 return perpsClosePayoutRecordBinding(parent);
}
export function inspectRecordedPerpsCloseOwnerWire(parent,encoded){
 if(typeof encoded!=='string'||encoded.length>1644)fail();perpsCloseExecutionParentBinding(parent);
 const signed=Buffer.from(encoded,'base64');if(signed.toString('base64')!==encoded||signed.length>1232||signed.length<194||signed[0]!==3||signed.subarray(65,129).some(b=>b!==0))fail();
 const unsigned=Buffer.from(signed);unsigned.fill(0,1,65);
 if(hash(unsigned)!==parent.unsigned_wire_hash)fail();decodeServerPerpsEnvelope(unsigned.toString('base64'),parent.wallet);
 if(!ed25519.verify(signed.subarray(1,65),signed.subarray(193),key(parent.wallet,32),{zip215:false}))fail();
 return Object.freeze({signature:bs58.encode(signed.subarray(1,65)),wireHash:hash(signed),recordBinding:perpsClosePayoutRecordBinding(parent)});
}
export function verifyOwnerSignedPerpsCloseIntent(parent,encoded){
 const facts=inspectRecordedPerpsCloseOwnerWire(parent,encoded),result=Object.freeze({stage:'CLOSE_OWNER_SIGNATURE_FACT_ONLY',readyForBroadcast:false,
  closeId:parent.id,walletAddress:parent.wallet,positionAddress:parent.position,...facts,requiresFreshControlAndChainChecks:true,requiresCustodyAuthorization:true});
 intents.set(result,encoded);return result;
}
export function readVerifiedPerpsCloseOwnerIntent(value,parent){
 const encoded=intents.get(value);if(!encoded||value.closeId!==parent?.id||value.recordBinding!==perpsClosePayoutRecordBinding(parent))fail();
 const facts=inspectRecordedPerpsCloseOwnerWire(parent,encoded);if(facts.signature!==value.signature||facts.wireHash!==value.wireHash)fail();return encoded;
}
export function canonicalStoredPerpsClosePayout(text,parent){
 if(typeof text!=='string'||text.length>4096)fail();const p=JSON.parse(text),s=JSON.parse(parent.settlement);
 if(canonicalPerpsCloseSettlement(s,{walletAddress:parent.wallet,positionAddress:parent.position})!==parent.settlement||s.version!==2||s.mode!=='COLLATERAL_THEN_USDC')fail();
 const names=['recordBinding','signature','wireHash','slot','blockTime','executionDay','walletAddress','positionAddress','receiveAsset','receiveMint','receiveAccount','delivery','receivedTokenUnits','networkFeeLamports','requiresConversion'];
 if(!p||Object.keys(p).sort().join(',')!==[...names].sort().join(','))fail();
 const normalized=Object.fromEntries(names.map(k=>[k,p[k]]));key(p.signature,64);hex(p.wireHash);integer(p.slot);integer(p.blockTime);
 if(p.recordBinding!==perpsClosePayoutRecordBinding(parent)||p.walletAddress!==parent.wallet||p.positionAddress!==parent.position||p.slot<parent.observed_slot
  ||p.receiveAsset!==s.receiveAsset||p.receiveMint!==s.receiveMint||p.receiveAccount!==s.receiveAccount||p.delivery!==s.delivery
  ||!Number.isSafeInteger(p.blockTime*1000)||new Date(p.blockTime*1000).toISOString().slice(0,10)!==p.executionDay||p.blockTime*1000<parent.created-2000
  ||p.networkFeeLamports!==String(parent.fee_lamports)||p.requiresConversion!==(s.conversionRequired&&units(p.receivedTokenUnits)>0n))fail();
 units(p.receivedTokenUnits);if(JSON.stringify(normalized)!==text)fail();return text;
}
export function storeVerifiedPerpsClosePayout(payout,parent){
 requireVerifiedPerpsClosePayout(payout);
 const names=['recordBinding','signature','wireHash','slot','blockTime','executionDay','walletAddress','positionAddress','receiveAsset','receiveMint','receiveAccount','delivery','receivedTokenUnits','networkFeeLamports','requiresConversion'];
 return canonicalStoredPerpsClosePayout(JSON.stringify(Object.fromEntries(names.map(k=>[k,payout[k]]))),parent);
}
export function validateStoredPerpsCloseExecution(row,parent){
 if(!row||!parent||row.close_id!==parent.id||row.parent_binding!==perpsCloseExecutionParentBinding(parent)
  ||integer(row.created)<parent.created||integer(row.updated)<row.created||!['SIGNING','UNCERTAIN','FIRST_LEG_FINALIZED'].includes(row.state))fail();
 if(row.state==='SIGNING'){
  if([row.signature,row.wire_hash,row.owner_signed_wire,row.confirmed_slot,row.payout_json].some(x=>x!==null))fail();
 }else{
  const facts=inspectRecordedPerpsCloseOwnerWire(parent,row.owner_signed_wire);
  if(row.signature!==facts.signature||row.wire_hash!==facts.wireHash)fail();
  if(row.state==='UNCERTAIN'){if(row.confirmed_slot!==null||row.payout_json!==null)fail();}
  else{
   canonicalStoredPerpsClosePayout(row.payout_json,parent);const p=JSON.parse(row.payout_json);
   if(integer(row.confirmed_slot)!==p.slot||p.signature!==row.signature||p.wireHash!==row.wire_hash)fail();
  }
 }
 return row;
}
