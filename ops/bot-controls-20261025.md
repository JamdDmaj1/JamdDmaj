# Adjustable bot controls — 2026-10-25

Scope: expose explicit activation review and disabling, with user-adjustable limits. No account activation, funds transfer, live signing, or financial broadcast was performed.

The effective worker configuration already permits execution through its systemd override. Reading only the base service gave an incorrect earlier diagnosis. Read-only health confirmed executionAvailable=true; the controls database contained zero enabled accounts. Database integrity and an existing verified backup were checked without reading key material.

The UI previously discarded readiness after a successful save or pause. It now refreshes authenticated readiness and requires the same wallet and settings revision before allowing activation review. Changed settings, missing backup, failed refresh, and unchecked confirmation remain blocking. Saving limits pauses new entries. Disabling does not close existing positions.

Web source 011fa28 was deployed and promoted as dpl_4Yz1V3cJSsQL7RxNLRmuNWXP1VYJ. A browser test on the public website intercepted all financial-server requests and used fictional controls; adjustable values, saving, activation review, unchecked consent, and disabling passed without real account writes.

Android v1.38.3 failed before APK generation. Full local tests identified three regressions: a stale wallet-login cache version, a test assuming the global headers occupied the first configuration row, and the prebuilt packager rejecting the additional wallet security rule. These were corrected without removing security checks. The affected 86 tests pass and mobile synchronization passes. Replacement release v1.38.4 is building at https://github.com/JamdDmaj1/JamdDmaj/actions/runs/40220462575. It is not yet verified published.

Do not confuse platform execution availability with an enabled user account or allocated bot capital. User activation still requires confirmed settings, dedicated-wallet readiness and explicit consent.
