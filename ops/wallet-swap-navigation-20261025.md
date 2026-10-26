# Wallet Swap navigation and identity correction

The user clarified that the requested swap is for the server-custodied bot wallet `3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T`, not the separate Android wallet. Their screenshots show that same address linked as watch-only. Public linking is not a signing capability.

Confirmed UI cause: `wallet-overview.js` directly clicked `tab-trade` for every Swap action, irrespective of wallet source. Native background refresh also respected external selection but could replace a watch selection with the unrelated native account.

Source corrections:

- Swap no longer navigates to Trade. Native selection dispatches the existing secure native-swap navigation action.
- Watch selection stays in Assets and reports that server custody review/signing is required; it never opens the unrelated Android wallet or invents signing authority.
- External/no selection likewise cannot silently launch the native account.
- Background native refresh respects a selected watch account. Explicit user selection of native remains supported.
- No automatic transfers or shared balances across separate addresses were introduced.

Verification: 13 focused navigation/identity tests passed, web build passed (31 assets). No publication, APK, signatures, financial operations or server configuration changes.

**Unfinished requested functionality:** actual owner-reviewed SOL→USDC swapping of the bot wallet from Assets. The existing server conversion path is limited to verified post-close proceeds and cannot safely be repurposed for an arbitrary bot balance. Completing it requires an authenticated manual custody-swap prepare/review/confirm/recover path, shared pending-operation/risk exclusion and UI integration. Do not describe this navigation correction as a working bot-wallet swap. Converted proceeds would remain in the bot wallet; using that custodial account for manual Trade/Futures also needs a supported signing path, not merely a public balance link.
