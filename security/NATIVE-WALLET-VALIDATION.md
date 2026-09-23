# Native test vault — not a production wallet

Update: the current debug launcher is the separate devnet wallet described in [DEVNET-LAB.md](DEVNET-LAB.md). The offline diagnostic described below was the earlier hardware-only build and remains as source, not the launcher. The user reported a successful fingerprint round trip in that earlier build; this does not establish the new devnet flow's real-device acceptance.

The implementation lives only in Android's `src/debug` source set. It is not registered as a Capacitor plugin, cannot be called from the WebView and is excluded from release builds. Do not store real wallet secrets in it.

## Implemented

- Fixed 32-byte disposable secret encrypted using AES-256-GCM, random platform IV, authenticated wallet-ID/application/devnet context.
- Non-exportable Android Keystore wrapping key, mandatory per-operation strong biometric authentication and hardware-backed key/authentication checks. Android 11 minimum for this component; no software or PIN fallback.
- Ciphertext-only fixed-size file in `getNoBackupFilesDir()`, outside app backup and existing external/cache file-sharing roots.
- Atomic writes, no overwrite of an existing/recoverable file, no regeneration of a lost key during read, strict bounded parsing.
- Explicit cancellation, one-time operations and 60-second operation expiry. Native temporary plaintext is cleared after its callback. This is best-effort memory clearing, not protection against a compromised process.
- A build-only workflow compiles debug Java without accessing release signing secrets, installing an app, deploying, or moving funds.

## Still required

An isolated debug diagnostic activity now supplies the exact cipher to the system BiometricPrompt, checks that the successful callback returns that cipher, and cancels on backgrounding, dismissal and destruction. It encrypts only a public fixed disposable test pattern and checks its recovery; it never creates wallet keys or addresses. The diagnostic has a different application ID (`com.jamddmaj.ai.walletlab`), disables backup, blocks screenshots, removes production activities/bridges and has no Internet permission. CI checks the merged manifest before uploading a seven-day diagnostic artifact. There is no release bridge, address generation, signing or recovery import in this native component.

Test on a separate instrumented application/device before any release integration:

1. With enrolled strong biometrics, authenticate create/open using disposable bytes and confirm exact round trip.
2. Attempt use without biometric approval, then cancel, background, expire and retry: all must fail and not create an entry.
3. Enroll/remove biometrics and test invalidation; never silently recreate a missing wrapping key.
4. Tamper IV/ciphertext, move data across test wallet IDs, truncate/extend file, interrupt writes: fail without exposing plaintext or replacing existing data.
5. Restart device/app, lock device and repeat; test software-only/emulator keystore rejection.
6. Verify no plaintext in logs, shared preferences, WebView, clipboard, screenshots or Android backup.
7. Implement/test independent encrypted recovery and full device-loss recovery before showing receive addresses.

Passing the Java format tests or CI compilation does not demonstrate hardware security or constitute an audit. A real device and independent security review remain necessary.

Official implementation references:
- https://developer.android.com/privacy-and-security/keystore
- https://developer.android.com/identity/sign-in/biometric-auth
- https://developer.android.com/reference/android/util/AtomicFile
