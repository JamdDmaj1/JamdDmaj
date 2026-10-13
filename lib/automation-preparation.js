// Connect configuration, account limits and Jupiter preparation; never sign or send.
import {validateAutomationSettings} from './automation-panel.js';
import {applyAutomationExits,checkDailyTradeLimit} from './automation-settings.js';
import {checkAutomationEntry} from './automation-risk.js';
import {prepareJupiterAutomationSignal} from './jupiter-perps-automation.js';
export async function prepareConfiguredAutomation({settings,signal,decision,walletAddress,snapshot,enabled,paused,maxSlippageBps,now=Date.now()},request=globalThis.fetch){
  settings=validateAutomationSettings(settings);
  const count=checkDailyTradeLimit(settings,snapshot?.tradesToday);
  if(!count.allowed)throw Error(count.reason);
  // Loss reservation uses full collateral: a stop price is not a guaranteed fill.
  const risk=checkAutomationEntry({limits:settings,enabled,paused,snapshot,order:{marginUsd:settings.margin,maxLossUsd:settings.margin},now});
  if(!risk.allowed)throw Error(risk.reason);
  if(snapshot.walletAddress!==walletAddress)throw Error('ACCOUNT_MISMATCH');
  const adjusted=applyAutomationExits(signal,settings);
  const prepared=await prepareJupiterAutomationSignal(adjusted,{decision,walletAddress,marginUsd:settings.margin,leverage:settings.leverage,maxSlippageBps,now},request);
  return {...prepared,review:{marginUsd:settings.margin,leverage:settings.leverage,sl:adjusted.sl,tp:adjusted.tp1,reservedMaxLossUsd:settings.margin},requiresFreshAccountBeforeSigning:true};
}
