# Adjustable bot controls — 2026-10-25

Scope: expose explicit activation review and disabling, with user-adjustable limits. No account activation, funds transfer, live signing, or financial broadcast was performed.

The effective worker configuration already permits execution through its systemd override. Reading only the base service gave an incorrect earlier diagnosis. Read-only health confirmed executionAvailable=true; the controls database contained zero enabled accounts. Database integrity and an existing verified backup were checked without reading key material.

The UI previously discarded readiness after a successful save or pause. It now refreshes authenticated readiness and requires the same wallet and settings revision before allowing activation review. Changed settings, missing backup, failed refresh, and unchecked confirmation remain blocking. Saving limits pauses new entries. Disabling does not close existing positions.

Web source 011fa28 was deployed and promoted as dpl_4Yz1V3cJSsQL7RxNLRmuNWXP1VYJ. A browser test on the public website intercepted all financial-server requests and used fictional controls; adjustable values, saving, activation review, unchecked consent, and disabling passed without real account writes.

Android v1.38.3 failed before APK generation. Full local tests identified three regressions: a stale wallet-login cache version, a test assuming the global headers occupied the first configuration row, and the prebuilt packager rejecting the additional wallet security rule. These were corrected without removing security checks. The affected 86 tests pass and mobile synchronization passes. Replacement release v1.38.4 completed successfully at https://github.com/JamdDmaj1/JamdDmaj/actions/runs/40220462575.

Publication verification: v1.38.4 is neither draft nor prerelease and contains JamdDmaj-AI.apk (79,840,542 bytes). Downloaded SHA-256 is 4f77572e06abe80362b3fb82c3860aeee2e67239bcd25d899e6c19e5d2a40a69, matching GitHub's asset digest. Android tools verified the existing signing certificate d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6 and package com.jamddmaj.ai, version 1.38.4, code 160. The public status endpoint advertises latestVersion 1.38.4; web remains the previously tested 1.38.3 control build. Full local suite: 1,013 passed, zero failed, 18 skipped (1,031 total).

Final read-only production check: controls, journal and backup databases pass integrity checks; zero enabled accounts, zero reservations and an existing verified backup. Worker health exposes executionAvailable=true. Finalized public Solana RPC observations for the dedicated wallet show 5 USDC and zero lamports. This blocks activation: collateral is below the integration's 10-USDC minimum and there is no native fee balance. No limits were changed, no account enabled and no transactions submitted. Live execution cannot be claimed verified from mocked/offline tests.

Do not confuse platform execution availability with an enabled user account or allocated bot capital. User activation still requires confirmed settings, dedicated-wallet readiness and explicit consent.
