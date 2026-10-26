# Bot swap route preparation error — 2026-10-26

User could verify the exclusive wallet but reviewing 0.08 SOL produced the misleading message “The server could not verify access to this wallet.”

## Read-only diagnosis

- Existing production controls/custody-backup read check: one configured account, zero active accounts, zero swap records and zero pending swaps; verified backup includes swaps. Worker and web services active.
- A standalone diagnostic with NO custody imports, signer, approval or send path reproduced the 0.08 SOL intent from the VPS using the production read transport configuration.
- Account bank verified; zero supported open positions. Builder returned HTTP 200 and a valid 7-instruction Jupiter preparation. The exact-message unsigned simulation returned `InstructionError [6, {Custom:1}]`, with a token-program “insufficient funds” failure inside the routed DEX program `HyaB3…`. No transaction was sent. This does not by itself establish insufficient user wallet funds.
- A subsequent fresh preparation of the same amount chose a different routed program (`Tess…`), passed the full unsigned simulation and all balance/fee/minimum-output checks. Observed fee 19,000 lamports; retained account rent 0. No signature or submission occurred.
- The original exception `WEB_SWAP_SIMULATION_FAILED` fell through the API's generic `controls-unavailable` response, which the browser mislabeled as a wallet-access failure.

## Fix

- The bot's unsigned preparation may obtain at most ONE new quote after the exact `WEB_SWAP_SIMULATION_FAILED` error. The original owner, pause, backup and chain bank are rechecked before that refresh. Both quotes undergo the unchanged full policy/simulation checks. Invalid policy, insufficient balances, transport failure and other errors are not retried.
- No retry was added to confirmation, authorization, custody signing or broadcast. Durable UNKNOWN-before-send handling is unchanged. The user still must explicitly approve the final successful review and its actual minimum/costs.
- Controlled simulation, funding, route, transport, expiry and status exceptions now have distinct public error codes. No raw logs, message bytes, signed transactions or secrets are returned.
- UI no longer describes a generic service failure as lost wallet access. Unverified pending status/network failures tell the user to check the outcome before retrying rather than falsely asserting that nothing was sent.

Focused tests passed 11/11 before the complete regression run. New cases prove exactly two unsigned quote attempts at most, zero signatures/broadcasts during review, no quote retry at confirmation, and correct public error classification. Publication evidence follows after verification.

Official routing reference consulted during diagnosis: https://developers.jup.ag/docs/guides/how-to-build-a-custom-swap-with-metis . No new routing parameters or DEX restrictions were added.

## Publication and verification

- Source fix: `b559a4b`. Complete regression: 1,111 tests, 1,092 passed, 19 skipped, zero failures. Isolated Linux fixture suite: 8/8 passed without production custody or network access.
- Corrected worker installed with SHA-256 `2e0ba4f080a952f70e5bb6ac5bf57e1a96763a10a3f7ef1a79eb59259f51a24c`; previous worker preserved as `worker-before-routefix.mjs`. Worker, web and HTTPS services verified active; health returned HTTP 200. No schema, keys or account settings changed.
- Web deployment `dpl_H2VsPsiw8MbpjywHGbLrbaSBCG16` (`https://jamd-dmaj-fkvgz4us3-jamd-dmaj-s-projects.vercel.app`) reached READY and was promoted to the public domain without rebuilding.
- Public Assets bundle returned HTTP 200 and exactly matched local SHA-256 `ed62c4a0101a33691150720d89e8baa9950673fc6268b51a6840180d199af3b0`.
- Browser regression against `https://www.jamddmaj.com` passed, including mocked route failure followed by a new successful review, inline Assets navigation, provider binding and layout checks. Financial requests in browser regression were mocked.
- No funded transaction was signed or submitted, and no bot was activated. Mainnet verification was preparation/simulation only; external routes can still fail and now receive an accurate error. No Android APK was published for this web correction.
