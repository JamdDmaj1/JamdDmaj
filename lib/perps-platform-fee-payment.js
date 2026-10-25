// A fixed, separate legacy TransferChecked transaction. Read-only preparation;
// no networking defaults, private keys, collection or generic signing API.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {planPerpsPlatformFeeTransfer} from './perps-platform-fee-transfer.js';
import {readPerpsPlatformFeeAssessment} from './perps-platform-fee-journal.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111';
const MEMO='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const reviews=new WeakMap(),signedProofs=new WeakMap(),receipts=new WeakSet();
const hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('PLATFORM_FEE_PAYMENT_REJECTED');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function transactionError(value){
 if(value===null)return;
 if(typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(value))return;
 if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1
  &&/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(Object.keys(value)[0])&&JSON.stringify(value).length<=4096)return;
 fail();
}
function bytes(text,length){if(typeof text!=='string')fail();const b=Buffer.from(text,'base64');if(b.toString('base64')!==text||b.length!==length)fail();return b;}
function key(s){try{const b=bs58.decode(s);if(b.length!==32||bs58.encode(b)!==s)fail();return Buffer.from(b);}catch{fail();}}
function accountData(a,length,owner){
 if(!a||a.owner!==owner||a.executable!==false||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64')fail();
 integer(a.lamports);return bytes(a.data[0],length);
}
function token(a,owner,mint){
 const b=accountData(a,165,TOKEN);
 if(!b.subarray(0,32).equals(key(mint))||!b.subarray(32,64).equals(key(owner))||b.readUInt32LE(72)!==0
   ||b[108]!==1||b.readUInt32LE(109)!==0||b.readBigUInt64LE(121)!==0n||b.readUInt32LE(129)!==0)fail();
 return b.readBigUInt64LE(64);
}
function context(reply,minimum=0){const slot=integer(reply?.context?.slot);if(slot<minimum)fail();return slot;}
function compile(plan,blockhash){
 const a=plan.instruction.accounts,keys=[plan.walletAddress,a[0].address,a[2].address,plan.mint,TOKEN,MEMO];
 const memo=Buffer.from('jamddmaj-fee:'+plan.assessmentId,'utf8');
 if(new Set(keys).size!==6||memo.length>127)fail();
 return Buffer.concat([Buffer.from([1,0,3,6]),...keys.map(key),key(blockhash),
   Buffer.from([2,4,4,1,3,2,0,10]),bytes(plan.instruction.dataBase64,10),Buffer.from([5,1,0,memo.length]),memo]);
}
async function snapshot(p,request,minimum){
 const addresses=[p.plan.walletAddress,p.plan.mint,p.source,p.destination];
 const response=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'confirmed',minContextSlot:minimum}]);
 const slot=context(response,minimum),v=response.value;if(!Array.isArray(v)||v.length!==4)fail();
 if(v[3]===null)throw Object.assign(Error('PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING'),{code:'PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING'});
 accountData(v[0],0,SYSTEM);const mint=accountData(v[1],82,TOKEN);if(mint[44]!==6||mint[45]!==1)fail();
 return {slot,payer:v[0],source:v[2],destination:v[3],sol:BigInt(v[0].lamports),
   input:token(v[2],p.plan.walletAddress,p.plan.mint),output:token(v[3],p.plan.recipient,p.plan.mint)};
}
async function feeFor(p,request,minimum){
 const r=await request('getFeeForMessage',[p.message.toString('base64'),{commitment:'confirmed',minContextSlot:minimum}]);context(r,minimum);
 const fee=integer(r.value);if(fee<1||fee>10000)fail();return BigInt(fee);
}
async function simulate(p,request,before,signature=null){
 if(before.input<BigInt(p.plan.feeUnits)||before.sol<p.fee)fail();
 const wire=Buffer.concat([Buffer.from([1]),signature??Buffer.alloc(64),p.message]);
 const response=await request('simulateTransaction',[wire.toString('base64'),{encoding:'base64',sigVerify:signature!==null,replaceRecentBlockhash:false,
   commitment:'confirmed',minContextSlot:before.slot,accounts:{encoding:'base64',addresses:[p.plan.walletAddress,p.source,p.destination]}}]);
 context(response,before.slot);const v=response.value;
 if(!v||v.err!==null||!Array.isArray(v.accounts)||v.accounts.length!==3)fail();
 accountData(v.accounts[0],0,SYSTEM);
 if(BigInt(v.accounts[0].lamports)!==before.sol-p.fee
  ||token(v.accounts[1],p.plan.walletAddress,p.plan.mint)!==before.input-BigInt(p.plan.feeUnits)
  ||token(v.accounts[2],p.plan.recipient,p.plan.mint)!==before.output+BigInt(p.plan.feeUnits)
  ||v.accounts[1].lamports!==before.source.lamports||v.accounts[2].lamports!==before.destination.lamports)fail();
}
export function readPerpsPlatformFeePaymentReview(review){
 const p=reviews.get(review);if(!p)fail();p.fresh();readPerpsPlatformFeeAssessment(p.assessment);return p;
}
export async function preparePerpsPlatformFeePayment(assessment,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const start=monotonicNow(),at=integer(now());
 const fresh=()=>{const elapsed=monotonicNow()-start;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>60000||now()<at||now()-at>60000)fail();};
 const plan=await planPerpsPlatformFeeTransfer(assessment);fresh();
 if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const latest=await request('getLatestBlockhash',[{commitment:'confirmed'}]);const slot=context(latest);fresh();
 const p={assessment,plan,message:compile(plan,latest.value?.blockhash),source:plan.instruction.accounts[0].address,
   destination:plan.instruction.accounts[2].address,lastValidBlockHeight:integer(latest.value.lastValidBlockHeight),fresh};
 const before=await snapshot(p,request,slot);fresh();p.fee=await feeFor(p,request,before.slot);fresh();
 await simulate(p,request,before);fresh();if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const review=Object.freeze({stage:'SEPARATE_PLATFORM_FEE_PAYMENT_REVIEW',assessmentId:assessment.id,reservationId:assessment.reservation,
  walletAddress:plan.walletAddress,recipient:plan.recipient,mint:plan.mint,feeUnits:plan.feeUnits,
  marginUnits:assessment.margin,termsVersion:JSON.parse(assessment.terms).version,networkFeePayer:'TRADER',networkFeeToken:'SOL',
  networkFeeLamports:p.fee.toString(),rentLamports:'0',source:p.source,destination:p.destination,
  messageBase64:p.message.toString('base64'),messageHash:hash(p.message),lastValidBlockHeight:p.lastValidBlockHeight,
  observedSlot:before.slot,expiresAt:at+60000,readyForSigning:false,networkSponsorshipAvailable:false});
 reviews.set(review,p);return review;
}
export function verifySignedPerpsPlatformFeePayment(review,encoded){
 const p=reviews.get(review);if(!p)fail();const wire=bytes(encoded,65+p.message.length);
 if(wire[0]!==1||!wire.subarray(65).equals(p.message))fail();
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key(review.walletAddress)]),format:'der',type:'spki'});
 if(!verify(null,p.message,publicKey,wire.subarray(1,65)))fail();
 const proof=Object.freeze({stage:'SIGNED_SEPARATE_PLATFORM_FEE_PAYMENT',assessmentId:review.assessmentId,walletAddress:review.walletAddress,
  signature:bs58.encode(wire.subarray(1,65)),wireHash:hash(wire),signedBase64:encoded,readyForBroadcast:false});
 signedProofs.set(proof,{review,wire});return proof;
}
export function readSignedPerpsPlatformFeePayment(proof){const p=signedProofs.get(proof);if(!p)fail();return {...p,proof};}
export async function revalidatePerpsPlatformFeePayment(review,signed,{request}={}){
 const p=readPerpsPlatformFeePaymentReview(review),s=readSignedPerpsPlatformFeePayment(signed);if(s.review!==review||typeof request!=='function')fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();p.fresh();
 const height=integer(await request('getBlockHeight',[{commitment:'confirmed'}]));if(height>p.lastValidBlockHeight)fail();p.fresh();
 const before=await snapshot(p,request,review.observedSlot);p.fresh();
 if(await feeFor(p,request,before.slot)!==p.fee)fail();p.fresh();
 await simulate(p,request,before,s.wire.subarray(1,65));p.fresh();if(await request('getGenesisHash',[])!==GENESIS)fail();p.fresh();
 return true;
}
export function requirePerpsPlatformFeePaymentReceipt(proof){if(!receipts.has(proof))fail();return proof;}
export async function readPerpsPlatformFeePaymentReceipt(record,{request,now=Date.now}={}){
 if(typeof request!=='function'||typeof now!=='function')fail();
 const wire=Buffer.from(record.signed_base64,'base64'),review=JSON.parse(record.review_json);
 if(wire.toString('base64')!==record.signed_base64||hash(wire)!==record.wire_hash||wire[0]!==1||bs58.encode(wire.subarray(1,65))!==record.signature
  ||!wire.subarray(65).equals(Buffer.from(review.messageBase64,'base64')))fail();
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key(review.walletAddress)]),format:'der',type:'spki'});
 if(!verify(null,wire.subarray(65),publicKey,wire.subarray(1,65)))fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const status=await request('getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}]);
 if(!Array.isArray(status?.value)||status.value.length!==1)fail();const state=status.value[0];
 if(state===null||state?.confirmationStatus!=='finalized')return null;
 const slot=integer(state.slot);if(context(status)<slot||!Object.hasOwn(state,'err'))fail();
 transactionError(state.err);
 const tx=await request('getTransaction',[record.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(tx===null)return null;
 if(tx?.slot!==slot||!Array.isArray(tx.transaction)||tx.transaction.length!==2||tx.transaction[0]!==record.signed_base64||tx.transaction[1]!=='base64'
  ||!tx.meta||!Object.hasOwn(tx.meta,'err')||JSON.stringify(tx.meta.err)!==JSON.stringify(state.err))fail();
 const at=integer(now()),blockTime=integer(tx.blockTime);if(!Number.isSafeInteger(blockTime*1000)||blockTime*1000>at+2000)fail();
 const meta=tx.meta,fee=integer(meta.fee);if(String(fee)!==review.networkFeeLamports)fail();
 if(!Array.isArray(meta.preBalances)||!Array.isArray(meta.postBalances)||meta.preBalances.length!==6||meta.postBalances.length!==6)fail();
 for(let i=0;i<6;i++){integer(meta.preBalances[i]);integer(meta.postBalances[i]);if(BigInt(meta.postBalances[i])!==BigInt(meta.preBalances[i])-BigInt(i===0?fee:0))fail();}
 const balances=rows=>{
  if(!Array.isArray(rows)||rows.length!==2)fail();const out=new Map();
  for(const r of rows){if(![1,2].includes(r.accountIndex)||out.has(r.accountIndex)||r.mint!==review.mint||r.owner!==(r.accountIndex===1?review.walletAddress:review.recipient)
    ||r.uiTokenAmount?.decimals!==6||typeof r.uiTokenAmount.amount!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(r.uiTokenAmount.amount))fail();out.set(r.accountIndex,BigInt(r.uiTokenAmount.amount));}
  return out;
 };
 const before=balances(meta.preTokenBalances),after=balances(meta.postTokenBalances),amount=state.err===null?BigInt(review.feeUnits):0n;
 if(after.get(1)!==before.get(1)-amount||after.get(2)!==before.get(2)+amount)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const proof=Object.freeze({assessmentId:record.assessment_id,signature:record.signature,wireHash:record.wire_hash,
  state:state.err===null?'PAID':'FAILED',slot,observedAt:at,networkFeeLamports:String(fee)});receipts.add(proof);return proof;
}
