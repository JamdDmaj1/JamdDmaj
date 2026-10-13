// Execution-independent preflight. This module grants no signing authority.
import {validateAutomationDraft} from './automation-panel.js';
export function checkAutomationEntry({limits,enabled,paused,snapshot,order,now=Date.now()}){
  try{limits=validateAutomationDraft(limits);}catch{return {allowed:false,reason:'INVALID_LIMITS'};}
  const deny=reason=>({allowed:false,reason});
  if(enabled!==true||paused!==false)return deny('NOT_ACTIVE');
  if(!snapshot||!Number.isFinite(snapshot.updatedAt)||now-snapshot.updatedAt>10000||snapshot.updatedAt>now+2000)return deny('STALE_ACCOUNT');
  if(!['availableUsd','allocatedUsd','lossTodayUsd','openPositions'].every(k=>Number.isFinite(snapshot[k])&&snapshot[k]>=0)||!Number.isInteger(snapshot.openPositions))return deny('INVALID_ACCOUNT');
  if(!order||!Number.isFinite(order.marginUsd)||order.marginUsd<=0||!Number.isFinite(order.maxLossUsd)||order.maxLossUsd<=0||order.maxLossUsd>order.marginUsd)return deny('INVALID_ORDER');
  if(snapshot.openPositions>=limits.positions)return deny('POSITION_LIMIT');
  if(order.marginUsd>snapshot.availableUsd)return deny('INSUFFICIENT_FUNDS');
  if(snapshot.allocatedUsd+order.marginUsd>limits.capital)return deny('CAPITAL_LIMIT');
  if(snapshot.lossTodayUsd+order.maxLossUsd>limits.loss)return deny('DAILY_LOSS_LIMIT');
  return {allowed:true,reason:'PREFLIGHT_ONLY'};
}
// Enabled state is intentionally memory-only: login and restart never activate it.
export function createAutomationControl(){
  let enabled=false,paused=true;
  return {
    state:()=>({enabled,paused}),
    activate({explicitApproval,executionReady}={}){if(explicitApproval!==true||executionReady!==true)throw Error('EXECUTION_NOT_AUTHORIZED');enabled=true;paused=false;},
    pause(){paused=true;},
    disable(){enabled=false;paused=true;}
  };
}
