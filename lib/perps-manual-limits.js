// Manual Phantom policy, deliberately independent of bot capital/settings.
import {exactUsdUnits} from './jupiter-perps-order.js';
export function validateManualPerpsLimits(value){
 const fail=()=>{throw Error('INVALID_MANUAL_PERPS_LIMITS');};
 if(!value||Object.keys(value).sort().join(',')!=='capitalUsd,dailyLossUsd,dailyTrades,positions')fail();
 let capital,loss;
 try{if(typeof value.capitalUsd!=='string'||typeof value.dailyLossUsd!=='string')fail();capital=BigInt(exactUsdUnits(value.capitalUsd));loss=BigInt(exactUsdUnits(value.dailyLossUsd));}catch{fail();}
 if(capital<10000000n||loss>capital||!Number.isSafeInteger(value.positions)||value.positions<1||value.positions>10
  ||!Number.isSafeInteger(value.dailyTrades)||value.dailyTrades<1||value.dailyTrades>100)fail();
 const decimal=units=>{const digits=units.toString().padStart(7,'0'),fraction=digits.slice(-6).replace(/0+$/,'');return digits.slice(0,-6)+(fraction?'.'+fraction:'');};
 return Object.freeze({capitalUsd:decimal(capital),dailyLossUsd:decimal(loss),positions:value.positions,dailyTrades:value.dailyTrades});
}
