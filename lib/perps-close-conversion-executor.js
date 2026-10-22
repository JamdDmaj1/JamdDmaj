// The operational second-leg coordinator. Only a private, current preparation
// of recorded finalized proceeds can enter this path. It never activates a bot,
// constructs an entry or retries an uncertain send. Risk release is available
// only through the separate finalized financial-completion gate below.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readJournaledPerpsCloseConversion} from './perps-journal-close-conversion.js';
import {authorizePerpsCloseConversion} from './perps-close-conversion-signing.js';
import {createPerpsCloseConversionBroadcaster} from './perps-close-conversion-broadcast.js';
import {readFinalizedPerpsCloseCompletion} from './perps-close-completion.js';
function fail(){throw Error('PERPS_CLOSE_CONVERSION_EXECUTOR_UNAVAILABLE');}
export function createPerpsCloseConversionExecutor({journal,vault,fetchImpl}={}){
 requirePerpsExecutionJournal(journal);
 if(typeof vault?.signCloseConversion!=='function'||typeof fetchImpl!=='function')fail();
 const broadcast=createPerpsCloseConversionBroadcaster({journal,fetchImpl});
 return Object.freeze({
  async execute(prepared,options={}){
   const approved={...options,journal};
   const original=readJournaledPerpsCloseConversion(prepared,journal);
   if(original.id!==approved.closeId||original.close.wallet!==approved.walletAddress)fail();
   const row=journal.readPositionCloseConversion(original.id);
   // Durable SIGNING/UNCERTAIN phases are never restarted, even after a process
   // dies before its transport response or the caller presses the action again.
   if(row?.state!=='PREPARED')fail();
   const grant=await authorizePerpsCloseConversion(prepared,approved);
   const signed=vault.signCloseConversion(grant);
   return broadcast(signed,{ownerAccountHash:approved.ownerAccountHash,controlRevision:approved.controlRevision});
  },
  recover(closeId,options={}){
   const row=journal.readPositionCloseConversion(closeId);
   if(!row||!['UNCERTAIN','FINALIZED'].includes(row.state))fail();
   // Recovery has no reference to the signer or sender. It queries only the
   // recorded signature; full daily/exit accounting remains a separate gate.
   return journal.recoverPositionCloseConversion(closeId,options);
  },
  async complete(closeId,options={}){
   // Finality alone is insufficient. Re-prove both financial legs, full daily
   // fee/loss accounting and absent sibling exits before atomic risk release.
   // This path neither needs nor calls the vault or the broadcast transport.
   const proof=await readFinalizedPerpsCloseCompletion(journal,closeId,options);
   return journal.reconcilePositionCloseCompletion(closeId,proof);
  }
 });
}
