# Pinned Android Wallet Core

Official Trust Wallet Core 4.8.3, source commit
`5031fe6dd14b6d11a5de9892ea4ea1ee443fa13f`.

Built by `.github/workflows/wallet-core-source.yml`:
https://github.com/JamdDmaj1/JamdDmaj/actions/runs/36195922802

AAR SHA-256: `eec5addbada174fd3946b29d237b18bdc049ea82c5b1196181079d9504df42a4`.
Contains arm64-v8a, armeabi-v7a, x86 and x86_64 native libraries.
The checked-in binary avoids expiring CI downloads or unpinned Maven resolution.
Keep the upstream LICENSE with this artifact. Rebuilding/upgrading requires a new
checksum and independent Android derivation/signing verification before adoption.

Offline Android API 30 verification (3 tests passed):
https://github.com/JamdDmaj1/JamdDmaj/actions/runs/36203674643

This is component-level evidence, not a completed wallet audit, device recovery
test, real transfer test, or authorization to advertise deposits as available.
JNI HDWallet/PrivateKey objects are released by the SDK's GC mechanism, not an
explicit close API. Wiping Java input buffers cannot guarantee erasure of native
copies. Production UI must isolate signing from WebView, enforce native biometric
authorization, and not expose generic signing or secret methods to JavaScript.
