# JamdDmaj Fair Launch architecture

## Current phase: Devnet on-chain prototype, not deployed

Version 1.37.49 adds the first Anchor implementation of the protected launch policy. Program-controlled vaults enforce the 85% allocation floor, 730-day cliff, gradual release and 730-day liquidity-position lock. A privacy-preserving Merkle adapter binds one hashed uniqueness commitment to one wallet, allocation and launch policy, with a hard capacity of 2,000 registrations. The public app can read and verify the resulting Token-2022 mint and policy accounts without connecting a wallet. The program is source-complete but remains undeployed until its reproducible sBPF build passes and the owner approves a Devnet-only wallet transaction.

Version 1.37.48 makes the JamdDmaj launch policy mandatory in every normalized draft, including drafts restored from local storage. The creator uses a five-step flow, presents separate design, Devnet, audit and mainnet states, and shows a readable transaction summary before wallet approval. Those product controls complement, but do not replace, the new on-chain prototype or an independent audit.

Version 1.37.45 adds mobile wallet routes and an explicitly gated Solana Devnet Token-2022 prototype. A user may approve one Devnet transaction that creates a fixed-supply mint, sends the initial supply to the connected wallet, disables freeze authority and revokes mint authority. The app never receives a seed phrase or private wallet key, does not persist wallet sessions, does not accept payments and cannot authorize mainnet activity. The generated design manifest still includes a SHA-256 fingerprint.

The boost planner is also non-financial in this release. It calculates simulated JDMAJ platform credits for transparent directory placement, verification, analytics, education and security visibility. Fake volume, fake holders, price manipulation and guaranteed-return claims are outside the product design and payments remain disabled.

## Wallet connection foundation

- Uses Wallet Standard discovery rather than a Phantom-only integration.
- Supports compatible injected wallets such as Phantom, Solflare and Backpack.
- Connecting is identification-only. The separate Devnet token-creation action requests an explicit transaction approval in the wallet; the on-chain lock program has no automatic deployment path.
- Addresses and wallet selections remain in memory and are not stored in JamdDmaj databases or local storage.
- Mobile users without an injected provider are directed to the official Solana wallet directory; native deep-link signing remains out of scope until testnet transaction review is implemented.

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

## Anti-Sybil boundary

A wallet is not a person. The eligibility adapter now accepts salted 32-byte identity commitments and proves membership without putting raw identity data on-chain. It prevents reuse of the same commitment and binds each proof to the beneficiary, allocation and policy. It does not itself prove that two commitments belong to different people; a lawful external uniqueness/KYC provider and clustering policy still need independent selection, privacy review and abuse testing.

## Required phases before a real launch

1. Select the network and legal jurisdiction.
2. Complete the launch factory around the implemented vesting vault, liquidity locker, and eligibility adapter.
3. Expand deterministic validator tests and adversarial/property testing after the pinned sBPF build passes.
4. Deploy only to Devnet with an owner-approved Devnet-only wallet, then publish all addresses, build hash and source code.
5. Obtain an independent security audit and resolve every critical/high finding.
6. Complete legal review of token utility, sales, disclosures, sanctions/KYC requirements, and consumer protections.
7. Ask the owner for explicit authorization before any mainnet deployment or transaction that creates cost.
