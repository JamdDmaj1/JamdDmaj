# Recipient setup v0 equivalent — 2026-10-27

User reported LENGTH on UI 2026.10.27.5. This confirms a wire size difference, not the actual returned format or instruction change. No signed user bytes were requested or collected.

UI 2026.10.27.6 accepts only the same fixed recipe in legacy (356 bytes) or v0 without lookup tables (358 bytes). v0 is reconstructed with exact 0x80 prefix and zero lookup count, keeping the same signer, writable keys, readonly key set, permissions, blockhash, instruction order/data, fixed compute limit and price. The actual message signature must verify. The original canonical review, freshness, signed mainnet simulation, exact costs/effects and one-attempt send remain mandatory. Arbitrary versions, lookups, appended instructions and changed fees/keys are rejected. Old no-budget legacy remains read-only recovery only.

Primary format source: https://solana.com/docs/core/transactions/versioned-transactions . This compatibility is not proof that Phantom returned v0 in this user's attempt. Rejected messages now disclose only byte count and bounded format label, not signed bytes or signature.

Twenty-eight focused tests passed, including all 120 readonly permutations in each supported current format; independent v0 fixture conversion/signing; freshly re-signed mutations; service submission/recovery and page approval/recovery using mocks. No real funds were moved and bot activation was not attempted. Publication and full-suite results to follow.
