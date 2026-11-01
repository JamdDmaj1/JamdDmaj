# Duplicate-name checks in token creation

Implemented read-only bounded name/symbol lookup through DEX Screener and Jupiter
Tokens V2, including canonical Solana mint validation, case/accent/spacing and
Unicode compatibility normalization, deduplication by mint and capped results.
No wallet address, secret, signature or transaction is sent to search services.
The optional existing server Jupiter credential is sent only to its fixed HTTPS
endpoint with redirects disabled, never to the browser or other provider.

The form exposes a check before connecting a wallet, automatically checks before
review and checks again before approval. Indexed name OR symbol matches block
issuance in this UI. Total source failure blocks, not a false availability result.
Confirmed local receipts supply additional duplicate evidence. A name/symbol
change invalidates checks and transaction review; stale async results are rejected.

This is not a global registry, on-chain name reservation or ownership/verification
claim. Indexes have bounded coverage and indexing delay; concurrent creations,
unindexed mints and all visual homoglyphs cannot be ruled out. The mint address
remains the unique token identifier. No token or pool was created during tests.

Five unit/API tests pass; browser rehearsal checks service failure and duplicate
blocking before any wallet signature or chain simulation, then the existing
review/consent/reload/recovery path. Live read-only queries returned duplicate
results for SOL and no indexed match for the proposed JAMD identity; neither
result guarantees exclusivity or reserves a name.

Discover HTML adds the same limited-coverage description. JS/CSS/tour reviewed:
no navigation/style changes needed. No site availability claim until publication
is verified separately.

Primary references:
- https://solana.com/docs/tokens/basics/create-mint
- https://developers.jup.ag/docs/tokens/index
