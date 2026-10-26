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
