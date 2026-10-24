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

## Confirmed implementation gap

Phantom web has an owner-approved full-close flow, optional protected USDC conversion, separate orphan-exit cancellation and permanent uncertainty handling. Android native entry has native review, biometric-bound signing, durable broadcast and recovery, but **no implemented native position-closing action**. `NativeWalletActivity` only offers entry review; `wallet-trading-panel.js` creates the close panel only outside native platforms, and that panel requires an external wallet session. Server "native close" tests concern server custody policy, not the Android wallet UI. Do not confuse them.

Do not recommend a funded native opening while its close path is absent. Do not export wallet secrets or weaken provider validation as a shortcut.

## Small source correction

The web order panel now refuses a clearly insufficient USDC margin or minimum SOL reserve when a fresh selected-wallet public snapshot already proves insufficiency. This display-level refusal can only stop an attempt; it never replaces server checks or authorizes signing. Generic preparation failures now mention collateral, fees and limits rather than incorrectly pointing only to Google/Phantom login. Focused review/build/Edge tests: 13/13 passed; browser build and diff check passed. No financial execution logic was broadened.

This source correction is not yet a new web or Android publication. The user's authenticated manual policy/provider flow and any funded owner-approved acceptance remain unverified. Asked the user which platform to finish first (Phantom web vs Android native), and requested the visible review message without signing or depositing. No actual trial risk values were selected for them.
