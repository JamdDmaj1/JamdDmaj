// Fixed operator setup service. All signing stays in the owner's wallet.
import bs58 from 'bs58';
import {preparePerpsFeeRecipientSetup} from './perps-fee-recipient-setup.js';
import {recipientSetupProtocol} from './fee-recipient-setup-protocol.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function fail(){throw Error('RECIPIENT_SETUP_UNAVAILABLE');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function tokenAccount(value,FEE){
 if(!value||value.owner!==TOKEN||value.executable!==false||value.data?.[1]!=='base64')fail();
 const b=Buffer.from(value.data[0],'base64');if(b.length!==165||b.toString('base64')!==value.data[0]
  ||bs58.encode(b.subarray(0,32))!==FEE.mint||bs58.encode(b.subarray(32,64))!==FEE.recipient||b[108]!==1)fail();
 return b;
}
export function createFeeRecipientSetupService({request,now=Date.now,protocol=recipientSetupProtocol,prepare=preparePerpsFeeRecipientSetup}={}){
 if(typeof request!=='function'||typeof now!=='function')fail();
 const FEE=protocol.policy,{validateSignedRecipientSetup,inspectSignedRecipientSetup,compileRecipientSetupMessage}=protocol;
 return Object.freeze({
  prepare:()=>prepare({request,now}),
  async submit({packet,signedBase64,explicitApproval}={}){
   if(explicitApproval!==true)fail();const signed=await validateSignedRecipientSetup(packet,signedBase64,{now:now()});
   const current=await prepare({request,now});
   if(current.stage==='FEE_RECIPIENT_USDC_ALREADY_EXISTS')return {stage:'RECIPIENT_ACCOUNT_ALREADY_READY',signature:signed.signature,accountReady:true,submitted:false};
   if(current.rentReserveLamports!==packet.rentReserveLamports||current.networkFeeLamports!==packet.networkFeeLamports||now()>=packet.reviewExpiresAt)fail();
   const live=await request('isBlockhashValid',[signed.blockhash,{commitment:'confirmed',minContextSlot:current.observedSlot}]);
   if(live?.value!==true||integer(live.context?.slot)<current.observedSlot)fail();
   const simulation=await request('simulateTransaction',[signedBase64,{encoding:'base64',sigVerify:true,replaceRecentBlockhash:false,commitment:'confirmed',
    minContextSlot:current.observedSlot,accounts:{encoding:'base64',addresses:[FEE.recipient,current.destination]}}]);
   if(integer(simulation?.context?.slot)<current.observedSlot||simulation.value?.err!==null||simulation.value.accounts?.length!==2)fail();
   const [payer,ata]=simulation.value.accounts;
   if(payer?.owner!=='11111111111111111111111111111111'||payer.executable!==false||payer.data?.[0]!==''||payer.data?.[1]!=='base64'
    ||BigInt(integer(payer.lamports))!==BigInt(current.operatorBalanceLamports)-BigInt(current.estimatedTotalLamports)
    ||String(integer(ata?.lamports))!==current.rentReserveLamports||tokenAccount(ata,FEE).readBigUInt64LE(64)!==0n)fail();
   if(await request('getGenesisHash',[])!==GENESIS||now()>=packet.reviewExpiresAt)fail();
   // Only this exact, freshly checked owner signature may reach RPC. There is
   // no retry, new blockhash, replacement signature or general relay endpoint.
   let acknowledged=false;
   try{acknowledged=await request('sendTransaction',[signedBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}])===signed.signature;}catch{}
   return {stage:acknowledged?'RECIPIENT_SETUP_SUBMITTED':'RECIPIENT_SETUP_UNCONFIRMED',signature:signed.signature,accountReady:false,requiresReconciliation:true};
  },
  async recover(signature){
   let decoded;try{decoded=bs58.decode(signature);}catch{fail();}if(decoded.length!==64||bs58.encode(decoded)!==signature)fail();
   if(await request('getGenesisHash',[])!==GENESIS)fail();
   const {destination}=await compileRecipientSetupMessage(bs58.encode(new Uint8Array(32).fill(1)));
   const account=await request('getAccountInfo',[destination,{encoding:'base64',commitment:'finalized'}]);
   const ready=account?.value!==null;if(ready)tokenAccount(account.value,FEE);
   const statuses=await request('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
   if(!Array.isArray(statuses?.value)||statuses.value.length!==1)fail();const status=statuses.value[0];
   if(status===null||status.confirmationStatus!=='finalized')return {stage:'RECIPIENT_SETUP_UNCONFIRMED',signature,accountReady:ready,requiresReconciliation:true};
   const tx=await request('getTransaction',[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
   if(tx===null)return {stage:'RECIPIENT_SETUP_UNCONFIRMED',signature,accountReady:ready,requiresReconciliation:true};
   if(tx.slot!==status.slot||integer(statuses.context?.slot)<integer(status.slot)||tx.transaction?.[1]!=='base64'||JSON.stringify(tx.meta?.err)!==JSON.stringify(status.err))fail();
   const checked=await inspectSignedRecipientSetup(tx.transaction[0]);if(checked.signature!==signature)fail();
   if(await request('getGenesisHash',[])!==GENESIS)fail();
   return {stage:status.err===null&&ready?'RECIPIENT_SETUP_CONFIRMED':status.err!==null?'RECIPIENT_SETUP_FAILED':'RECIPIENT_SETUP_UNCONFIRMED',signature,accountReady:ready,requiresReconciliation:status.err===null&&!ready};
  }
 });
}
