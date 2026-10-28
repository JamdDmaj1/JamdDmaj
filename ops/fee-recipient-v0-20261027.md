# Recipient setup v0 equivalent — 2026-10-27

User reported LENGTH on UI 2026.10.27.5. This confirms a wire size difference, not the actual returned format or instruction change. No signed user bytes were requested or collected.

UI 2026.10.27.6 accepts only the same fixed recipe in legacy (356 bytes) or v0 without lookup tables (358 bytes). v0 is reconstructed with exact 0x80 prefix and zero lookup count, keeping the same signer, writable keys, readonly key set, permissions, blockhash, instruction order/data, fixed compute limit and price. The actual message signature must verify. The original canonical review, freshness, signed mainnet simulation, exact costs/effects and one-attempt send remain mandatory. Arbitrary versions, lookups, appended instructions and changed fees/keys are rejected. Old no-budget legacy remains read-only recovery only.

Primary format source: https://solana.com/docs/core/transactions/versioned-transactions . This compatibility is not proof that Phantom returned v0 in this user's attempt. Rejected messages now disclose only byte count and bounded format label, not signed bytes or signature.

Twenty-eight focused tests passed, including all 120 readonly permutations in each supported current format; independent v0 fixture conversion/signing; freshly re-signed mutations; service submission/recovery and page approval/recovery using mocks. No real funds were moved and bot activation was not attempted. Publication and full-suite results to follow.

## Verified publication

- Source fa17527. Full suite: 1,158 total, 1,139 passed, 19 skipped, zero failures; 223 seconds. Compiled-browser preparation test also passed with mocked Phantom and no signing/submission.
- Confirmed project prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd / jamd-dmaj-s-projects before staging. READY production deployment dpl_HzFyK7vDA45saxk3xir5JNshhPxN (Other framework, five-second build) was verified and promoted without rebuilding.
- Authenticated candidate and public versioned assets matched local: HTML LF-normalized SHA256 756151ff46ca50731e6e0d89236485df2a0cf432c9b78620e7e0921959db7e1e; UI JS e9989af1ffb5d82a1e37ac73e22c1a6ba8cc37483b25e6d96d824a2bdbc9321f.
- Public https://www.jamddmaj.com/fee-recipient-setup.html?v=20261027-6 serves UI 2026.10.27.6. Candidate/public read-only prepare passed canonical validation and unsigned mainnet simulation: network 8,000 lamports, total 1,496,440 lamports, signed false, submitted false. Actual ATA still absent; user approval/completion remains unverified. No real signed simulation or broadcast was initiated by the agent.
- Error log scan returned zero records in the preceding ten minutes. No continuous monitoring added. Bot state unchanged.
