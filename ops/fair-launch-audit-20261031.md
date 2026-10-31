# Fair Launch baseline review

Scope: complete the user-facing launch flow without representing documentary
requirements or unverified deployments as production readiness.

Baseline: 23 Fair Launch on-chain/readiness tests passed. The readiness evaluator
reports one of seven documentary requirements complete. Missing: independent
audit, legal review, Devnet adversarial rehearsal evidence, independently
verifiable build, upgrade-authority multisig/timelock and final owner approval.
No missing requirement has been approved or bypassed.

Implemented first correction: transaction result/error remains visible after
controls are refreshed; repeated creation/liquidity calls are blocked while a
request is running. This does not deploy a program or send a transaction.

The protection program's live Devnet availability must be checked separately;
repository documentation is not evidence of deployment. Real liquidity, Mainnet
and payments remain outside this unverified state.

Live read 2026-10-31: FzH2QN9NFFrpwsn8xqLT83BZ7ruqmMBiwY4CU6MkLVQ4 is
executable on Devnet. Existing adversarial scripts rejected four liquidity and
five vesting attacks via simulation, with zero signed/submitted transactions.
These are internal rehearsals, not an independent audit or Mainnet approval.

Added exact reviewed-message comparison and fee-payer Ed25519 verification
before submission, recovery of public signatures saved before RPC send,
confirmation checks and duplicate-entry blocking across reloads. Wallets must
support separate signTransaction so the reviewed bytes can be checked before
send; sign-and-send-only is no longer accepted for protected creation.
Read-only recovery does not sign, resend or clear uncertain outcomes.
Manifest deployment status is now requires-live-verification rather than an
incorrect static not-deployed claim. Recovery metadata contains no private keys.

Remaining work includes full UI/reload verification, confirmation/preflight
recovery edge cases, cost review and alignment of customizable design settings
with the deployed fixed Devnet policy; production evidence and external reviews
are still incomplete. This work is not declared 100% complete or published.

Mobile-sized real Edge/actual HTML verification passed: module loads without page
errors, a persisted pending signature survives inspection, creation stays blocked,
and recovery performs only status reads (no signing/submission). Focused tests:
98 passed before the additional Ed25519 signature test; five focused recovery and
status tests then passed. Discover HTML/JS updated for the same pending release;
Discover CSS/tour CSS reviewed without unrelated style changes.

Technical references reviewed: Solana RPC sendTransaction and getSignatureStatuses
documentation. RPC acceptance alone is not network confirmation.

Full baseline after recovery changes: 1,225 passed, 19 skipped, zero failures.
Subsequent fixed-policy validation and signature tests: 77 focused tests passed;
web build and mobile DOM recovery check passed again. No real wallet was connected
and no creation, signature, fee payment or deployment was performed by the agent.

## Cost review and end-to-end rehearsal

Prepared 1.38.14: a fresh simulation supplies payer pre/post balances and network
fee. The review separates the 0.1 test-SOL platform fee, network/priority fee and
account reserves; explicit consent is required before wallet signing, with a
45-second lifetime including time in the wallet. A bounded compute budget is
included before simulation to prevent wallet-side unreviewed fee rewriting.

Live Devnet simulation, without wallet approval or broadcast, passed:
100,000,000 platform + 10,600 network + 8,595,360 account-reserve lamports =
108,605,960 lamports estimated debit. This is a fixture-specific estimate, not a
fixed price or a mainnet quote. No funds moved.

Real browser/actual HTML tested the full pipeline using disposable fixture keys
and intercepted RPC only: consent, SDK signature, one mocked send, pending state,
reload, read-only confirmation and persisted local receipt. Separate cases
passed cancellation before signing, changed-message rejection, storage failure
before send and uncertain-send recovery. An unavailable/missing signature alone
never clears an intent. Expiry also requires finalized block-height expiry and
absence of the unique mint. Terminal receipts are saved before pending removal.

Public readiness endpoint returns only redacted requirement IDs/status, not
legal/approval references. UI explicitly labels this documentary, not an audit.
Discover HTML/JS and README updated; styles reviewed for mobile cost-dialog QA.
Independent audit, legal approval, governance evidence and production launch
remain incomplete. Publication receipts follow verified deployment only.

Final pre-publication checks: full suite 1,237 passed, 19 skipped, no failures;
17 focused latest checks passed after cross-tab exclusion was added. Android
release Java/resources compiled successfully. All three browser rehearsals
passed again after the final build. No financial transaction was sent.

## Verified publication receipts

Web source 37dc24a51000e0d5a1068244cd8f66a42301d20a was staged, checked and
promoted to https://www.jamddmaj.com (deployment dpl_7LeJBgr5uPGAF6S6kC9bkGNnW9ua).
Discover and the redacted readiness API were checked after promotion.
Android release v1.38.14 is public, not a draft, with JamdDmaj-AI.apk;
workflow 41236490915 passed launcher, native-wallet, SDK and release checks.
Downloaded APK SHA256:
b98034a97fdaee7248065a469997d62da1d15de79cdb01091cf21599584945a7.
Package com.jamddmaj.ai, versionCode 170; usual signing certificate verified.
Physical-phone acceptance is not yet verified. Install over the existing app;
do not uninstall or clear its data. Publication does not enable mainnet.

Post-release preparation adds an offline signed-provider-export verifier and a
mocked confirmed-liquidity pipeline test. These are not advertised as deployed UI
features. The user confirmed no provider or reviewed participant list exists.
No real identities were collected and no eligibility root was approved or sealed.

## Verification scope correction

The mint/policy verifier checks the configured liquidity lock duration, not the
existence, economic value or custody of a real pool's LP receipts. Its structured
result now explicitly reports liquidityCustodyVerified=false and
participantUniquenessVerified=false even when all account checks pass. Sealing a
root is not independent proof of human uniqueness. Mainnet authorization remains
false. This internal result clarification is not yet a new deployed UI release.
Discover HTML/JS/CSS and tour CSS reviewed: no public content change is appropriate
for this internal-only clarification; current public mainnet restrictions remain.

## Completion audit after e5b2738

Current focused run: 35 passed, zero failures (transaction, costs, creation flow,
provider export, on-chain model/verifier, readiness and status tests). These tests
use intercepted RPC for submission paths, not real financial transactions.

| Requirement | Authoritative evidence | Remaining boundary |
| --- | --- | --- |
| Review before signing | Cost and creation-flow tests, explicit expiring consent | Physical wallet acceptance not independently observed |
| Safe interrupted operation | Transaction tests: journal, status read, expiry, no resend | Not a guarantee against every RPC outage |
| Creator protection | Canonical accounts, vesting/vault checks and model tests | Independent source/build audit missing |
| Liquidity protection | Mock-LP instruction tests and simulated attack rehearsals | Real pool integration/custody not certified |
| Participant eligibility | Signed export verification and Merkle tests | No selected provider, reviewed cohort or sealed approved root |
| Mainnet readiness | security/mainnet-readiness.json | Six requirements missing; mainnetEnabled=false |
| Publication | Web deployment and Android release receipts above | Post-release internal additions not deployed as new UI |

Required outside decisions/evidence: select a legally reviewed uniqueness provider
or supply an independently reviewed cohort; commission an independent security
audit and reproducible-build verification; approve governance signers/timelock;
provide final owner approval only after remaining evidence exists. None can be
replaced by a passing unit test or an agent's own approval. Do not collect raw
identity documents in chat, mark these gates approved, or request deposits.

Overall completion remains unproven. No mainnet activation or transaction is
authorized by this audit. Further approval-gate work needs external evidence;
cosmetic changes would not resolve these blockers.
