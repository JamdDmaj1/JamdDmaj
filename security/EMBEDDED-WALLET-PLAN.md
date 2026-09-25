# Embedded wallet — production delivery plan

## Current status — 2026-09-25

The goal is real funds in the main Android app, not completion of a devnet preview. Native Android devnet creation, encrypted backup recovery, biometric signing and a confirmed devnet transfer are now implemented; see DEVNET-LAB.md. Assets opens the native activity through an origin-restricted navigation-only bridge. Same-owner recovery preserves the transaction journal. Explicit Solana/BNB real/test chain domains and exact integer amount parsing are implemented, but not yet wired to a production signer. CI run 36125915841 at da85353 passed.

The sections below are historical prototype notes and are superseded by this status. In particular their claims that no native integration or devnet transfer exists are no longer current.

### Remaining production acceptance criteria

1. Maintained native multichain key derivation/signing and standard interoperable recovery. The raw Ed25519 devnet backup is deliberately test-only; never silently migrate its seed to real funds.
2. Separate production vault and explicit user ownership/account-switch isolation, with verified device-loss recovery and biometric lifecycle handling.
3. Real-network receive/send for native SOL and BNB: chain identity, destination validation, exact amounts, fees, manual review, biometric confirmation and durable transaction status. Token transfers, swaps and futures are separate capabilities.
4. Independent derivation/signing vectors, test-network end-to-end checks and production security-boundary review. No real transfers by the implementation agent.
5. Permanent production signing, main-app release and verified update delivery. A debug/preview APK is not a stable production update.

### Native SDK distribution check

Trust Wallet Core supplies Android Java/JNI multichain functionality. Its official Maven distribution requires GitHub Packages authentication: https://developer.trustwallet.com/developer/wallet-core/integration-guide/android-guide

A read-only request for the 4.8.3 Maven POM using the existing GitHub credential returned HTTP 401 on 2026-09-25. No credentials were exposed, changed or committed. This blocks that distribution route with the current credential, not all project progress. Use a private appropriately scoped package credential/CI secret or evaluate a reproducible source build; do not substitute unofficial binaries or improvised cryptography.

Bitget remains separate and paused. External, embedded and practice balances must not substitute for one another. Wallet connection alone is not account authentication.

### Production foundations added after the distribution check

- Official Wallet Core source-build workflow pins 4.8.3 commit 5031fe6dd14b6d11a5de9892ea4ea1ee443fa13f. Run 36126636684 was launched; a launch is not proof of a usable SDK artifact. No package credential is used by this route.
- `PortableWalletBackup` encrypts 256-bit BIP39 entropy with a profile-bound format separate from the raw devnet seed format. Java and independent Node recovery agree, including a Unicode password; tampering and relabeled devnet backups are rejected. This is not yet a complete wallet creation/recovery UI.
- Production hardware vaults bind ciphertext to native owner, wallet ID, app package and versioned recovery profile. The same hardened storage engine preserves existing devnet aliases, AAD and envelope bytes. Namespace isolation is not user authentication: authorized native profile selection remains to be implemented.
- `NativeWalletBalances` reads exact native SOL/BNB balances with network identity checks and freshness timestamps. It does not substitute zero after failures. Public RPC endpoints are initial connectivity only; production capacity/reliability must be assessed before broad rollout.

## Archived prototype notes

User intent: separate user-controlled wallets within JamdDmaj, plus external wallet connection. Independent of Bitget, with manual user confirmations. Solana and BNB Chain are requested; exchange accounts are a separate integration.

## Implemented locally

An experimental offline encryption/recovery primitive using Web Crypto PBKDF2-SHA256 and authenticated AES-256-GCM. Fixed versioned parameters, bounded backup parsing, test-only domain separation. Tests exercise serialized recovery, incorrect passphrases, tampering and fresh encryption randomness. This module is deliberately absent from the production asset manifest.

References: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey and https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams

## Not ready for deposits

### Devnet transfer rehearsal

The unpublished experimental JavaScript test wallet now restores a bounded encrypted backup file into a fresh instance and prepares native SOL transfers capped at 0.1 test SOL. It pins the public Solana devnet endpoint, checks genesis identity, simulates before review and again with the signature, validates current fees/balance/block height, requires explicit confirmation of an immutable review, and tracks chain confirmation separately from submission. Unknown submission results retain the expected signature and block further preparation; there is no automatic resend. A synchronous journal interface now saves an uncertain record before broadcast and restores pending status into a new session. The local CLI uses a metadata-only file adapter with fsync, atomic rename, exclusive write locks and unresolved-signature protection. Tests cover reopening, storage failures and existing locks. This is NOT integrated with Android persistence; power-loss/filesystem guarantees, crash-injection tests and stale-lock recovery remain unverified. It is not suitable for real funds.

The controlled live rehearsal reached encrypted-backup recovery but the devnet faucet rejected `requestAirdrop`; one subsequent smaller test request returned HTTP 429, after which requests stopped. No transfer was submitted. Mocked RPC tests passed; a confirmed real devnet transfer and receiver balance increase are still unverified. This code is NOT connected to Android hardware storage or a production UI. The biometric diagnostic result reported by the user verifies only the fixed disposable native test pattern.

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
