// Read-only diagnostics. Partial exits belong to one trade, not separate wins.
export function auditPaperPerformance(closed = [], open = []) {
 const pending = new Set(open.map(item => item.signalId));
 const trades = new Map();
 for (const leg of closed) {
  if (!leg.signalId || !Number.isFinite(leg.netPnl)) continue;
  const item = trades.get(leg.signalId) || {symbol:String(leg.symbol || 'Unknown'),net:0,fees:0};
  item.net += leg.netPnl;
  item.fees += Number.isFinite(leg.estimatedFees) ? leg.estimatedFees : 0;
  trades.set(leg.signalId,item);
 }
 const completed = [...trades].filter(([id]) => !pending.has(id)).map(([,item]) => item);
 const sum = list => list.reduce((total,item) => total + item.net,0);
 const wins = completed.filter(item => item.net > 0), losses = completed.filter(item => item.net < 0);
 const gain = sum(wins), loss = -sum(losses);
 return {sampleSize:completed.length,partialTrades:trades.size-completed.length,
  netPnl:sum(completed),estimatedFees:completed.reduce((n,item)=>n+item.fees,0),
  expectancy:completed.length ? sum(completed)/completed.length : null,
  averageWin:wins.length ? gain/wins.length : null,
  averageLoss:losses.length ? loss/losses.length : null,
  profitFactor:loss > 0 ? gain/loss : null,
  sufficientSample:completed.length >= 30,
  bySymbol:[...new Set(completed.map(item=>item.symbol))].map(symbol=>{
   const items=completed.filter(item=>item.symbol===symbol);
   return {symbol,trades:items.length,netPnl:sum(items)};
  }).sort((a,b)=>a.netPnl-b.netPnl)};
}
