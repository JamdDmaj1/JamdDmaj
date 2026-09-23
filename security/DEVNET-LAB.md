# Native devnet lab — not production

Separate application ID: `com.jamddmaj.ai.walletlab.devnet`. Android 11+ and hardware-enforced strong biometrics required. Never install as a replacement for the production app. No Bitget changes or production signing secrets.

The native flow generates a disposable random Ed25519 seed, exports an authenticated encrypted file through Android's file picker, then requires reopening and decrypting that file before storing the recovered seed in the biometric hardware-backed vault. The backup password needs at least 16 characters. File and password must be kept separately. This custom test format is not a standard seed phrase.

The sole network endpoint is Solana devnet over HTTPS, with genesis verification. Native SOL only, maximum 0.1 test SOL per manually reviewed transfer. Simulation, fresh fee and balance checks, biometric signing and durable pre-broadcast journaling precede submission. Uncertain submissions cannot be automatically retried. App backgrounding cancels authorization; it cannot undo a transaction already sent.

Validation: pure Java RFC8032 key/signature vectors, backup recovery and wrong-password/tamper rejection, exact amount checks, and byte-for-byte transaction comparison against Solana Kit. CI compiles the APK and checks merged manifest isolation. These do not replace real-device recovery, lifecycle and onchain confirmation tests. Public devnet faucet previously returned HTTP 429; no successful onchain transfer is claimed.

Remaining acceptance on a real device: save and reopen backup; recover with fingerprint; restart and read the same public address; use devnet-only faucet tokens; review and confirm a small test transfer; check confirmation after restarting. Never fund public test vectors or use real money. Production wallets and multichain support remain out of scope for this lab.
