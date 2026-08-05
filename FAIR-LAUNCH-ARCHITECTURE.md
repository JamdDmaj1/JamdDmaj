# JamdDmaj Fair Launch architecture

## Current phase: safe product simulator

Version 1.37.43 adds a local Fair Launch Lab. It does not connect a wallet, accept funds, mint a token, deploy a contract, or authorize mainnet activity. Its output is a JSON design manifest with a SHA-256 fingerprint.

## Recommended network target

The first technical target is Solana Token-2022 because it supports token extensions and on-chain metadata while remaining close to the user experience expected from a pump.fun-style launch. Base ERC-20 remains an architecture comparison until the owner selects a network.

Relevant primary documentation:

- Solana token basics: https://solana.com/docs/tokens/basics
- Solana Token Extensions: https://solana.com/solutions/token-extensions
- Solana metadata extension: https://solana.com/docs/tokens/extensions/metadata
- Solana transfer hook guide: https://solana.com/developers/guides/token-extensions/transfer-hook
- OpenZeppelin vesting primitives for an EVM alternative: https://docs.openzeppelin.com/contracts/5.x/api/finance

## Protection model

1. Fixed supply is minted once, then mint authority is revoked.
2. Freeze authority is disabled so an issuer cannot arbitrarily freeze ordinary holders.
3. Reviewed metadata becomes immutable.
4. Creator purchases lock at least 85%.
5. The first 2,000 eligible participants lock at least 85% of their protected allocation.
6. The initial 15% remains liquid; the locked 85% has a 24-month cliff and then unlocks linearly over 12 months.
7. Liquidity-position receipts are locked for at least 24 months.
8. Bootstrap purchases are capped at 1% per wallet.
9. Administrative actions require a multisig and timelock.
10. Mainnet remains blocked until testnet rehearsal, independent audit, legal review, and explicit owner approval.

## Anti-Sybil limitation

A wallet is not a person. A rule that only counts wallet addresses can be bypassed with many wallets. The production design therefore needs an eligibility layer, wallet-cluster review, per-participant caps, and a privacy-preserving proof that one participant has not claimed multiple protected allocations. No identity provider is selected or contacted in the current phase.

## Required phases before a real launch

1. Select the network and legal jurisdiction.
2. Write the on-chain factory, vesting vault, liquidity locker, and eligibility adapter.
3. Add deterministic local validator tests and adversarial property tests.
4. Deploy only to testnet/devnet and publish all addresses and source code.
5. Obtain an independent security audit and resolve every critical/high finding.
6. Complete legal review of token utility, sales, disclosures, sanctions/KYC requirements, and consumer protections.
7. Ask the owner for explicit authorization before any mainnet deployment or transaction that creates cost.
