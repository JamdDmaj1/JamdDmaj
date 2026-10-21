// Production coordinator building block: both durable ledgers precede send.
// No live transport or policy fallback is installed by importing this module.
import {createWebPerpsBroadcaster} from './perps-web-broadcast.js';
import {authorizeWebPerpsRisk,readWebPerpsRiskAuthorization} from './perps-web-risk-authorization.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
function fail(){throw Error('WEB_PERPS_RISK_BROADCAST_NOT_AUTHORIZED');}
export function createRiskBoundWebPerpsBroadcaster({journal,riskJournal,readAccount,readLimits,fetchImpl}={}){
 requirePerpsExecutionJournal(riskJournal);requireWebPerpsSubmissionJournal(journal);
 if(typeof readAccount!=='function'||typeof readLimits!=='function'||typeof fetchImpl!=='function')fail();
 return async evidence=>{
  const grant=await authorizeWebPerpsRisk(evidence,{journal:riskJournal,readAccount,readLimits});
  const row=riskJournal.reserveWebSubmission(grant);
  const expected=JSON.stringify(row),id=row.reservation;
  // A failure after the shared risk commit leaves it held, even if the web
  // journal or final transport fails. Never cancel an owner-signed attempt.
  const submit=createWebPerpsBroadcaster({journal,fetchImpl:(url,options)=>{
   readWebPerpsRiskAuthorization(grant,{journal:riskJournal});
   if(JSON.stringify(riskJournal.read(id))!==expected||row.state!=='UNCERTAIN')fail();
   return fetchImpl(url,options);
  }});
  return submit(evidence);
 };
}
