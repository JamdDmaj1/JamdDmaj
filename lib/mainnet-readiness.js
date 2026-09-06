// Documentary preflight only; does not authenticate evidence or authorize signing.
export const REQUIRED_EVIDENCE = Object.freeze({
  independentAudit: Object.freeze(["reportUrl", "auditor"]),
  legalReview: Object.freeze(["opinionReference", "jurisdictions"]),
  devnetAdversarialRehearsal: Object.freeze(["evidenceUrl"]),
  verifiableBuild: Object.freeze(["sourceCommit", "executableHash", "verificationUrl"]),
  upgradeAuthorityMultisig: Object.freeze(["address", "threshold", "timelockSeconds"]),
  incidentResponse: Object.freeze(["policyUrl", "securityContact"]),
  ownerApproval: Object.freeze(["approvalReference"])
});

function validEvidence(key, value) {
  if (key === "jurisdictions") return Array.isArray(value) && value.length > 0
    && value.every(item => typeof item === "string" && item.trim().length > 0);
  if (key === "threshold") return Number.isSafeInteger(value) && value >= 2;
  if (key === "timelockSeconds") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateReadiness(input) {
  const readiness = input ?? {};
  const requirements = readiness.requirements ?? {};
  const names = Object.keys(REQUIRED_EVIDENCE);
  const incomplete = names.filter(name => requirements[name]?.status !== "approved")
    .map(name => ({ name, status: requirements[name]?.status || "missing" }));
  const invalidEvidence = names.filter(name => requirements[name]?.status === "approved"
    && REQUIRED_EVIDENCE[name].some(key => !validEvidence(key, requirements[name][key])));
  const validSchema = readiness.schemaVersion === 1 && readiness.network === "solana-mainnet-beta";
  return {
    ready: validSchema && readiness.mainnetEnabled === true && incomplete.length === 0 && invalidEvidence.length === 0,
    network: readiness.network ?? null, validSchema,
    completed: names.length - incomplete.length - invalidEvidence.length,
    total: names.length, incomplete, invalidEvidence
  };
}
