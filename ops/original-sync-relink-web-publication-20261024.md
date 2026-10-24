# Original Sync ID relinking — 2026-10-24

## Deploy result

- URL: https://www.jamddmaj.com
- Production status: READY; framework Other; build duration 8 seconds.
- Source: `6f8509eb79b94ac74058bcdfacb34f5c52e865e9`.
- Deployment: `dpl_oKx4mFVfWLk9uWkaicwBxf13YXi1`.
- Candidate: https://jamd-dmaj-nh8mohf7o-jamd-dmaj-s-projects.vercel.app
- Promoted the tested production candidate unchanged.

## Scope and user acceptance

The existing Google account may have been bound to a different recovery profile than the original Android profile. Merely retrieving that existing association cannot correct the user's intended choice. Account settings now has **Link my original Sync ID / Vincular mi Sync ID original**.

The user must sign in, enter their original recovery code privately in the password field, check explicit consent and confirm the masked old/new suffixes. The client verifies that the selected cloud backup decrypts into the expected backup format without applying it. The authenticated server compares the expected account recovery hash and the exact encrypted-backup fingerprint the client verified. It then atomically preserves the former encrypted account record and snapshots the existing encrypted backups before switching the association. Existing backup keys are never overwritten or deleted. If the former cloud backup does not exist, the archive records its absence rather than inventing data.

Competing or stale changes abort. A retry of an already selected profile is a no-op. The write is rate limited, same-origin checked and accepts only bounded JSON with strict fields. No caller-supplied account identity is trusted.

The actual user's association has NOT been changed by the agent. They must complete the private form in their authenticated session. Do not use or repeat the recovery code they pasted into chat. Do not hardcode it, inspect its cloud backup or create an impersonated session. No code rotation or history merge is implemented; this recovery code remains sensitive. Wallet keys, wallet selection, credits and automation are unaffected.

The web retains local progress until the user separately confirms **Restore progress**. No new Android package or VPS deployment was needed for this web workflow.

## Verification

- Full regression: 993 tests; 977 passed, zero failures, 16 skipped.
- Focused auth, Edge graph and browser verification: 19/19 passed. Final relink-specific browser rerun: 6/6 passed.
- Tested archive contents and unchanged original backup records, another account, stale approval, absent selected backup, changed verified ciphertext, invalid consent, simulated write failure, competing writes and no-op retry.
- Actual browser exercised the real route handler against isolated test storage, verified a genuinely encrypted fixture backup, cancelled with zero writes, then explicitly confirmed one write; linked display changed while the local recovery code remained unchanged and the password field was cleared.
- Candidate private API rejected unauthenticated reads. Fresh public mobile browser found the published form, password field and no page errors; public API returned 401 without Google session. Live authenticated relinking remains the user's acceptance check, not something proven by anonymous smoke tests.
- Public form screenshot inspected locally: `.perps-build/google-sync-relink-publish-20261024/public-form.png`.
- Initial deployment error-log scan: zero records in the preceding ten minutes; no ongoing monitor created.

Atomic scripting behavior was checked against the provider's [Upstash Lua locking documentation](https://upstash.com/docs/redis/features/key-locking). Tests emulate storage for isolation; they do not perform a production relink.
