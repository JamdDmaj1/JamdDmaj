# Embedded wallet — production delivery plan

## Latest work — 2026-10-09

Version 1.37.80 adds direct USDC-on-Solana withdrawal from the associated token
account. It compiles TransferChecked locally, optionally creates the recipient's
associated account, reviews the exact USDC amount and SOL fee/rent, and requires
biometric signing of the unchanged message. Both simulations verify payer and
token balance effects; changed fees/rent, stale contexts, frozen/delegated or
wrong-owner accounts are rejected. The shared Solana journal records the token
mint before sending and blocks retries after unknown outcomes. Native tests and
independent Solana Kit encoding vectors cover existing/new recipient accounts.
Android verification and signed main-app packaging are pending for this version.

This closes a source-level gap: displaying USDC balance previously did not offer
a direct USDC withdrawal. It does not complete external-wallet mobile integration
or demonstrate a real-money end-to-end transaction. No real funds were moved.
The owner's earlier recovery/biometric confirmation remains accepted; do not ask
them to repeat it as though no confirmation was given.

## Current status — 2026-10-04

Owner reports successful recovery with matching addresses and biometric unlock
in Wallet Verification. This is owner-reported physical acceptance, not an
independently observed mainnet transfer. Signed verification run `37192952517`
at `8ffb715` passed. Version 1.37.79 / Android code 135 is being prepared as a
main-app installable update, with native/SDK checks and permanent certificate
verification required before artifact delivery. External-wallet mobile trading,
full supported-route review and real-funds end-to-end verification remain open.
No automatic mainnet activation or public release is implied by this artifact.

Production service verification: deployment `dpl_7LpEAYHw693rPgCFdsQukziJXxuv`
at `f7922b3` is READY in production. The owner initiated the redeploy after
authorizing the existing Jupiter secret for Production and Preview. A public
GET to `https://www.jamddmaj.com/api/swap-build` returned `ok: true`, seven
instructions, `solana-mainnet-beta`, `requiresNativeValidation: true` and
`executable: false`. This verifies unsigned preparation, not transaction execution.
No secrets were displayed and no transaction was signed or submitted.

Android native checks `37162817311` and signed device-verification workflow
`37162913660` at the same commit both completed successfully. The isolated
signed verification APK is available for physical-device acceptance; it is not
the main-app production update. Physical-device recovery/biometric acceptance,
supported-route review, external-wallet mobile integration and final release
verification remain open. Earlier NOT_FOUND and pending-CI notes below are
historical and superseded by this evidence.

The production objective is **not complete**. The native SOL/BNB wallet now has a
preview UI, hardware-vault enrollment/recovery, fixed-network balance reads,
reviewed native-asset signing, pre-broadcast durable journals and status checks.
This is source/preview functionality, not an enabled main-app production release.

Verified evidence:

- Android run 37137686975 at `581f2a5` passed immutable review amount/expiry
  checks. Run 37140334052 at `74a9342` passed exact-message revalidation without
  fetching a replacement quote, including changed-fee rejection.
- `bc3f369` connects a native draft to owner-matched Ed25519 signing, exact-message
  revalidation, signed simulation and manual submission. The existing shared
  Solana journal now persists swap mints and minimum output before broadcasting,
  preserves metadata across state transitions and blocks both swaps and native
  transfers after an uncertain result. Disposable-key/fake-RPC tests cover these
  paths; Android run 37150035911 found a fixed-length native-transfer wire
  encoder incorrectly reused for swaps. `edd1605` supplies a bounded,
  single-signature variable-length swap encoder and adds exact human amount
  conversion using on-chain mint decimals. Corrective run 37150371579 passed.
  No real transaction was submitted.
  `51ddd0d` connects this lifecycle to the native wallet screen and biometric
  confirmation, with input mint addresses, human amounts, review and status lookup.
  Run 37151226859 compiled the application but failed packaging WalletPreview
  before UI tests ran; the log lacked a root cause. `8be219e` moves tests before
  packaging and enables stack traces. Run 37162562252 passed tests and APK packaging.
  The source now adds a navigation-only NativeWallet bridge and an explicit Assets
  button. It accepts only the bundled HTTPS localhost terminal, forwards no web
  arguments and never exports keys or signatures. Its new Android verification is
  pending; all 254 web tests passed locally. No production release was published.
  Hardware acceptance, full route/extension policy, main-app integration and release
  remain required. The source implementation is not a completed installable release.

- Public production `/api/swap-build` returned Vercel NOT_FOUND on 2026-10-03.
  The first-party preparation endpoint therefore still needs a verified production
  deployment and environment configuration; native source wiring alone is not
  operational service availability. Browser automation failed to establish a safe
  URL and later timed out; no Vercel settings were changed during those attempts.

- Run 37092084464 at `c526969` passed Android checks after binding Jupiter V2
  amounts, payer and mint/program positions to native intent. The preview rejects
  missing/duplicate swap instructions and mismatched output promises before
  simulation. This does not yet validate token-account ownership or setup/cleanup.
- `b2ac2c6` adds native associated-token address derivation using Wallet Core 4.8.3.
  Four public legacy/Token-2022 address vectors were independently calculated
  using Solana Kit; the two legacy values also matched a public unsigned Jupiter
  build response. SDK emulator run 37108897904 completed successfully, verifying
  all four vectors through the pinned native library on Android.
- `8722f74` validates associated account creation, exact SOL wrapping, native
  synchronization and refunds to the payer, rejects unrelated top-level programs
  and token authority changes, and caps compute instructions/priority fees.
  Preparation supplies an explicit 1,400,000-unit limit when the provider omits
  one. Android run 37109244946 completed successfully.
- Native preview now reads confirmed token-account state, verifies legacy SPL
  ownership/mint/permissions and input funds, and rejects additional writable
  token accounts controlled by the wallet. It reads mint decimals and checks SOL
  against wrapping plus the quoted fee. Android run 37109716824 at `04fd045`
  passed. Token-2022 extension policy and final
  signing/revalidation remain incomplete; SDK address support alone does not
  enable Token-2022 swaps.

- `9ae7650` adds simulation post-account checks for exact input consumption,
  minimum output, unchanged token permissions, fee payer delta, newly locked
  token-account rent and closed wrapped-SOL accounts. Android run 37110451212
  failed only on an expected exception type for a rejected malformed token
  account. `9277e77` normalized that error; Android run 37136863902 passed.
  This is not signing authorization or a production activation.
  `scripts/check-solana-simulation-effects.mjs` independently exercised the
  public devnet RPC with an unsigned self-transfer simulation: returned payer
  balance deducted the 5,000-lamport fee and a subsequent account read confirmed
  unchanged on-chain funds. No transaction was signed or submitted. This probe
  verifies RPC fee semantics, not Jupiter execution, wrapped-SOL closure or
  Android hardware signing.

- Native swap preview now requests the fee and simulates the exact unsigned
  message at a confirmed RPC context. It rejects expired blockhashes, absent or
  excessive fees, stale contexts and simulation errors, and binds the evidence
  to the candidate bytes. NativeSwapService connects preparation and simulation
  with a final expiry check. Android run 37091405545 at `f77b898` completed
  successfully, including these tests and APK compilation. Earlier run
  37090178166 failed because a rejection test omitted its checked JSON exception;
  this was corrected. Instruction/account policy, user review and swap signing
  remain unfinished.

- 2026-10-02: run 36476878486 at `aa4423c` completed successfully, covering
  Android compilation, native tests and the independent Solana Kit compiler check.
  All 251 JavaScript tests passed locally. The native swap preparation transport
  and intent parser now connect the first-party preparation response to the
  compiler, enforcing payer/mints/amount/slippage, expiry and bounded input.
  Run 37089212312 at `ba15669` completed successfully, including the new native
  preparation/parser tests, Android builds and all required workflow checks.
  The service returns an unsigned candidate;
  full account/instruction policy, simulation, review and submission remain pending.

- 2026-09-28: native compiler legacy/v0 fixture bytes match the independently
  encoded Solana Kit messages, including two-table writable/readonly ordering.
  Native RPC preparation now supplies confirmed, network-verified table accounts
  to the compiler. Added Android fixture tests for compilation and duplicate-key
  rejection before network access; their CI result is still pending. This is
  preparation, not instruction-policy approval or an enabled swap signer.

- 2026-09-28: local native message compiler checks pass for legacy and v0
  material, including cross-table writable-before-readonly ordering, stale
  lookup rejection, duplicate tables, additional signers and writable programs.
  The compiler has no signing/submission method. Independent serialization
  cross-checks, Android CI and full instruction-policy wiring remain pending;
  this is not an executable native swap release.

- 2026-09-28: a public, unsigned Jupiter `/swap/v2/build` request for the
  disposable test address `2btLJAAb1S3x6hZYdVyAePjqtQYi2ZBSRGy4569RZu8h`
  passed the build-service validator (7 instructions, 1 lookup table). This
  was a local provider integration check, not a verified call through the
  authenticated Vercel Preview endpoint and not a signed transaction.
  The returned shared-accounts V2 header now supplies a native decoder test
  fixture. Amount/slippage/header checks are not full instruction-policy validation.

- 2026-09-28: Native check run 36411334798 at `225d47b` completed successfully,
  including Android compilation and the new lookup-account/USDC RPC tests.
  Earlier run 36411014200 failed during APK packaging, not source compilation;
  the subsequent run succeeded without relaxing build or test requirements.
- `/api/swap-build` prepares bounded Jupiter instruction material (no signing or
  submission), checks the exact request and output threshold, shares quote quotas,
  and discards provider-supplied resolved lookup addresses. Its material still
  requires native instruction-policy validation and an explicit user review.
  The 250 JavaScript tests passed locally; mocked build-provider tests do not
  prove live preparation or a completed trade. Native wiring remains unfinished.

- 2026-09-27: Preview deployment `BdM71gAQGKkhwGScGCJoKfnCE9Ec`
  at `0885741` displayed a live Jupiter indicative quote in Trade for 0.01 SOL
  (1.201463 USDC at observation time, not a current or guaranteed price).
  Earlier Edge requests failed with TypeError classified REDIRECT_FAILURE;
  replacing unsupported redirect-error mode with manual redirect rejection
  resolved the observed failure. Redirect destinations are never followed.
  All 243 JavaScript tests passed. This proves quote retrieval only: native
  swap transaction review/signing/submission and production delivery remain
  incomplete. No taker, signing request or transaction was submitted.

- Native Android build, UI/storage/RPC tests and APK-signature verification passed
  at `bb7d5b0e96e427a06d821cfac8cef54823ff4cc2` in
  https://github.com/JamdDmaj1/JamdDmaj/actions/runs/36282066685 .
- Android API 30 offline SDK tests passed at `2773ae9` in
  https://github.com/JamdDmaj1/JamdDmaj/actions/runs/36281396180 . These exercise
  independent derivation/signature checks and SOL/BNB pipelines with fake RPC;
  they do **not** prove mainnet transfers or physical-device biometrics.
- Preview artifact 10919058182 has APK SHA-256
  `7b150604653fc2b6773341dd20f1b71ddc476212ffb28b56a7a3b99bcc312804`.
  It uses package `com.jamddmaj.ai.walletpreview` and an ephemeral CI debug
  certificate. Do not uninstall an older wallet to resolve a signing conflict.

Remaining acceptance, without implying that tests satisfy these requirements:

1. User's physical-device validation of this **new BIP39 production-profile**
   backup/recovery and biometric lifecycle. Earlier devnet acceptance does not
   satisfy this. Do not request the backup password or private material in chat.
2. Stable signing/update delivery and a production native entry point. Preview
   installation is not a production update; current production version remains
   1.37.78. No mainnet activation follows automatically from CI success.
3. Security-boundary review and operational acceptance before real deposits.
4. Trading route selection: native-wallet token swaps and Bitget manual trading
   use different funds. Native SOL/BNB transfers are not token swaps or futures.
   The native swap integration is absent; Bitget activation remains unverified.
5. Verify the requested external-wallet/mobile and multi-user experience, then
   release and verify the main app and update notification end to end.

No real transfer or trade was submitted by the implementation agent.

### User decision and installation issue — 2026-09-27

The user selected buying/selling inside JamdDmaj independently of Bitget, with
optional external wallet connections (for example Phantom and Bitget Wallet).
Native-wallet token swaps are therefore required; exchange-only trading is not
a substitute. No additional trading-route question is needed for that distinction.
The phone reports an existing-package conflict installing the ephemeral-signed
preview. Preserve that app and its data. The isolated `walletAcceptance` build
uses the existing permanent release signing credentials and a new app identity;
it is a verification delivery, not a production activation or data migration.

## Historical status — 2026-09-25

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
