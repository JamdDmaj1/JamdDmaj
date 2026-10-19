// Pure planning only: no wallet access, signing, sending, or activation.
import {validateAutomationSettings} from './automation-panel.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
function percentUnits(value){
 const text=String(value);if(!/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/.test(text))throw Error('INVALID_EXIT_PRECISION');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
function percentagePrice(entry,percent,above){
 const denominator=100000000n,p=percentUnits(percent),factor=above?denominator+p:denominator-p;
 if(factor<=0n)throw Error('INVALID_EXITS');
 const numerator=BigInt(exactUsdUnits(entry))*factor;
 // Round toward the entry: never widen the requested SL or invent a higher
 // profit target to compensate for binary floating-point rounding.
 const units=above?numerator/denominator:(numerator+denominator-1n)/denominator;
 const text=String(units/1000000n)+'.'+String(units%1000000n).padStart(6,'0'),number=Number(text);
 if(exactUsdUnits(number)!==units.toString())throw Error('INVALID_EXIT_PRECISION');return number;
}
export function applyAutomationExits(signal,settings){
  settings=validateAutomationSettings(settings);
  const entry=Number(signal.entry),direction=signal.side==='LONG'?1:signal.side==='SHORT'?-1:0;
  if(!Number.isFinite(entry)||entry<=0||!direction)throw Error('INVALID_SIGNAL');
  const sl=settings.stopLossPercent===null?Number(signal.sl):percentagePrice(entry,settings.stopLossPercent,direction===-1);
  const tp1=settings.takeProfitPercent===null?Number(signal.tp1):percentagePrice(entry,settings.takeProfitPercent,direction===1);
  if(!Number.isFinite(sl)||!Number.isFinite(tp1)||sl<=0||tp1<=0||direction*(entry-sl)<=0||direction*(tp1-entry)<=0)throw Error('INVALID_EXITS');
  return {...signal,sl,tp1};
}
export function planDailyLossAction(settings){
  settings=validateAutomationSettings(settings);
  const nextSettings={...settings},factor=1-settings.reductionPercent/100;
  if(settings.lossAction==='reduce-leverage')nextSettings.leverage=Math.max(1.1,Math.floor(settings.leverage*factor*10)/10);
  if(settings.lossAction==='reduce-margin')nextSettings.margin=Math.floor(settings.margin*factor*100)/100;
  return {enabled:false,paused:true,requiresExplicitReactivation:true,nextSettings,reason:'DAILY_LOSS_LIMIT'};
}
export function checkDailyTradeLimit(settings,tradesToday){
  settings=validateAutomationSettings(settings);
  if(!Number.isInteger(tradesToday)||tradesToday<0)return {allowed:false,reason:'INVALID_DAILY_COUNT'};
  return tradesToday>=settings.dailyTrades?{allowed:false,reason:'DAILY_TRADE_LIMIT'}:{allowed:true,reason:'COUNT_ONLY'};
}
