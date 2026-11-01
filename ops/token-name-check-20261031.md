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

## Publication verification

Version 1.38.17, source `74052f5`, staged in production deployment
`dpl_7xTczTvEvUqZQqS7RbBzCE42gdY8`. Authenticated candidate checks passed for
HTML, bundle, Discover, status and live API query (26 indexed SOL matches).
The candidate was promoted only after these checks. Full `test:ci` exits 0:
1306 tests, 1287 passed, 19 skipped, zero failures. No user transaction signed.

Android 1.38.16 release did not publish: job 124729638238 exited 22 in the native
crypto/encoding step containing a Maven download; no JUnit files were produced.
This does not establish a cryptographic assertion failure. The same dependency
URL currently returns HTTP 200. The changed 1.38.17 source has its own release
run https://github.com/JamdDmaj1/JamdDmaj/actions/runs/41267866723 and remains
unpublished until its non-draft APK and signature are verified. Do not advertise
either pending/failed Android release as available.
