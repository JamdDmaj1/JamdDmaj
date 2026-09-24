# Native devnet lab — not production

## Assets integration preview

The Android finance Assets panel now opens the native devnet activity inside the app. The `DevnetWallet` bridge exposes only `open()` from `https://localhost/private-simulator.html`; no URL/transaction/key arguments are accepted, and no wallet data returns to JavaScript. The native activity is non-exported in the main/preview manifest. Web and unsupported builds show an availability notice instead of a fake wallet.

The isolated integration preview has application ID `com.jamddmaj.ai.walletpreview` and label `JamdDmaj Wallet Preview`. It does not replace the existing app or Wallet Lab. Import the saved encrypted test backup through Android's native picker to recover the same devnet address; local transaction history and hardware wrapping keys are not migrated across app IDs. Existing production release/version and Bitget configuration remain unchanged.

UI launch/missing-plugin/failure tests are automated. After installing the integration preview, the user reported the same recovered address and the expected 4.998995 devnet SOL balance. This supplies user-reported integrated recovery acceptance, not a security audit or biometric-invalidation test.

## Fault validation

`DevnetWalletServiceTest` exercises the native service with Robolectric Android storage and injected deterministic RPC failures. It covers existing-wallet overwrite rejection, wrong network, insufficient funds, failed simulation, changed fee, expired blockhash, locked submission, uncertain broadcast across restart, processed-versus-finalized failure, duplicate draft submission, confirmed status persistence and corrupted journals. These tests use no network or funds; their assertions do not prove hardware-backed biometric behavior. Production construction always uses the fixed HTTPS devnet transport; the injection constructor is package-private and inaccessible through the web bridge.

Remaining production gates include an independent security assessment and device testing of hardware-key invalidation/interrupted recovery. No production deployment or mainnet enablement is authorized by a passing fault-test suite alone. Preserve the existing encrypted backup and installed preview while these gates remain outstanding.

Separate application ID: `com.jamddmaj.ai.walletlab.devnet`. Android 11+ and hardware-enforced strong biometrics required. Never install as a replacement for the production app. No Bitget changes or production signing secrets.

The native flow generates a disposable random Ed25519 seed, exports an authenticated encrypted file through Android's file picker, then requires reopening and decrypting that file before storing the recovered seed in the biometric hardware-backed vault. The backup password needs at least 16 characters. File and password must be kept separately. This custom test format is not a standard seed phrase.

The sole network endpoint is Solana devnet over HTTPS, with genesis verification. Native SOL only, maximum 0.1 test SOL per manually reviewed transfer. Simulation, fresh fee and balance checks, biometric signing and durable pre-broadcast journaling precede submission. Uncertain submissions cannot be automatically retried. App backgrounding cancels authorization; it cannot undo a transaction already sent.

Validation: pure Java RFC8032 key/signature vectors, backup recovery and wrong-password/tamper rejection, exact amount checks, independent Node decryption of the Java backup fixture, and byte-for-byte transaction comparison against Solana Kit. CI compiles the APK and checks merged manifest isolation. Automated checks do not replace device testing or constitute a security audit.

## Completed happy-path acceptance, 2026-09-24

- Build tested: `bd32948593eabad1602ab1ab539a4e56af077cbb`; GitHub Actions run `35935419679` succeeded. APK SHA-256: `6ce777001c4a0d15ec886d39782036c864a5298054d0c77c0266fce9eb1657a1`.
- User reported saving/reopening the encrypted backup, entering its password, completing biometric recovery and seeing the devnet address. This is user-reported device evidence, not remote instrumentation.
- Faucet initially rate-limited automated requests. The user subsequently requested test funds; RPC confirmed 5 SOL on devnet, and the user confirmed the same balance in the app.
- User performed the reviewed, biometric test transfer. RPC `getTransaction` with finalized commitment independently verified one native SOL transfer of 1,000,000 lamports, no error, fee 5,000 lamports, and source post-balance 4,998,995,000 lamports.
- Transaction: `MbKHXHJ4hgeVdwZNWVDTMAtf4GK4vwqyp6gFQyqX3gU9B76Mr2gY3t6w9HtmDdAhBiwoPvDnW7ETCVrVbEkoFeq`. Network: Solana devnet. Recipient was disposable, with its private key discarded; never send real assets there.
- User confirmed that closing/reopening the app and checking the last transfer still showed confirmed. This verifies the reported restart happy path, not all interruption/failure scenarios.
- Test suite: 223 passing; native cryptographic and encoding checks separately passed. No production configuration or Bitget pause changes were part of this delivery.

The isolated devnet happy path is delivered. Production hardening, independent security review, device-loss recovery across devices, biometric-enrollment invalidation, interruption/failure device tests, production wallet integration and multichain support remain separate work. Never use real money in this lab.
