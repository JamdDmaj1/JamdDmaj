# Receipt alerts and customer onboarding — 2026-10-26

## Requested and delivered scope

Optional Profile → Notifications for linked Solana wallets, initially off and stored only on this device. In-app alerts and recent in-memory receipt list; optional browser Notification permission only after an explicit button click, hiding amounts in OS notification bodies. No key/session sharing or transaction authority. No background push, new Android APK, server subscription or promise of closed-app delivery.

The browser checks linked public wallet addresses in turn every 20 seconds while open/visible. It verifies mainnet genesis, finalized successful signatures and parsed incoming System/classic/Token-2022 Transfer/TransferChecked instructions against observed account deltas. Wallet-signed activity is excluded, so own swaps are not described as deposits. Failed/unfinalized operations, price changes and unrelated balances cannot produce receipts. Token symbol metadata is not trusted; unknown assets use abbreviated mint identity and a spam/value warning.

Bounded recent coverage: one wallet per cycle, wallet plus up to four rotating token accounts, eight signatures per scanned address and eight recent transaction lookups per cycle. A maximum 24-hour lookback and 500 persisted receipt IDs bound device state; busy accounts can have partial/delayed coverage, explicitly disclosed. This is not a complete historical indexer. Disabling/unlinking while a query is in flight suppresses its notifications. RPC failure is shown as unavailable, not zero funds.

Read-only live diagnosis found PublicNode blocks `getTokenAccountsByOwner` with HTTP 403. Fixed method-specific official mainnet primary for that read, with two fixed public read endpoints for fallback. A read-only live bot-wallet probe succeeded through official token-account lookup and PublicNode finalized history; zero new receipt events at the probe's current-time cutoff. No signer, custody imports or send calls in the reader.

## Findings from customer screenshots

- SOL/USDC is an explicit restriction in `web-swap-policy`/evidence checks, not just a missing dropdown option. Arbitrary-token swap support remains **unimplemented**; this release only states the restriction clearly. No validation was weakened to expose unsupported tokens.
- Fresh/private browser does not detect a compatible extension. Google login does not install/enable Phantom, and connecting Phantom does not itself require Google. Added explicit incognito-extension guidance, clear onboarding steps, and an in-place reconnect action in the external swap panel.
- A new Google account with no exclusive custody mapping correctly has no bot wallet. Added actionable limits/consent/provisioning guidance, not a fabricated wallet or balance.
- Read-only VPS `ExecStart` confirms `--controls --custody-setup --bot-swaps` without `--platform-fees`; runtime explicitly blocks activation for that combination. More than 10 USDC does not cure this production-service gate. No service flags or server state were changed.
- Frontend now distinguishes explicit execution rejection from an uncertain lost activation acknowledgement; missing fee service from the authenticated status response disables activation review and explains that server setup—not another deposit—is required. It preserves controls/funds on explicit rejection. Unknown responses remain unconfirmed and are not retried automatically.

## Verification

Focused existing Assets, terminal, controls and new receipt tests pass. Browser regressions exercise fresh browser extension guidance, Profile opt-in, a synthetic finalized incoming receipt, disable, no automatic permission/sign/send, and mobile layout. Existing inline swap/send mocked flow also passes. No real funds moved, no bot activation, no custody changes.

Official references: https://solana.com/docs/rpc/http/gettransaction , https://solana.com/docs/rpc/json-structures , https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API .

## Published web release

Application source `c996e8b`; browser fixture interception correction `3c57183` does not change deployed application code. Target verified as `jamd-dmaj-s-projects/jamd-dmaj`, project `prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd`.

Staged production `dpl_bRNyGYfhTq8BARKKmbmLqrJpQPjE`, `https://jamd-dmaj-n9qg6umus-jamd-dmaj-s-projects.vercel.app`, reached READY and was promoted without rebuilding. Authenticated candidate checks matched local build (LF-normalized for copied source modules):

- Assets bundle: `a9a73c27f5da2a888d25170dcd1dc4f8c56f12407930fbb03aa2909180dfec8d`
- Terminal layout: `95d5d0052e04e96ffd72d6cd377ae7609e0e529dcb9ff6784e705f22e3351ed1`
- Read-only receipt reader: `421686a34635c6e5aca05ff24b21ed7ae6ba9d4d23e46e1f628586b0d3c50970`
- Notification controller: `1abac509f108373ed0bee7460f1eb083d90a24d9a47bc01f158d1d64943b45de`
- Bot controls UI: `c0f9c48b9ddc2e89ea1924ae99ac592970e334988fc50ffb459203fc59f2466f`

Focused suite: 28 passed, zero failures. Both built browser regressions passed locally and against public `https://www.jamddmaj.com` after promotion. Synthetic notifications intercepted both public RPC providers; no real deposits, signatures, send calls or permission prompts. Vercel error query over the preceding ten minutes returned zero records. No VPS deployment, production activation or Android APK publication in this change. Arbitrary-token swap validation and production bot fee-service enablement remain explicitly pending.
