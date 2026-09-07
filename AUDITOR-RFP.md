# Request for proposal: JamdDmaj Fair Launch security audit

JamdDmaj requests an independent security review of a Solana Token-2022 launch and protection program before any Mainnet deployment.

## Frozen release candidate

- Source commit: `e678e52ee42d07dbe4c33939c2d12abd95919144`
- Program binary SHA-256: `ccfb9e37bbab5afd872c3dadac0e86496688420658173bf478d21255d0bb0fe6`
- CI evidence: https://github.com/JamdDmaj1/JamdDmaj/actions/runs/34123907385
- Verification artifact: https://github.com/JamdDmaj1/JamdDmaj/actions/runs/34123907385/artifacts/10019388185
- Governance: Squads Mainnet multisig `FFyAmn9dauQQjq8d6eLP8ZWBJexJBpLMTYmgDo8zSygJ`, threshold 2/3, 86,400-second timelock

The review and final report must identify this exact commit and hash. Any
program change creates a new candidate and requires review of the delta.

## Scope

- Anchor program and all instructions under `onchain/programs/jamddmaj-lock`.
- JavaScript transaction construction, account decoding, public verification and eligibility-tree implementation listed in `AUDIT-READINESS.md`.
- Deployment, upgrade-authority, multisig/timelock and verifiable-build procedure.
- Atomic fixed-supply creation, authority revocation, 0.1 SOL platform fee, 85% vesting, early-participant eligibility and liquidity locks.

## Requested work

1. Manual code review and automated/static analysis appropriate for Solana and Anchor.
2. Adversarial local-validator/Devnet tests covering every invariant and scenario in `AUDIT-READINESS.md`.
3. Review of Token-2022 extension compatibility, account constraints, PDA derivation, signer/authority boundaries, CPI behavior, arithmetic, replay and denial-of-service risks.
4. Preliminary report with severity, exploit scenario and remediation guidance.
5. Review of remediation commits and a final public report identifying the exact Git commit and unresolved risks.

## Required proposal details

- Relevant Solana/Anchor audits and references.
- Named reviewers, schedule, price and retest policy.
- Conflict-of-interest disclosure.
- Report disclosure policy and whether critical findings are privately embargoed until fixed.
- Confirmation that the auditor is independent from JamdDmaj development.

No auditor receives a seed phrase, private key or production credential. Testing uses local validator or Devnet only. Mainnet deployment is outside this engagement.
