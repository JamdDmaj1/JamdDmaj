import { reviewManualOrder } from './manual-order-draft.js';
import { manualTradingReadiness } from './manual-trading-readiness.js';

// Server-side preview only. Never queues an order or changes the pause.
export function preflightManualOrder(input, quote, state, now = Date.now()) {
  const draft = reviewManualOrder(input);
  const blockers = [...manualTradingReadiness(state, now).blockers];
  if (quote?.symbol !== draft.symbol || !Number.isFinite(quote?.price) || quote.price <= 0
      || !Number.isFinite(quote?.timestamp) || quote.timestamp > now + 5000 || now - quote.timestamp > 30000) {
    throw new Error('Quote missing, stale or does not match the contract.');
  }
  const freshDraft = reviewManualOrder({...draft, reference:quote.price});
  const drift = Math.abs(quote.price / draft.reference - 1);
  if (drift > 0.005) blockers.push('price_changed_review_again');
  const minLeverage = Number(quote.minLeverage), maxLeverage = Number(quote.maxLeverage);
  if (!Number.isFinite(minLeverage) || !Number.isFinite(maxLeverage) || minLeverage <= 0
      || maxLeverage < minLeverage || draft.leverage < minLeverage || draft.leverage > maxLeverage) blockers.push('exchange_leverage_limit');
  const minNotional = Number(quote.minNotional), minQuantity = Number(quote.minQuantity), step = Number(quote.quantityStep);
  let quantity = null;
  if (![minNotional,minQuantity,step].every(n=>Number.isFinite(n)&&n>0)) blockers.push('contract_size_rules_unavailable');
  else {
    // Preview only: exchange precision must be applied again by the executor.
    const units = Math.floor((freshDraft.notional / quote.price) / step);
    quantity = Number.isSafeInteger(units) ? units * step : null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity < minQuantity || quantity * quote.price < minNotional) blockers.push('below_exchange_minimum');
  }
  const risk = state?.executor?.accountRisk;
  const accountTime = Date.parse(risk?.updatedAt || '');
  if (!Number.isFinite(accountTime) || accountTime > now || now-accountTime > 120000
      || typeof risk?.available !== 'number' || !Number.isFinite(risk.available)) blockers.push('account_balance_unconfirmed');
  else if (risk.available <= freshDraft.margin) blockers.push('insufficient_balance_with_fee_reserve');
  return {draft:freshDraft, quote:{symbol:quote.symbol,price:quote.price,timestamp:quote.timestamp},
    estimatedQuantity:quantity,blockers:[...new Set(blockers)],
    submitted:false,liveOrderEnabled:false,requiresFinalValidation:true};
}
