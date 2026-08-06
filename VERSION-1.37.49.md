# JamdDmaj AI v1.37.49

- Adds the Devnet-only Anchor program for creator and early-participant vesting with the mandatory 85% floor, 24-month cliff and gradual release.
- Adds a program-controlled liquidity-position lock with a 24-month minimum.
- Adds privacy-preserving Merkle eligibility proofs that bind a uniqueness commitment, wallet, allocation and launch policy without storing raw identity data on-chain.
- Adds a read-only public Devnet verifier to Fair Launch Lab. It requires no wallet or signature and distinguishes technical verification from an audit.
- Adds adversarial JavaScript tests and reproducible Rust/sBPF GitHub checks. CI builds an unsigned artifact and never deploys or stores a wallet key.
- Mainnet, real liquidity and automatic deployment remain disabled pending independent audit, legal review and explicit approval.
