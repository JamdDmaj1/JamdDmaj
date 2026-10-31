import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {buildEligibilityTree} from './fair-launch-eligibility.js';
const FIELDS=['schema','cluster','providerId','policyAddress','rulesetHash','generatedAt','count','root','records','signature'];
function fail(code){throw Error(code);}
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function units(value,code){if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value))fail(code);const n=BigInt(value);if(n>18446744073709551615n)fail(code);return n;}
export function eligibilityExportSigningBytes(packet){
 return new TextEncoder().encode(JSON.stringify({schema:packet.schema,cluster:packet.cluster,providerId:packet.providerId,policyAddress:packet.policyAddress,rulesetHash:packet.rulesetHash,generatedAt:packet.generatedAt,count:packet.count,root:packet.root}));
}
// Offline cryptographic preparation only. Trust configuration must come from
// the selected provider review, never from a public key inside the import.
// A valid signature is not proof of unique humans, legal approval or launch authority.
export async function verifyEligibilityProviderExport(packet,{provider,policyAddress,totalSupplyBaseUnits,now=Date.now()}={}){
 if(!provider?.id||!provider.publicKey||!provider.rulesetHash)fail('ELIGIBILITY_PROVIDER_REQUIRED');
 if(!exact(packet,FIELDS)||JSON.stringify(packet).length>1500000)fail('ELIGIBILITY_EXPORT_FORMAT');
 if(packet.schema!=='jamddmaj-eligibility-export/v1'||packet.cluster!=='solana:devnet'||packet.providerId!==provider.id||packet.policyAddress!==policyAddress||packet.rulesetHash!==provider.rulesetHash)fail('ELIGIBILITY_EXPORT_BINDING');
 if(!/^[a-f0-9]{64}$/.test(packet.root||'')||!Number.isSafeInteger(packet.count)||packet.count<1||packet.count>2000||!Array.isArray(packet.records)||packet.records.length!==packet.count)fail('ELIGIBILITY_EXPORT_FORMAT');
 const at=Date.parse(packet.generatedAt);if(!Number.isFinite(at)||new Date(at).toISOString()!==packet.generatedAt||!Number.isSafeInteger(now)||at>now+120000||at<now-86400000)fail('ELIGIBILITY_EXPORT_EXPIRED');
 let signature,key;try{signature=bs58.decode(packet.signature);key=bs58.decode(provider.publicKey);}catch{fail('ELIGIBILITY_EXPORT_SIGNATURE');}
 if(signature.length!==64||key.length!==32||!ed25519.verify(signature,eligibilityExportSigningBytes(packet),key,{zip215:false}))fail('ELIGIBILITY_EXPORT_SIGNATURE');
 const supply=units(totalSupplyBaseUnits,'ELIGIBILITY_SUPPLY');
 const wallets=new Map();let total=0n;
 for(const row of packet.records){
  if(!exact(row,['identityCommitment','beneficiary','totalAllocation']))fail('ELIGIBILITY_PERSONAL_DATA_OR_FIELDS');
  const amount=units(row.totalAllocation,'ELIGIBILITY_ALLOCATION');
  total+=amount;const aggregate=(wallets.get(row.beneficiary)||0n)+amount;wallets.set(row.beneficiary,aggregate);
  if(aggregate*100n>supply||total>supply)fail('ELIGIBILITY_WALLET_CAP');
 }
 const tree=await buildEligibilityTree(policyAddress,packet.records);
 if(tree.root!==packet.root)fail('ELIGIBILITY_EXPORT_ROOT');
 return Object.freeze({providerSignatureValid:true,merkleRootValid:true,count:tree.count,root:tree.root,reviewRequired:true,eligibilityApproved:false,mainnetAuthorized:false});
}
