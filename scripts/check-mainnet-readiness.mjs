import { readFile } from "node:fs/promises";

const fileUrl = new URL("../security/mainnet-readiness.json", import.meta.url);
const readiness = JSON.parse(await readFile(fileUrl, "utf8"));
const requirements = Object.entries(readiness.requirements || {});
const incomplete = requirements.filter(([, item]) => item?.status !== "approved");
const requiredEvidence = {
  independentAudit: ["reportUrl", "auditor"],
  legalReview: ["opinionReference", "jurisdictions"],
  devnetAdversarialRehearsal: ["evidenceUrl"],
  verifiableBuild: ["sourceCommit", "executableHash", "verificationUrl"],
  upgradeAuthorityMultisig: ["address", "threshold", "timelockSeconds"],
  incidentResponse: ["policyUrl", "securityContact"],
  ownerApproval: ["approvalReference"]
};
const invalidEvidence = requirements.filter(([name, item]) => (
  item?.status === "approved"
  && (requiredEvidence[name] || []).some((key) => {
    const value = item[key];
    return value == null || value === "" || (Array.isArray(value) && value.length === 0);
  })
));
const ready = readiness.mainnetEnabled === true && incomplete.length === 0 && invalidEvidence.length === 0;

const report = {
  ready,
  network: readiness.network,
  completed: requirements.length - incomplete.length,
  total: requirements.length,
  incomplete: incomplete.map(([name, item]) => ({ name, status: item?.status || "missing" })),
  invalidEvidence: invalidEvidence.map(([name]) => name)
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--enforce") && !ready) {
  process.exitCode = 1;
}
