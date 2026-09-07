# JAMD external review handoff

This is the non-secret handoff index for the independent technical auditor and
qualified US/Florida counsel. It is not an approval and contains no wallet
secret, identity document or privileged advice.

## Technical auditor

Send `AUDITOR-RFP.md`, `AUDIT-READINESS.md`, `security/INDEPENDENT-REVIEW-REQUEST.md`
and this repository at commit
`e678e52ee42d07dbe4c33939c2d12abd95919144`. The expected CI program hash is
`ccfb9e37bbab5afd872c3dadac0e86496688420658173bf478d21255d0bb0fe6`.
The auditor must independently rebuild it, publish the resulting hash, report
findings, review remediations and identify the final reviewed commit.

## Legal counsel

Send `security/LEGAL-REVIEW-BRIEF.md`, `LEGAL-READINESS.md`,
`security/jamd-mainnet-intent.json` and `security/jamd-allocation-plan.json`.
Ask for a written decision for the four stages listed in the brief, covering
US federal law and Florida. Keep the opinion private; record only counsel name,
date, jurisdiction, result, restrictions and a private reference identifier.

## Evidence returned

Do not change a readiness status to approved until the corresponding reviewer
returns evidence. Record the audit report URL, auditor and reviewed binary hash;
record the legal opinion reference and jurisdictions without uploading the
privileged opinion. The owner's final authorization is a separate last step
after all restrictions are encoded and the exact addresses and costs are shown.
