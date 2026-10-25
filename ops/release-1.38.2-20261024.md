# JamdDmaj 1.38.2 — main-application integration

The user requested functional integration/publication in the main application,
not continued use of a separate verification app. This checkpoint carries the
implemented native full close, remaining TP/SL cancellation and protected
post-close USDC conversion into the existing production application identity.

Target Android identity: `com.jamddmaj.ai`, version 1.38.2, code 158. The connected
phone currently has 1.38.1 / 157. Its installed public APK certificate was checked
read-only and matches the permanent production SHA-256 certificate:
`d4799319516f9b243b12ef4678823baed39d9203e42fa70f8de0ba0f7c0080d6`.
No wallet data or private key was accessed by this APK inspection.

Each existing native wallet now offers **Verify biometrics without trading**.
This uses the existing strong-biometric CryptoObject, decrypts only inside the
native consumer to verify the derived public identities, and does not prepare,
sign or submit a transaction. The status is separate from signing authority and
is cleared on lock/exit. Every financial operation retains its own independent
review and biometric approval. Cancellation does not remove live-position
protection; conversion still requires finalized proceeds and its protected
minimum. No production wallet schema or derivation contract was changed.

Local pre-publication checks: 27 focused preparation/navigation/access-boundary
tests passed; Windows Gradle native UI tests passed (including the new access
status lock/exit test). The preceding unchanged financial core passed 202
isolated native tests, and the separate offline physical-device run passed four
tests; neither is a claim of real funded acceptance or a completed biometric
approval in the main app.

Publication and installation evidence will be appended only after it exists.
No bot activation, account-limit confirmation, fund assignment, financial owner
signature or transaction submission is authorized by this software release.
Never uninstall the existing production application or clear its data to solve
an installation problem. Only a higher-version APK with the exact permanent
certificate may be installed over it.
