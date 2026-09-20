export function pnl(position, price) {
  return (price - position.entry) * position.quantity * (position.side === 'long' ? 1 : -1);
}
export function openPosition({side, margin, leverage, price, balance, stop=null, take=null, mode='isolated'}) {
  if (!['long', 'short'].includes(side) || ![margin, leverage, price, balance].every(Number.isFinite)
      || margin <= 0 || margin > balance || price <= 0 || leverage < 1 || leverage > 1000 || !['isolated','cross'].includes(mode)
      || !Number.isFinite(margin*leverage/price))
    throw new Error('Revisa margen, saldo y apalancamiento (1–1000× en simulación).');
  if ((stop !== null && (!Number.isFinite(stop) || stop <= 0 || (side === 'long' ? stop >= price : stop <= price)))
      || (take !== null && (!Number.isFinite(take) || take <= 0 || (side === 'long' ? take <= price : take >= price))))
    throw new Error('El stop y el objetivo deben estar en el lado correcto del precio.');
  return {side, margin, leverage, entry: price, quantity: margin * leverage / price, stop, take, mode, collateral:mode==='cross'?balance:margin};
}
export function liquidationPrice(p) {
  const value=p.entry+(p.side==='long'?-1:1)*((p.collateral??p.margin)-p.margin*.05)/p.quantity;
  return value>0?value:null;
}
export function exitReason(p, price) {
  if ((p.collateral??p.margin) + pnl(p, price) <= p.margin * 0.05) return 'Liquidación simulada';
  if (p.stop !== null && (p.side === 'long' ? price <= p.stop : price >= p.stop)) return 'Stop loss';
  if (p.take !== null && (p.side === 'long' ? price >= p.take : price <= p.take)) return 'Take profit';
  return null;
}
export function settle(p, price) { return Math.max(0, (p.collateral??p.margin) + pnl(p, price)); }
export function indicators(values, period=20) {
  let ema=values[0],gain=0,loss=0;
  return values.map((value,i)=>{
    ema=i?value*2/(period+1)+ema*(1-2/(period+1)):value;
    const slice=values.slice(Math.max(0,i-period+1),i+1),mean=slice.reduce((a,b)=>a+b,0)/slice.length;
    const dev=Math.sqrt(slice.reduce((a,b)=>a+(b-mean)**2,0)/slice.length);
    if(i){const d=value-values[i-1];if(i<=14){gain+=Math.max(d,0)/14;loss+=Math.max(-d,0)/14;}else{gain=(gain*13+Math.max(d,0))/14;loss=(loss*13+Math.max(-d,0))/14;}}
    return {sma:i>=period-1?mean:null,ema,upper:i>=period-1?mean+2*dev:null,lower:i>=period-1?mean-2*dev:null,rsi:i<14?null:(!gain&&!loss?50:!loss?100:100-100/(1+gain/loss))};
  });
}
