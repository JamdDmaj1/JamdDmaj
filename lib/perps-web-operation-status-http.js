// Persistent server handler factory, not a Vercel /tmp database or a live route.
// Random 256-bit review ID + original binding scope a read-only operation query.
// No balances, policy, raw financial row, signing, RPC or submission are exposed.
import {requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import bs58 from 'bs58';
function response(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function createWebPerpsOperationStatusHandler({journal,riskJournal,limit}={}){
 requireWebPerpsSubmissionJournal(journal);requirePerpsExecutionJournal(riskJournal);
 if(typeof limit!=='function')throw Error('WEB_PERPS_STATUS_NOT_CONFIGURED');
 return async request=>{
  if(request.method!=='POST')return response({error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return response({error:'INVALID_STATUS_QUERY'},400);
  let reader,input;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1024))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();const parts=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024)throw Error();parts.push(Buffer.from(part.value));}
   input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size)));
   if(!input||Object.keys(input).sort().join(',')!=='recordBinding,reviewId,signature,walletAddress'||!/^[a-f0-9]{64}$/.test(input.reviewId)
    ||!/^[a-f0-9]{64}$/.test(input.recordBinding)||typeof input.walletAddress!=='string'||input.walletAddress.length>44||typeof input.signature!=='string'||input.signature.length>88
    ||bs58.decode(input.walletAddress).length!==32||bs58.decode(input.signature).length!==64)throw Error();
  }catch{return response({error:'INVALID_STATUS_QUERY'},400);}finally{if(reader)try{await reader.cancel();}catch{}}
  try{
   await limit(request);
   const row=journal.read(input.reviewId);
   if(!row||row.wallet!==input.walletAddress||row.signature!==input.signature||JSON.parse(row.packet_json).recordBinding!==input.recordBinding)return response({ok:true,status:null});
   const settled=journal.readFinancialSettlement(input.reviewId);if(!settled)return response({ok:true,status:null});
   const parent=riskJournal.read('web:'+input.reviewId),original=JSON.parse(settled.risk_row_json);
   if(!parent||!['OPEN','CLOSED'].includes(parent.state))throw Error();
   for(const key of ['wallet','signal','reservation','margin','signature','wire_hash','confirmed_slot','day','position_address','entry_exit_plan'])if(parent[key]!==original[key])throw Error();
   return response({ok:true,status:{stage:'WEB_PERPS_OPERATION_SETTLED',reviewId:row.review_id,walletAddress:row.wallet,signature:row.signature,
    recordBinding:input.recordBinding,wireHash:row.wire_hash,outcome:settled.financial_state==='OPEN'?'CONFIRMED':'FAILED',financialState:parent.state,
    confirmedSlot:settled.confirmed_slot,executionDay:settled.execution_day,settledAt:settled.settled_at}});
  }catch{return response({error:'WEB_PERPS_STATUS_UNAVAILABLE'},503);}
 };
}
