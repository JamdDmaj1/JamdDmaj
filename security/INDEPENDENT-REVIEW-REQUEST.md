# Independent review request — JAMD protected launch

Status: request package only; it is not an audit report or approval.

Review the exact release candidate commit supplied by the owner. Rebuild the
program with the committed `onchain/Cargo.lock` and the toolchain recorded by
the `Fair Launch on-chain safety` workflow. Compare the SHA-256 of
`jamddmaj_lock.so` with the repository artifact and publish the independent
build environment, command log and resulting hash.

The security scope and adversarial matrix are defined in `AUDIT-READINESS.md`.
The reviewer must additionally confirm:

- the deployed Mainnet program would be byte-for-byte the reviewed binary;
- mint and freeze authorities are revoked in the atomic creation flow;
- creator and participant vaults cannot be substituted or redirected;
- the 85% floor, 2,000-slot limit, 731-day cliff, 36 tranches and 731-day
  liquidity lock cannot be weakened;
- eligibility commitments do not equate wallets with people;
- fee destination, rollback behavior, Token-2022 extensions and denial-of-
  service limits have adversarial coverage;
- all critical/high findings are remediated and the remediation commit rebuilt.

The final report must name the auditor, exact commit, executable hash, findings,
remediation commit and confirmation URL. JamdDmaj must not mark the audit as
approved from a self-produced CI result.
