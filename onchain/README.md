# JamdDmaj protected launch program

This workspace contains the Devnet-only prototype for JamdDmaj Fair Launch. It is a real Solana/Anchor program, but it has **not been audited, deployed, or approved for Mainnet**.

## Enforced rules

- At least 85% of every creator and eligible early-participant allocation is deposited into a program-controlled token vault.
- The locked allocation has a 730-day cliff followed by at least 365 days of linear release.
- At most 2,000 privacy-preserving eligibility commitments can register once per launch policy.
- Eligibility proofs bind a hashed identity commitment to one beneficiary wallet, one allocation and one policy. Raw identity data must never be placed in the tree or on-chain.
- Liquidity-position tokens remain in a program-controlled vault for at least 730 days.
- Token movement uses checked Token Interface transfers, compatible with Token-2022.
- The creator mint, 85% vesting deposit and mint-authority revocation are submitted atomically by the app. A failed protection step leaves no partially created mint.
- The early-participant Merkle root may be sealed exactly once after the off-chain uniqueness review. Early vesting is disabled until that immutable root exists.

A wallet is not treated as a unique person. The off-chain eligibility provider must perform the permitted identity or uniqueness review, generate a random/salted 32-byte commitment, discard or separately protect personal data, and publish only the Merkle root.

## Safe build

The versions are pinned in `Anchor.toml`: Anchor 0.31.1 and Solana 2.1.0. From Ubuntu/macOS with those tools installed:

```text
cd onchain
cargo test --workspace
anchor build
```

The repository workflow performs host tests and an sBPF build. It never deploys and contains no wallet secret.

## Devnet rehearsal gate

Deployment is deliberately manual. Before deploying:

1. Confirm the CLI URL says `devnet`; stop if it says Mainnet.
2. Use a new Devnet-only wallet with faucet SOL. Never paste or commit its recovery phrase.
3. Build and record the `.so` SHA-256 hash and generated IDL.
4. Have the wallet owner review and approve the deployment transaction.
5. Initialize one policy, vesting vaults and a liquidity vault with valueless Devnet tokens.
6. Run adversarial tests for early claims, proof reuse, substituted wallets/allocations, short locks and unauthorized destinations.
7. Publish the program, mint and policy addresses so the app's read-only verifier can compare the accounts against the mandatory floors.

Do not deploy to Mainnet, add real liquidity or represent this prototype as audited. Mainnet requires an independent audit, legal review and explicit owner approval.

## Mainnet evidence gate

The review scope and required evidence are documented in `AUDIT-READINESS.md`, `AUDITOR-RFP.md`, `LEGAL-READINESS.md` and `SECURITY.md`. Run `npm run mainnet:readiness` to view the current status. The machine-readable gate in `security/mainnet-readiness.json` must remain closed until independent evidence exists for every requirement.
