// Same-origin server review protocol. A packet is not independent native-chain
// provenance or submission authority; the server must revalidate before send.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES} from './perps-server-custody.js';
import {validateWebPerpsReview} from './perps-navigation.js';
import {inspectWebPerpsEnvelope,webPerpsBytes} from './perps-web-envelope.js';
const keys=['stage','reviewId','review','preparation','recordBinding','serverRecordState','readyForSigning','tradingEnabled','requiresOwnerApproval','requiresServerRevalidation'];
const preparationKeys=['serializedTxBase64','positionPubkey','blockhash','lastValidBlockHeight'];
const sameKeys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(',');
const key=value=>{if(typeof value!=='string'||value.length>44)throw Error('INVALID_WEB_PERPS_REVIEW');const b=bs58.decode(value);if(b.length!==32||bs58.encode(b)!==value)throw Error('INVALID_WEB_PERPS_REVIEW');return b;};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(name=>[name,stable(value[name])]));return value;}
export function webPerpsReviewBindingText({reviewId,review,preparation}){return JSON.stringify(stable({reviewId,review,preparation}));}
export async function webPerpsSha256(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function validateWebPerpsSigningPacket(value,{draft,walletAddress,now=Date.now()}={}){
 if(!sameKeys(value,keys)||value.stage!=='WEB_PERPS_SIGNING_REVIEW'||typeof value.reviewId!=='string'||!/^[a-f0-9]{64}$/.test(value.reviewId)
  ||value.serverRecordState!=='AWAITING_WALLET'||value.readyForSigning!==false||value.tradingEnabled!==false||value.requiresOwnerApproval!==true||value.requiresServerRevalidation!==true
  ||typeof value.recordBinding!=='string'||!/^[a-f0-9]{64}$/.test(value.recordBinding)||!sameKeys(value.preparation,preparationKeys))throw Error('INVALID_WEB_PERPS_REVIEW');
 const review=validateWebPerpsReview(value.review,draft,walletAddress,now),material=value.preparation;
 key(material.blockhash);key(material.positionPubkey);key(walletAddress);
 if(typeof material.lastValidBlockHeight!=='string'||!/^[1-9][0-9]{0,19}$/.test(material.lastValidBlockHeight)||BigInt(material.lastValidBlockHeight)>18446744073709551615n)throw Error('INVALID_WEB_PERPS_REVIEW');
 const envelope=inspectWebPerpsEnvelope(material.serializedTxBase64,walletAddress);if(envelope.blockhash!==material.blockhash)throw Error('INVALID_WEB_PERPS_REVIEW');
 const [position]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position',key(walletAddress),key(PERPS_POOL),key(PERPS_CUSTODIES[draft.asset].address),
  key(PERPS_CUSTODIES[draft.side==='LONG'?draft.asset:'USDC'].address),new Uint8Array([draft.side==='LONG'?1:2])]});
 if(position!==material.positionPubkey||await webPerpsSha256(webPerpsReviewBindingText(value))!==value.recordBinding)throw Error('INVALID_WEB_PERPS_REVIEW');
 return Object.freeze({...value,review,preparation:Object.freeze({...material}),transactionVersion:envelope.version===-1?'legacy':0,byteLength:webPerpsBytes(material.serializedTxBase64).length});
}
