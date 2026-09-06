# Fair Launch audit-readiness package

This package defines what an independent Solana auditor must review. It is preparation for an audit, not an audit certificate.

## Frozen scope

- Program: `onchain/programs/jamddmaj-lock`
- Client transaction builder: `lib/solana-devnet-token.js`
- Public account verifier: `lib/fair-launch-devnet-verifier.js`
- Eligibility tree: `lib/fair-launch-eligibility.js`
- Lock model and tests: `lib/fair-launch-lock-model.js`, `tests/fair-launch-onchain.test.mjs`
- Treasury: `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr`
- JAMD Devnet credit payment: `api/jamd-credit-topup.js`, `lib/account-credits.js` and `lib/jamd-devnet-credit-payment.js`
- Launch fee: 100,000,000 lamports (0.1 SOL), paid atomically when policy initialization succeeds

The auditor must identify the exact Git commit. Any later code change invalidates the report until reviewed.

## Security invariants to verify

1. Candidate version 2 replaces the prototype's 730-day cliff and 365-day linear release with conservative timestamp floors of 731 and 1,096 days and 36 discrete release tranches. Auditors must verify the calendar-boundary assumptions, tranche arithmetic and version-1 compatibility. The currently deployed Devnet program does not yet satisfy this requirement.
2. Eligibility proofs bind policy, salted identity commitment, beneficiary and allocation; claims cannot be replayed.
3. Creator and early-participant vaults are canonical PDAs and cannot be substituted during claims.
4. Liquidity vaults are canonical PDAs and cannot be substituted during release.
5. Token transfers use checked Token/Token-2022 interfaces and cannot redirect to a different mint or beneficiary.
6. Mint and freeze authorities are removed atomically by the client release flow.
7. The 0.1 SOL fee can only reach the fixed treasury and a failed initialization cannot charge it.
8. Arithmetic, timestamps, account closure/reinitialization, duplicate mutable accounts and denial-of-service boundaries are tested.
9. The off-chain anti-Sybil provider never publishes raw identity data and a wallet is never treated as proof of one person.
10. Upgrade authority and governance behavior match public documentation and do not claim multisig enforcement that the program does not implement.
11. A finalized Devnet JAMD payment can credit only the authenticated account, exact mint and treasury; a transaction cannot be replayed and a provider failure refunds only the reserved internal credit.

## Required adversarial tests

- Under-lock and rounding boundaries, including maximum `u64` allocations.
- Claim before cliff, repeated claim, forged beneficiary, substituted vault, wrong mint and wrong token program.
- Reused identity commitment, changed allocation/wallet/policy, invalid or oversized proof and more than 2,000 registrations.
- Early registration before root sealing and attempted root replacement after sealing.
- Liquidity release before deadline, repeated release, wrong beneficiary and substituted vault.
- Wrong treasury, insufficient fee balance and transaction rollback after a later instruction fails.
- Token-2022 extension compatibility and unsupported-extension rejection policy.

## Reproducible evidence

For each release candidate preserve:

- Git commit and signed release tag.
- Pinned Anchor/Solana/Rust versions and dependency lockfiles.
- Host-test and sBPF-build logs.
- SHA-256 of `jamddmaj_lock.so` and generated IDL.
- Devnet program, mint, policy, vesting vault and liquidity-vault addresses.
- Independent audit report URL, remediation commit and auditor confirmation.
- Legal opinion reference without publishing personal or privileged material.

Use `npm run mainnet:readiness` for a readable status report. `npm run mainnet:gate` must fail until every external requirement is approved. There is intentionally no Mainnet deployment workflow.
