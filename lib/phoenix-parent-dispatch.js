// Explicitly injected provider transport only. No default sender or retry.
// The owner wallet signature identifies the transaction before co-signing.
import {requirePhoenixExecutionJournal} from './phoenix-execution-journal.js';
import {inspectPhoenixParentDispatch,revalidatePhoenixParentDispatch} from './phoenix-parent-signing.js';
import {simulatePhoenixParentOnboarding} from './phoenix-parent-onboarding.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const fail=()=>{throw Error('PHOENIX_PARENT_DISPATCH_REJECTED');};
export function inspectPhoenixParentOperation(row){const receipt=row.receipt&&JSON.parse(row.receipt);
 return Object.freeze({stage:'PHOENIX_PARENT_OPERATION',venue:'phoenix',id:row.id,walletAddress:row.wallet,parentAddress:row.parent,state:row.state,
  signature:row.signature,registered:row.state==='FINALIZED'&&receipt?.state==='REGISTERED',requiresPolling:row.state==='UNKNOWN',
  requiresOperatorReview:row.state==='SIGNED',requiresNewReview:receipt?.state==='FAILED'||row.state==='CANCELLED',mayRetry:false});
}
export async function dispatchPhoenixParent(grant,{journal,request,sendRegisterIxs}={}){
 requirePhoenixExecutionJournal(journal);if(typeof request!=='function'||typeof sendRegisterIxs!=='function')fail();
 const scope=inspectPhoenixParentDispatch(grant,{journal,request});
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const height=await request('getBlockHeight',[{commitment:'confirmed'}]);
 if(!Number.isSafeInteger(height)||height<0||height>scope.preparation.lastValidBlockHeight)fail();
 // Repeat exact-message read-only simulation after custody signing, while
 // the provider slot is still empty. No substitute builder transaction.
 await simulatePhoenixParentOnboarding(scope.preparation);revalidatePhoenixParentDispatch(grant);
 const signed=journal.readParentAttempt(scope.id,scope.ownerAccountHash);
 if(signed?.state!=='SIGNED'||signed.wallet!==scope.walletAddress)fail();
 journal.markParentBroadcast(scope.id,scope.ownerAccountHash);
 // UNKNOWN must commit before the sole provider call. Even an HTTP rejection
 // may follow a broadcast; only native receipt reconciliation can resolve it.
 let acknowledged=false;
 try{
  const response=await sendRegisterIxs(Object.freeze({transaction:signed.signed,traderAuthority:signed.wallet,txFeePayer:signed.wallet,
   maxPositions:32,traderPdaIndex:0,traderSubaccountIndex:0}));
  acknowledged=response?.signature===signed.signature&&response.traderPda===signed.parent&&response.txFeePayer===signed.wallet&&
   response.traderOnboarder===scope.preparation.onboarder&&response.maxPositions===32&&response.includeRegisterTrader===true;
 }catch{}
 return Object.freeze({...inspectPhoenixParentOperation(journal.readParentAttempt(scope.id,scope.ownerAccountHash)),providerAcknowledged:acknowledged});
}
export async function recoverPhoenixParent({journal,id,ownerAccountHash,walletAddress,request,now=Date.now}={}){
 requirePhoenixExecutionJournal(journal);let row=journal.readParentAttempt(id,ownerAccountHash);
 if(!row||row.wallet!==walletAddress||typeof request!=='function')fail();
 // No PREPARED/SIGNED/UNKNOWN branch signs or sends on a recovery request.
 if(row.state==='UNKNOWN'){
  const receipt=await journal.parentReceipt(id,ownerAccountHash,{request,now});
  if(receipt.state!=='UNKNOWN'){journal.recordFinalizedParent(id,ownerAccountHash,receipt);row=journal.readParentAttempt(id,ownerAccountHash);}
 }
 return inspectPhoenixParentOperation(row);
}
