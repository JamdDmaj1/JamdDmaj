# Trade market clarity and sizing

Source 6f125d2: unsupported markets such as LTC now say Chart only, retain a persistent support explanation, and hide unrelated amount/range/preset/quote controls. Supported SOL retains the explicit SOL/USDC quotation flow. No token substitution or new LTC execution support. Watch-only ownership and the separate bot/native signing boundaries remain unchanged.

Wallet display now synchronizes typed USDC sizing with the percentage range without modifying the entered amount, inventing balance, or granting spending authority. Switching back to USDC/SOL selection refreshes sizing from current state. Twenty-seven focused swap/display/unified-account tests passed, including stale evidence and pending reservations; build and diff check passed. Actual browser CSS hides unsupported controls.

Verified correct Vercel team/project; clean committed export. Staged production dpl_A3t4TwUiiQyVjzK12eWNcWED73EP READY (nine-second build); candidate raw modules and compiled Finance bundle equal local build. Promoted unchanged; public exact-asset and browser checks passed for LTC hidden controls and restored SOL form. Bounded error scan zero records. No financial request, signature, changed account setting or funds moved. Web-only hotfix: existing Android APK was not rebuilt in this task.
