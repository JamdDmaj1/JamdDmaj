import {runProBacktest} from '../lib/pro-backtest.js';
// Public market reads and local computation only. No Redis writes or orders.
const result=await runProBacktest({force:true,persist:false});
console.log(JSON.stringify({auditedAt:new Date().toISOString(),readOnly:true,
 methodology:result.methodology,summary:result.outOfSampleValidation,
 symbols:result.perSymbol?.map(item=>({symbol:item.symbol,samples:item.samples,
  ambiguous:item.ambiguous,unresolved:item.unresolved,expectancyRoe:item.expectancyRoe,
  validation:item.chronologicalValidation})),
 limitation:'Historical public candles, not the actual execution ledger. No strategy change or profitability claim.'},null,2));
