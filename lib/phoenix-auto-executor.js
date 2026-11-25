// One bounded Phoenix automation cycle. No timers, no HTTP, no direct signing:
// every order goes through the Phoenix service and its server-vault gate.
import {openAutomaticPhoenixPosition, closeAutomaticPhoenixPosition, recoverAutomaticPhoenixClose} from './phoenix-auto-execution.js';

function fail() { throw Error('PHOENIX_AUTO_CONFIGURATION'); }
function units(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) fail();
  return String(Math.round(n * 1e6));
}
function symbolOf(pair) {
  if (typeof pair !== 'string' || !/^[A-Z0-9]{2,16}USDT$/.test(pair)) fail();
  return pair.slice(0, -4);
}
function numberOf(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}
function signedUnits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 1e6));
}
function exitOutcome(item, sl, tp) {
  const mark = numberOf(item.markPriceUsd);
  if (!Number.isFinite(mark)) return 'CLOSED';
  if (item.side === 'LONG') return mark >= tp ? 'TP' : mark <= sl ? 'SL' : 'CLOSED';
  return mark <= tp ? 'TP' : mark >= sl ? 'SL' : 'CLOSED';
}

export function createPhoenixAutoExecutor({controls, service, store, readFeed, ownerAccountHash, walletAddress, hasOtherOpen = null, notify = null, symbolMap = null, now = Date.now} = {}) {
  if (typeof controls?.readForOwner !== 'function' || typeof service?.positions !== 'function'
    || typeof service?.prepareEntry !== 'function' || typeof store?.open !== 'function'
    || typeof readFeed !== 'function' || typeof ownerAccountHash !== 'string' || typeof walletAddress !== 'string'
    || (hasOtherOpen !== null && typeof hasOtherOpen !== 'function') || (notify !== null && typeof notify !== 'function')
    || (symbolMap !== null && !(symbolMap instanceof Map)) || typeof now !== 'function') fail();
  const who = Object.freeze({ownerAccountHash, walletAddress, automation: true});
  const resolveSymbol = value => symbolMap instanceof Map ? (symbolMap.get(value) || value) : value;
  const send = async value => { try { await notify?.(value); } catch {} };
  return Object.freeze({
    async runOnce() {
      const state = controls.readForOwner({ownerAccountHash});
      if (!state || state.walletAddress !== walletAddress || state.enabled !== true || state.paused !== false) {
        return Object.freeze({stage: 'PHOENIX_AUTO_INACTIVE'});
      }
      const positions = await service.positions(who);
      const items = new Map((positions?.items || []).map(item => [item.workflowId, item]));
      const open = store.open();
      // Close first: SL/TP is evaluated from the venue mark, not from a cached UI.
      for (const row of open) {
        if (row.state === 'OPENING') continue;
        if (row.state === 'CLOSING') {
          try {
            const recovered = await recoverAutomaticPhoenixClose({service, ownerAccountHash, walletAddress, workflowId: row.workflow});
            if (recovered?.state === 'COMPLETE') {
              store.markClosed(row.signal);
              store.lesson?.({signal: row.signal, workflow: row.workflow, symbol: row.symbol, side: row.side, outcome: 'CLOSED', entry: row.entry, reason: 'recovered settlement after restart'});
            }
          } catch {}
          continue;
        }
        const item = items.get(row.workflow);
        if (!item) continue;
        if (item.state === 'CANONICAL_READY') {
          if (row.state !== 'OPENING') {
            try {
              const recovered = await recoverAutomaticPhoenixClose({service, ownerAccountHash, walletAddress, workflowId: row.workflow});
              if (recovered?.state === 'COMPLETE') {
                store.markClosed(row.signal);
                store.lesson?.({signal: row.signal, workflow: row.workflow, symbol: row.symbol, side: row.side, outcome: 'CLOSED', entry: row.entry, reason: 'recovered settlement after restart'});
              }
            } catch {}
          }
          continue;
        }
        if (item.state !== 'OPEN' || !['LONG', 'SHORT'].includes(item.side)) continue;
        const mark = numberOf(item.markPriceUsd);
        const sl = Number(row.sl) / 1e6;
        const tp = Number(row.tp1) / 1e6;
        const entry = Number(row.entry) / 1e6;
        const risk = Math.abs(entry - sl);
        if (!Number.isFinite(mark) || !Number.isFinite(sl) || !Number.isFinite(tp) || !Number.isFinite(entry) || !(risk > 0)) continue;
        const tracking = store.tracking?.(row.signal);
        const previousBest = Number(tracking?.best ?? row.entry) / 1e6;
        const previousWorst = Number(tracking?.worst ?? row.entry) / 1e6;
        const best = item.side === 'LONG' ? Math.max(previousBest, mark) : Math.min(previousBest, mark);
        const worst = item.side === 'LONG' ? Math.min(previousWorst, mark) : Math.max(previousWorst, mark);
        store.track?.({signal: row.signal, best: signedUnits(best), worst: signedUnits(worst)});
        const favorableR = item.side === 'LONG' ? (best - entry) / risk : (entry - best) / risk;
        const currentR = item.side === 'LONG' ? (mark - entry) / risk : (entry - mark) / risk;
        const retraceR = item.side === 'LONG' ? (best - mark) / risk : (mark - best) / risk;
        const targetDistance = Math.abs(tp - entry);
        const extendedTarget = favorableR >= 0.8
          ? (item.side === 'LONG' ? tp + targetDistance * 0.25 : tp - targetDistance * 0.25)
          : tp;
        let dynamicReason = null;
        if (favorableR >= 0.5 && currentR <= 0.02) dynamicReason = 'BREAKEVEN';
        else if (favorableR >= 0.75 && retraceR >= Math.max(0.35, favorableR * 0.4)) dynamicReason = 'TRAILING_STOP';
        else if (favorableR >= 0.5 && retraceR >= 0.5) dynamicReason = 'REVERSAL_LOCK';
        const fixedHit = item.side === 'LONG' ? mark <= sl || mark >= extendedTarget : mark >= sl || mark <= extendedTarget;
        if (!fixedHit && !dynamicReason) continue;
        store.closing(row.signal);
        try {
          const closed = await closeAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, workflowId: row.workflow});
          const outcome = fixedHit ? exitOutcome(item, sl, extendedTarget) : 'CLOSED';
          const reason = fixedHit
            ? (outcome === 'TP' ? (extendedTarget !== tp ? 'extended take-profit mark reached' : 'take-profit mark reached') : outcome === 'SL' ? 'stop-loss mark reached' : 'closed outside SL/TP')
            : dynamicReason === 'BREAKEVEN' ? 'breakeven protection after favorable move'
              : dynamicReason === 'TRAILING_STOP' ? 'trailing stop after favorable move'
                : 'momentum reversal lock after favorable move';
          store.lesson?.({signal: row.signal, workflow: row.workflow, symbol: row.symbol, side: row.side, outcome,
            entry: row.entry, exit: signedUnits(item.markPriceUsd), pnl: signedUnits(item.unrealizedPnlUsdcUnits), reason});
          if (closed?.state === 'COMPLETE') store.markClosed(row.signal);
          await send({event:'CLOSE',symbol:row.symbol,side:item.side,marginUsdcUnits:String(row.margin),entryPriceUsd:String(Number(row.entry)/1e6),exitPriceUsd:String(item.markPriceUsd??''),pnlUsdcUnits:String(item.unrealizedPnlUsdcUnits??''),slUsdcUnits:String(row.sl),tp1UsdcUnits:String(row.tp1)});
          return Object.freeze({stage: 'PHOENIX_AUTO_CLOSE_SENT', signalId: row.signal, workflowId: row.workflow});
        } catch {
          return Object.freeze({stage: 'PHOENIX_AUTO_CLOSE_RETRY', signalId: row.signal, workflowId: row.workflow});
        }
      }
      const openSignals = store.open();
      const autoWorkflows = new Set(openSignals.map(row => row.workflow).filter(Boolean));
      const manualOpen = [...items.values()].some(item => {
        if (item.state !== 'OPEN' || autoWorkflows.has(item.workflowId)) return false;
        return Array.isArray(item.trader?.positions) && item.trader.positions.some(position => {
          try { return BigInt(position.baseLots ?? 0) !== 0n; } catch { return false; }
        });
      });
      const otherOpen = hasOtherOpen ? (await hasOtherOpen()) === true : false;
      if (manualOpen || otherOpen || openSignals.length >= state.settings.positions) return Object.freeze({stage: 'PHOENIX_AUTO_POSITION_LIMIT'});
      const feed = await readFeed();
      if (feed?.remotePaused) return Object.freeze({stage: 'PHOENIX_AUTO_REMOTE_PAUSED'});
      const candidates = Array.isArray(feed?.candidates) ? feed.candidates : [];
      const candidate = candidates.find(value => !store.read(value.id));
      if (!candidate) return Object.freeze({stage: 'PHOENIX_AUTO_NO_SIGNAL'});
      const symbol = resolveSymbol(symbolOf(candidate.pair));
      if (store.open().some(row => row.symbol === symbol)) return Object.freeze({stage: 'PHOENIX_AUTO_MARKET_OPEN'});
      const lessons = store.lessons?.() || [];
      const recentLesson = lessons.find(row => row.symbol === symbol && row.side === candidate.side
        && ['SL', 'FAILED'].includes(row.outcome) && now() - Number(row.updated) < 30 * 60 * 1000);
      if (recentLesson) return Object.freeze({stage: 'PHOENIX_AUTO_LESSON_COOLDOWN', signalId: candidate.id});
      store.reserve({
        signal: candidate.id,
        symbol,
        side: candidate.side,
        margin: String(Math.round(state.settings.margin * 1e6)),
        entry: units(candidate.entry),
        sl: units(candidate.sl),
        tp1: units(candidate.tp1)
      });
      try {
        const marketLeverage = Number(candidate.maxLeverage);
        const leverageTenths = Number.isFinite(marketLeverage) && marketLeverage >= 1.1
          ? Math.min(500, Math.round(marketLeverage * 10))
          : Math.round(state.settings.leverage * 10);
        const operation = await openAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, symbol, side: candidate.side, marginUsdcUnits: String(Math.round(state.settings.margin * 1e6)), leverageTenths});
        if (typeof operation?.workflowId !== 'string' || !/^[a-f0-9]{64}$/.test(operation.workflowId)) throw Error();
        store.attach(candidate.id, operation.workflowId);
        const reserved=store.read(candidate.id);
        await send({event:'OPEN',symbol,side:candidate.side,marginUsdcUnits:String(Math.round(state.settings.margin*1e6)),entryPriceUsd:String(candidate.entry),slUsdcUnits:String(reserved?.sl??''),tp1UsdcUnits:String(reserved?.tp1??'')});
        return Object.freeze({stage: 'PHOENIX_AUTO_OPEN_SENT', signalId: candidate.id, workflowId: operation.workflowId});
      } catch (error) {
        store.fail(candidate.id);
        store.lesson?.({signal: candidate.id, symbol, side: candidate.side, outcome: 'FAILED', entry: units(candidate.entry),
          reason: String(error?.message || error).slice(0, 240)});
        return Object.freeze({stage: 'PHOENIX_AUTO_OPEN_RETRY', signalId: candidate.id});
      }
    }
  });
}





