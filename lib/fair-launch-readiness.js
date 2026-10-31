import {evaluateReadiness,REQUIRED_EVIDENCE} from './mainnet-readiness.js';
// Public summary only: never expose legal documents, approval references or keys.
export function fairLaunchReadinessSummary(source){
 const r=evaluateReadiness(source);
 return {network:r.network,ready:r.ready,completed:r.completed,total:r.total,documentaryOnly:true,
  requirements:Object.keys(REQUIRED_EVIDENCE).map(id=>({id,status:r.invalidEvidence.includes(id)?'invalid':r.incomplete.some(x=>x.name===id)?'missing':'recorded'}))};
}
