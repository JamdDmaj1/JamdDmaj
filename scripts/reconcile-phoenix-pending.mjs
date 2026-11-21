const BASE = process.env.PERPS_AUTOMATION_URL || "http://127.0.0.1:8788/v1/automation";
const TOKEN = process.env.JAMDDMAJ_SERVICE_TOKEN || "";
const WALLETS = (process.env.PERPS_RECONCILE_WALLETS || "3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T").split(",").map(v => v.trim()).filter(Boolean);
if (!TOKEN) { console.error("missing service token"); process.exit(2); }
async function call(action, fields = {}) {
  const response = await fetch(BASE, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", Origin: "https://www.jamddmaj.com" }, body: JSON.stringify({ action, ...fields }), signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(action + " HTTP " + response.status + " " + JSON.stringify(data).slice(0, 300));
  return data;
}
for (const walletAddress of WALLETS) {
  try {
    const status = await call("phoenixStatus", { walletAddress });
    const operations = status?.phoenix?.operations || [];
    if (operations.some(op => op.attemptState === "UNKNOWN")) {
      const result = await call("phoenixReconcile", { walletAddress });
      console.log("reconciled", walletAddress, JSON.stringify(result.phoenix));
    }
    const after = await call("phoenixStatus", { walletAddress });
    for (const op of after?.phoenix?.operations || []) {
      if (!["SETTLING", "CANONICAL_READY", "PAYOUT_PENDING"].includes(op.state)) continue;
      try {
        const paid = await call("phoenixPayout", { walletAddress, workflowId: op.workflowId, explicitApproval: true });
        console.log("payout", walletAddress, op.symbol, JSON.stringify(paid.phoenix));
      } catch (error) { console.error("payout-error", walletAddress, op.symbol, error.message); }
    }
  } catch (error) { console.error("reconcile-error", walletAddress, error.message); }
}
