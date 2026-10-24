# Manual futures step 1 — verification and platform decision

Status: **not complete as a combined web + native funded acceptance step**. Do not advance to the balance/bot steps or claim real trades were verified.

## Current evidence

- Public service health: mode execute, executionAvailable true, tradingEnabled false (global response is not individual account consent). Worker, manual web and TLS services active.
- Installed manual bundle hash remains `0adf4b477d63d656c01657e4aea62cc64524387dcd9a0c2221afb78817645b9d`, matching the recorded 1.38.1 installation. No production service or execution flag changed.
- Public chain view of the user's previously provided native address: 5,141,387 USDC units and 144,669,689 lamports, zero positions and zero orders at inspection. This is a point-in-time read, not capital allocation or signing authority.
- One Jupiter unsigned preparation request for BTC LONG, 10 USDC margin, 3x, 50 bps was rejected HTTP 422 with `insufficient_funds`. No owner signature or submission endpoint was used. The current application planner/form requires at least 10 USDC; existing SOL is not automatically converted into USDC.
- The protocol was checked against the official [Jupiter Perps API specification](https://perps-api.jup.ag/v1/docs). An unsigned preparation response is not financial execution proof.

## Verified without real funds

- Web/service/owner binding, policy, relay, recovery and six-route closing suites: 110 tests, 108 pass, zero failures, two explicit platform/browser skips. Log: `.perps-build/step1-manual-flow-20261024.log`.
- Current Android sources compiled and 109 targeted Perps tests ran on Windows: 103 passed, six persistence tests failed with Windows directory-fsync AccessDeniedException. Production durability checks were not weakened to hide that limitation.
- Current compiled Android main/test classes were copied into a NEW fixture-only directory on the VPS. The existing offline Linux Robolectric/JRE dependencies were reused, with current classes first in the classpath. A transient DynamicUser service used PrivateNetwork, PrivateTmp, ProtectSystem=strict, ProtectHome, NoNewPrivileges, 384 MiB maximum memory and 75% CPU. It could not reach financial services or production wallet directories.
- Linux native suite: **135/135 passed**, including the persistence tests that failed on Windows. Log: `.perps-build/step1-native-linux-20261024.log`. Fixture path: `/opt/jamddmaj-perps/checks/step1-manual-20261024`; transient unit completed successfully and collected. No production service restart occurred.

## Confirmed implementation gap at the start of this audit

Phantom web has an owner-approved full-close flow, optional protected USDC conversion, separate orphan-exit cancellation and permanent uncertainty handling. Android native entry has native review, biometric-bound signing, durable broadcast and recovery, but **no implemented native position-closing action**. `NativeWalletActivity` only offers entry review; `wallet-trading-panel.js` creates the close panel only outside native platforms, and that panel requires an external wallet session. Server "native close" tests concern server custody policy, not the Android wallet UI. Do not confuse them.

Do not recommend a funded native opening while its close path is absent. Do not export wallet secrets or weaken provider validation as a shortcut.

## Small source correction

The web order panel now refuses a clearly insufficient USDC margin or minimum SOL reserve when a fresh selected-wallet public snapshot already proves insufficiency. This display-level refusal can only stop an attempt; it never replaces server checks or authorizes signing. Generic preparation failures now mention collateral, fees and limits rather than incorrectly pointing only to Google/Phantom login. Focused review/build/Edge tests: 13/13 passed; browser build and diff check passed. No financial execution logic was broadened.

This source correction is not yet a new web or Android publication. The user's authenticated manual policy/provider flow and any funded owner-approved acceptance remain unverified. Asked the user which platform to finish first (Phantom web vs Android native), and requested the visible review message without signing or depositing. No actual trial risk values were selected for them.

## Native-first implementation follow-up

The user chose Android native first and reported the generic form refusal. The form now reports which field fails (margin, mandatory reference price, leverage or exit levels), while retaining the exact previous monetary and price constraints. The secure Android form also labels the reference price mandatory and refuses an empty value before preparation. This does not prove which value the user originally entered, and does not bypass the separate insufficient-USDC condition.

Added native full-close **intent and identity primitives only**, not an enabled close action:

- Bind a decoded program-owned position to native payer, market, side, full size and collateral.
- Check both full-close instruction discriminators, canonical Some(true), bounded redundant deltas, trusted-time window and inward-rounded long floor / short ceiling.
- Bind the 22 close roles to independently decoded market/collateral custodies, vaults, oracles, recipient ATA, program identities and derived request accounts, including signer/write capabilities.
- Settlement remains collateral first, with separate protected USDC conversion; no promise of an absolute minimum in the initial close.
- Seven new native fixture tests passed, including changed account-role rejection. Four navigation and ten web review regressions passed (14 total). These tests contain synthetic API signing keys only and never sign a user's transaction.

Still required before native close or funded entry acceptance: complete instruction/oracle policy, exact-wire simulation and independently validated payout/fee/rent effects, close-specific durable journal and recovery, biometric-bound review/submission, chain-confirmed position UI, and the separate conversion/exit-cleanup flow. New primitives are deliberately not connected to a signing path. No production flags, funds, deployments or installed APK changed in this follow-up.

## Subsequent native full-close implementation (source, not a publication)

The Android close path is now connected in source: an explicit **Review full close** action in the protected native Futures form reads the owned position, prepares a collateral-first close, verifies the exact partially signed message, shows a native review and requires a separate strong-biometric CryptoObject before owner signing. There is still no generic WebView signing endpoint. Lock/background invalidates the close session and cancels authorization.

Implemented native gates include fixed-mainnet reads, both 22-role close layouts, bounded compute/instruction capabilities, independently decoded oracle configuration and Pyth signer membership, strict Ed25519 checks, bounded/fresh signed price payloads, same-bank unsigned simulation, complete position removal, wallet/vault payout conservation, SOL/rent equations, immutable pool/custody parameters and position-reserve release. The review names the Solana token mint and return address; it does not misrepresent BTC/ETH collateral as native coins on another network.

The close protects the exact signed price limit. The displayed collateral return is explicitly an estimate, not a guaranteed absolute minimum. Revalidation repeats all native gates and keeps the original message, price limit, fee/rent amounts and delivery type; it does not reject an otherwise valid close solely because its estimated return moved within the approved price protection. Maximum close review lifetime is 25 seconds on the HTTPS-anchored monotonic clock, still subject to the stricter instruction-time and block-height checks. The independent USDC minimum applies only to a later conversion.

The journal distinguishes FULL_CLOSE from entry exposure, preserves legacy entry records and writes UNKNOWN durably before the first possible broadcast. A timeout, wrong response or background transition is not permission to retry. Shared pending-operation protection still covers swaps, transfers and entries. Network confirmation is followed by a read of the position before the UI claims it closed; missing position-state evidence is not reported as success.

An additional entry guard refuses remaining program-owned requests for that same owner/position PDA, including old TP/SL, instead of silently reopening under stale exits. A read-only public-mainnet probe confirmed the filtered request scan is available (slot 461036465, zero matching requests for the supplied native address). This probe did not prepare, sign or submit any transaction.

Verification during implementation:

- First isolated Linux run: 169 native tests passed, including new full-close signing/journal/timeout tests with synthetic keys and fake transports.
- The enlarged single-JVM run hit the enforced 384 MiB test-container memory limit. No production limit was increased. Splitting the JVMs then passed 136 baseline tests and 35 close tests. One Linux UI-manifest test could not prove the process name because that reused offline harness did not load the real merged Android manifest; the assertion was retained, not weakened.
- Windows/Gradle has separately passed the integrated native review for all six BTC/ETH/SOL Long/Short routes and both instruction variants. Final reruns after the moving-estimate/confirmation changes are recorded separately below when completed.

Remaining outside this implemented close path: native protected USDC conversion and orphan-exit cancellation as separate reviewed actions, physical-device biometric/funded acceptance, and a new signed Android release/publication. No real transaction, deposit, production execution flag, bot setting, wallet key or installed APK was changed during this work. Do not describe the entire seven-step trading project as complete or tell the user the new Android code is already installed/public.

Final source verification:

- Current main/test classes passed **174/174 native tests** in three fresh offline Linux JVMs (136 baseline, 36 close tests, 2 confirmation-bank tests). The synthetic review test traverses all six BTC/ETH/SOL Long/Short routes and both close variants. Log: `.perps-build/native-close-verified-20261024.log`; fixture-only path: `/opt/jamddmaj-perps/checks/native-close-verified-20261024`. Each transient run retained network isolation, read-only system/home protection, a 384 MiB memory ceiling and 75% CPU limit. No production restart or resource-limit increase was used.
- Current Gradle/Windows tests passed **12/12 native UI tests**, including the real merged manifest's non-exported separate native process and the locked close action. Additional selected close service/route/bank/locked-draft tests passed in that same build. The Linux UI harness limitation above was not "fixed" by weakening the production manifest or its assertion.
- The journal now persists the **last successfully revalidated bank**, not just the initial display bank. Restarted confirmation cannot claim a position closed from a snapshot older than that bank. The fixture advances the bank from 100 to 101 between signing and submission and verifies 101 survives disk restart.
- Navigation/web-review regression tests: 14/14 passed. Staged diff whitespace checks passed. No release/version bump, push, deployment, APK installation, real owner signature or financial submission occurred.

Implementation checkpoint: the previously missing native full-close code/UI path is implemented and tested with isolated fixtures. This is not a claim of physical-device or funded mainnet acceptance, and it does not complete native conversion/TP-SL cancellation or the overall seven-step project.
