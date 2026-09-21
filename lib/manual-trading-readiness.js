// Read-only diagnostics. This is not authorization to submit an order.
export function manualTradingReadiness(state = {}, now = Date.now()) {
  const executor = state.executor || {};
  const heartbeat = Date.parse(executor.receivedAt || executor.lastRunAt || "");
  const fresh = Number.isFinite(heartbeat) && now >= heartbeat && now - heartbeat <= 120000;
  const blockers = [];
  if (!fresh) blockers.push("heartbeat_missing_or_stale");
  if (executor.ok !== true || executor.bitgetSynced !== true) blockers.push("exchange_connection_unconfirmed");
  if (executor.mode !== "live") blockers.push("executor_not_live");
  if (executor.entrySource !== "manual-only") blockers.push("manual_only_unconfirmed");
  if (executor.manualOrderVersion !== 1) blockers.push("manual_protocol_unconfirmed");
  if (executor.exitSafetyBlockReason) blockers.push("exit_safety_block");
  if (state.executorTest?.signal || state.executorTest?.id) blockers.push("pending_manual_intent");
  if (state.config?.livePaused !== false || executor.livePaused !== false) blockers.push("entries_paused_or_unknown");
  return {
    readOnly: true,
    orderSubmitted: false,
    freshHeartbeat: fresh,
    blockers,
    // Passing these diagnostics does not validate idempotency or order execution.
    liveOrderEnabled: false,
    requiresEndToEndValidation: true
  };
}
