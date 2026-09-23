# Embedded wallet — development scope

User intent: separate user-controlled wallets within JamdDmaj, plus external wallet connection. Independent of Bitget, with manual user confirmations. Solana and BNB Chain are requested; exchange accounts are a separate integration.

## Implemented locally

An experimental offline encryption/recovery primitive using Web Crypto PBKDF2-SHA256 and authenticated AES-256-GCM. Fixed versioned parameters, bounded backup parsing, test-only domain separation. Tests exercise serialized recovery, incorrect passphrases, tampering and fresh encryption randomness. This module is deliberately absent from the production asset manifest.

References: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey and https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams

## Not ready for deposits

### Devnet transfer rehearsal

The unpublished experimental JavaScript test wallet now restores a bounded encrypted backup file into a fresh instance and prepares native SOL transfers capped at 0.1 test SOL. It pins the public Solana devnet endpoint, checks genesis identity, simulates before review and again with the signature, validates current fees/balance/block height, requires explicit confirmation of an immutable review, and tracks chain confirmation separately from submission. Unknown submission results retain the expected signature and block further preparation in that session; there is no automatic resend. This in-memory implementation does NOT have durable crash/restart reconciliation and is not suitable for real funds.

The controlled live rehearsal reached encrypted-backup recovery but the devnet faucet rejected `requestAirdrop`; no transfer was submitted. Mocked RPC tests passed; a confirmed real devnet transfer and receiver balance increase are still unverified. This code is NOT connected to Android hardware storage or a production UI. The biometric diagnostic result reported by the user verifies only the fixed disposable native test pattern.

References: https://solana.com/docs/rpc/http/simulatetransaction and https://solana.com/docs/rpc/http/sendtransaction

The local test-only lifecycle now exercises create → encrypted backup → restored-backup verification → locked → unlocked → lock/dispose, plus recovery into a fresh in-memory instance. It derives disposable Solana test addresses only after recovery verification, cancels late unlocks and clears temporary seed buffers. It has no persistence, signing, broadcasting, BNB derivation, account authentication or production UI. Native protected storage, full device-loss recovery and independent review remain prerequisites, not completed features.

Assets now has a separate external-wallet read-only connection module for Wallet Standard Solana accounts and browser EIP-1193/EIP-6963 Ethereum/BNB providers. It requests public account access and native balances only. Wallet connection is not proof of login or server authorization. Native mobile provider transport remains separate; no claim of a working embedded Android wallet is made.

This is not a wallet or a security audit. It neither derives addresses nor signs or broadcasts transactions. No production user keys were created. JavaScript buffer clearing cannot guarantee removal of all copies or passwords from memory.

## Required before real funds

- Decide and implement isolated key handling: Android Keystore-backed storage and an isolated web signer or vetted embedded wallet service. Do not store plaintext keys in localStorage or server databases.
- Standard interoperable recovery and derivation for Solana and EVM networks, verified with independent test vectors. Require successful backup recovery before displaying receive instructions.
- Explicit per-user ownership and isolation, lock lifecycle, device-loss recovery, safe updates and compromised-page threat model.
- Testnet receive/send with fee estimation, network/token identity, explicit user confirmation, rejection handling and transaction tracking.
- Clear separation of external-wallet, embedded-wallet, exchange balances and simulator.
- Independent security review and deployment review before public multi-user custody-related functionality; manual trading alone does not remove these concerns.

UI direction: Home, Markets, Trade and Assets; practice under More. No invented addresses, automatic transactions, or automatic mainnet activation.
