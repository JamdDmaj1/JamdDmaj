# Full close review — diagnostic-only local change

Reported production code controls-unavailable is not a diagnosed root cause.
The HTTP adapter previously folded known close builder/simulation/account/price
failures into its generic fallback. Add exact allowlisted public codes for
eleven existing failure constants. Unknown errors remain generic; no provider
body, wire, signature or private exception text is returned. No retry, signer,
slippage, journal, custody, consent or executor logic changed.

Tests inject each exact stage plus an arbitrary private-text exception through
the authenticated HTTP fixture, asserting one attempt and no execution calls.
This patch alone does NOT fix or prove a real close. Need read-only production
diagnostics / server logs to determine the actual failing stage. Do not restart
or replace the funded worker with previous empty-journal installers.

Internal-only, not published or installed on VPS. Discover HTML/JS/CSS/tour
reviewed: no user-visible functionality change to advertise. Beta integration
remains blocked on a verified official perps integration contract, not on
slippage approval. User's 1% Beta approval and 0.5% JLP protection remain intact.

## Read-only production diagnosis after recovering the existing SSH connection

Existing known host and existing operator SSH identity succeeded. Production
worker/web/HTTPS active. Recent bounded worker/web journals had no error output.
No service restarted and no service source installed. Created only an isolated
root-only diagnostic directory under checks/manual-close-readonly-20261107.
Standalone bundle imports only read-only RPC/account/preparation dependencies;
no vault, journal mutation, executor, signer, send or authenticated user session.
RPC endpoint taken from existing worker configuration inside the diagnostic,
never printed. Read starts paced at 125 ms. The only builder POST allowed by
the diagnostic is the unsigned /v1/positions/decrease endpoint.

Builder returned HTTP 200. Same-wire simulation reproduced
PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH at custody-immutable-bytes. Changed
offsets outside the legacy mutable range: 632..635, 648..651, 896. One intermediate
probe instead failed the existing exact-bank check; no automatic retries/sends.

Independently fetched the confirmed program-owned Anchor IDL account. Its
inflated bytes match the pinned SHA256
1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
Parsed fixed Borsh layout establishes Custody.priceImpactBuffer at 416..931:
openInterest 416..895, lastUpdated 896..903, feeFactor 904..911, exponent
912..915, deltaImbalanceThresholdDecimal beginning 916. Thus the observed
rejection involves dynamic price-impact history/time, not a demonstrated
configuration alteration. This does not yet prove the changes economically
valid or justify ignoring the whole buffer.

Local vault checks now attach bounded stage/byte-offset diagnostics while
retaining the SAME rejection and all invariants. A proper fix still needs an
independent validator for the allowed price-impact-buffer update, attack tests,
fresh read-only simulation and a deployment plan safe with an open position.
Do not blindly exempt bytes 416..903 or use old empty-journal installers.
Current real close remains unresolved. No funds moved.

## Candidate correction — not deployed

Added exact i64[60] ring transition validation: close LONG subtracts size,
close SHORT adds it; only elapsed buckets clear, same-second deltas accumulate,
full-window expiry clears history, timestamp is monotonic and tied to the
reviewed request plus independent current time. Fee config 904+ stays exact.
Independent same-bank live diagnostic confirmed the SHORT transition.
All six asset/direction fixture routes accepted the expected transition and
refused changed fee configuration. Added per-bucket, immutable-byte, size/sign,
overflow, truncation and clock attack tests.

USDC custody also accrues borrow interest in this same close wire. Composed
the existing strict borrow-accrual validator with history validation, masking
only each independently checked range in the other's projection; no byte is
exempt from both. Debt and accrued-interest deltas must remain equal and
monotonic, with exact configuration and clock checks.

This clears the original history and borrow-tail rejection in read-only
production simulation, but exposes a SECOND blocker: vault-book-conservation.
No production guard was bypassed or worker installed. The book-value mismatch
must be independently explained before release. Candidate is not an end-to-end
close fix and must NOT be advertised as working. Several later probes hit
the unchanged exact-bank mismatch gate; mismatched-bank observations are not
accepted as validation evidence. No real trade/close/sign/send occurred.

Regression before composition: 88 tests / 87 pass / 1 skip / 0 fail; new exact
six-route integration test passed; pure history/accrual tests passed. Production
is unchanged. Discover HTML/JS/CSS/tour reviewed, no publication to announce.

Final focused regression after composition: 14 pure/API tests passed; 18
vault/pool/reserve/oracle tests: 17 passed, 1 browser case skipped, 0 failed.
No production release performed. Later public-pool observation probes mostly
hit exact-bank mismatch and cannot justify changing the remaining book equation.
The existing book check is deliberately retained. Need independent protocol
accounting evidence for this second mismatch, not a guessed decimal precision
or unrestricted allowance for accrued-interest credits. Preserve the running
worker and its open-position journal. No service restart or automated action.
