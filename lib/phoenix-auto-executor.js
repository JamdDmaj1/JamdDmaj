// One bounded Phoenix automation cycle. No timers, no HTTP, no direct signing:
// every order goes through the Phoenix service and its server-vault gate.
import {openAutomaticPhoenixPosition, closeAutomaticPhoenixPosition} from './phoenix-auto-execution.js';

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
        if (row.state === 'OPENING' || row.state === 'CLOSING') continue;
        const item = items.get(row.workflow);
        if (!item) {
          if (row.state === 'CLOSING') store.markClosed(row.signal);
          continue;
        }
        if (item.state === 'CANONICAL_READY') {
          if (row.state !== 'OPENING') store.markClosed(row.signal);
          continue;
        }
        if (item.state !== 'OPEN' || !['LONG', 'SHORT'].includes(item.side)) continue;
        const mark = numberOf(item.markPriceUsd);
        const sl = Number(row.sl) / 1e6;
        const tp = Number(row.tp1) / 1e6;
        if (!Number.isFinite(mark) || !Number.isFinite(sl) || !Number.isFinite(tp)) continue;
        const hit = item.side === 'LONG' ? mark <= sl || mark >= tp : mark >= sl || mark <= tp;
        if (!hit) continue;
        store.closing(row.signal);
        try {
          await closeAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, workflowId: row.workflow});
          await send({event:'CLOSE',symbol:row.symbol,side:item.side,marginUsdcUnits:String(row.margin),entryPriceUsd:String(Number(row.entry)/1e6)});
          return Object.freeze({stage: 'PHOENIX_AUTO_CLOSE_SENT', signalId: row.signal, workflowId: row.workflow});
        } catch {
          return Object.freeze({stage: 'PHOENIX_AUTO_CLOSE_RETRY', signalId: row.signal, workflowId: row.workflow});
        }
      }
      const openSignals = store.open();
      const autoWorkflows = new Set(openSignals.map(row => row.workflow).filter(Boolean));
      const manualOpen = [...items.values()].some(item => item.state === 'OPEN' && !autoWorkflows.has(item.workflowId));
      const otherOpen = hasOtherOpen ? (await hasOtherOpen()) === true : false;
      if (manualOpen || otherOpen || openSignals.length >= state.settings.positions) return Object.freeze({stage: 'PHOENIX_AUTO_POSITION_LIMIT'});
      const feed = await readFeed();
      if (feed?.remotePaused) return Object.freeze({stage: 'PHOENIX_AUTO_REMOTE_PAUSED'});
      const candidates = Array.isArray(feed?.candidates) ? feed.candidates : [];
      const candidate = candidates.find(value => !store.read(value.id));
      if (!candidate) return Object.freeze({stage: 'PHOENIX_AUTO_NO_SIGNAL'});
      const symbol = resolveSymbol(symbolOf(candidate.pair));
      if (store.open().some(row => row.symbol === symbol)) return Object.freeze({stage: 'PHOENIX_AUTO_MARKET_OPEN'});
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
        const operation = await openAutomaticPhoenixPosition({service, ownerAccountHash, walletAddress, symbol, side: candidate.side});
        if (typeof operation?.workflowId !== 'string' || !/^[a-f0-9]{64}$/.test(operation.workflowId)) throw Error();
        store.attach(candidate.id, operation.workflowId);
        await send({event:'OPEN',symbol,side:candidate.side,marginUsdcUnits:String(Math.round(state.settings.margin*1e6)),entryPriceUsd:String(candidate.entry)});
        return Object.freeze({stage: 'PHOENIX_AUTO_OPEN_SENT', signalId: candidate.id, workflowId: operation.workflowId});
      } catch {
        store.fail(candidate.id);
        return Object.freeze({stage: 'PHOENIX_AUTO_OPEN_RETRY', signalId: candidate.id});
      }
    }
  });
}


