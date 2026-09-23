// Development-only native SOL transfer rehearsal. Never included in build-web.
import {address,appendTransactionMessageInstructions,compileTransaction,createNoopSigner,createTransactionMessage,getBase64Decoder,getTransactionEncoder,pipe,setTransactionMessageFeePayer,setTransactionMessageLifetimeUsingBlockhash} from '@solana/kit';
import {getTransferSolInstruction} from '@solana-program/system';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export async function devnetRpc(method,params=[]){
  const response=await fetch('https://api.devnet.solana.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!response.ok)throw new Error('devnet-http-'+response.status);const data=await response.json();
  if(data.error){const error=new Error('devnet-rpc-failed');error.rpcCode=Number.isInteger(data.error.code)?data.error.code:null;throw error;}
  if(data.id!==1||!Object.hasOwn(data,'result'))throw new Error('devnet-rpc-invalid');return data.result;
}
export function testLamports(value){
  if(typeof value!=='string'||! /^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value)||value.length>20)throw new Error('invalid-test-amount');
  const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
  if(amount<=0n||amount>100000000n)throw new Error('test-limit-0.1-SOL');return amount;
}
function integer(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('invalid-rpc-number');return BigInt(value)}
const base64=bytes=>getBase64Decoder().decode(bytes);
const wire=transaction=>base64(getTransactionEncoder().encode(transaction));
export function createDevnetTransferSession({owner,sign,isUnlocked,rpc=devnetRpc,now=Date.now,journal=null}){
  address(owner);let phase='idle',draft=null,signature=null,record=null;
  if(journal){
    if(typeof journal.load!=='function'||typeof journal.save!=='function')throw new Error('invalid-journal');
    const saved=journal.load();
    if(saved!==null&&saved!==undefined){
      if(typeof saved!=='object'||saved.version!==1||saved.owner!==owner||saved.network!=='solana:devnet'||!['uncertain','submitted','confirmed','failed'].includes(saved.phase)
        ||typeof saved.signature!=='string'||saved.signature.length>88||bs58.decode(saved.signature).length!==64||!Number.isSafeInteger(saved.lastValidBlockHeight)||saved.lastValidBlockHeight<0)throw new Error('invalid-journal');
      record=Object.freeze({...saved});signature=saved.signature;phase=saved.phase;
    }
  }
  function persist(next){
    if(!record)throw new Error('missing-journal-record');
    const updated=Object.freeze({...record,phase:next});
    // A synchronous durable adapter must finish before we ever call sendTransaction.
    const result=journal?.save(updated);if(result&&typeof result.then==='function')throw new Error('async-journal-not-supported');
    record=updated;
  }
  const unlocked=()=>{if(!isUnlocked())throw new Error('wallet-locked')};
  const chain=async()=>{if(await rpc('getGenesisHash')!==DEVNET_GENESIS)throw new Error('wrong-network')};
  async function funds(amount,fee){const balance=await rpc('getBalance',[owner,{commitment:'confirmed'}]);if(integer(balance?.value)<amount+fee)throw new Error('insufficient-test-SOL')}
  return Object.freeze({
    get state(){return Object.freeze({phase,signature,network:'solana:devnet',testOnly:true})},
    async prepare({recipient,amountSOL}){
      unlocked();if(!['idle','confirmed','failed'].includes(phase))throw new Error('request-pending');
      address(recipient);if(recipient===owner||bs58.decode(recipient).length!==32)throw new Error('invalid-recipient');
      const amount=testLamports(amountSOL);phase='preparing';signature=null;
      try{
        await chain();const latest=await rpc('getLatestBlockhash',[{commitment:'confirmed'}]);
        const height=integer(latest?.value?.lastValidBlockHeight);
        const transaction=compileTransaction(pipe(createTransactionMessage({version:0}),m=>setTransactionMessageFeePayer(address(owner),m),m=>setTransactionMessageLifetimeUsingBlockhash({blockhash:latest.value.blockhash,lastValidBlockHeight:height},m),m=>appendTransactionMessageInstructions([getTransferSolInstruction({source:createNoopSigner(address(owner)),destination:address(recipient),amount})],m)));
        const fee=integer((await rpc('getFeeForMessage',[base64(transaction.messageBytes),{commitment:'confirmed'}]))?.value);
        if(fee>1000000n)throw new Error('unexpected-test-fee');await funds(amount,fee);
        const simulation=await rpc('simulateTransaction',[wire(transaction),{encoding:'base64',sigVerify:false,commitment:'confirmed'}]);
        if(simulation?.value?.err!==null)throw new Error('simulation-failed');unlocked();
        const review=Object.freeze({id:crypto.randomUUID(),recipient,amountSOL,feeLamports:String(fee),network:'solana:devnet',testOnly:true,expiresAt:now()+60000});
        draft={review,transaction,amount,fee,height};phase='review';return review;
      }catch(error){phase='idle';draft=null;throw error}
    },
    cancelReview(){if(phase==='review'){draft=null;phase='idle'}},
    async confirm({reviewId,confirmed}){
      if(confirmed!==true||phase!=='review'||draft?.review.id!==reviewId)throw new Error('confirmation-required');
      const current=draft;draft=null;phase='checking';let dispatched=false;
      try{
        unlocked();if(now()>current.review.expiresAt)throw new Error('review-expired');
        await chain();if(integer(await rpc('getBlockHeight',[{commitment:'confirmed'}]))>current.height)throw new Error('blockhash-expired');
        const fee=integer((await rpc('getFeeForMessage',[base64(current.transaction.messageBytes),{commitment:'confirmed'}]))?.value);
        if(fee!==current.fee)throw new Error('fee-changed');await funds(current.amount,fee);unlocked();
        const signedBytes=sign(current.transaction.messageBytes.slice());
        if(!(signedBytes instanceof Uint8Array)||!nacl.sign.detached.verify(current.transaction.messageBytes,signedBytes,bs58.decode(owner)))throw new Error('invalid-signature');
        signature=bs58.encode(signedBytes);
        const signed={...current.transaction,signatures:{[owner]:signedBytes}};
        const encoded=wire(signed);
        const simulation=await rpc('simulateTransaction',[encoded,{encoding:'base64',sigVerify:true,commitment:'confirmed'}]);
        if(simulation?.value?.err!==null)throw new Error('simulation-failed');unlocked();
        if(now()>current.review.expiresAt)throw new Error('review-expired');
        record={version:1,owner,network:'solana:devnet',signature,lastValidBlockHeight:Number(current.height),phase:'uncertain'};
        persist('uncertain');
        phase='submitting';dispatched=true;
        const returned=await rpc('sendTransaction',[encoded,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]);
        if(returned!==signature)throw new Error('signature-response-mismatch');persist('submitted');phase='submitted';
        return this.state; // Acceptance is NOT confirmation. Poll checkStatus.
      }catch(error){phase=dispatched?'uncertain':'idle';if(!dispatched)signature=null;throw error}
    },
    async checkStatus(){
      if(!signature||!['submitted','uncertain','confirmed','failed'].includes(phase))throw new Error('no-submitted-transaction');
      await chain();const result=await rpc('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);const item=result?.value?.[0];
      if(item?.err){persist('failed');phase='failed';}else if(item&&['confirmed','finalized'].includes(item.confirmationStatus)){persist('confirmed');phase='confirmed';}
      return this.state;
    }
  });
}
