# Google-linked Sync ID correction — 2026-10-24

## Deploy result

- URL: https://www.jamddmaj.com
- Target: production; status READY; framework Other.
- Final source: `503e5c3ad30166a5dfcea8aadea0c4c882288cd7`.
- Deployment: `dpl_CHH7ZBaBJDPivRsHHrmkexiGwKg8`.
- Tested candidate: https://jamd-dmaj-a552vhted-jamd-dmaj-s-projects.vercel.app
- Build completed in 10 seconds; promoted unchanged, without rebuilding.
- Two earlier staged candidates were superseded before promotion.

## Findings and change

The browser generates a local recovery code independently of Google. Previously, reopening a saved Google session checked authentication but did not retrieve its linked recovery ID. Google login also claimed protected progress even if the backup request returned false. Initial account creation used an unconditional write after reading, allowing concurrent first logins or malformed reads to replace the canonical record.

Account settings now retrieves the canonical ID through `/api/account-sync`, using the existing authenticated Google-derived session and existing encrypted account record. Server-side identity determines the key; no caller-supplied account selector is accepted. Responses are no-store and unauthenticated requests return 401. Initial linking uses SET NX, reads the winner on conflict and rejects invalid/storage-error records without replacement.

When the linked code differs from local recovery, the UI displays the masked linked ID but retains local data and code. Automatic cloud writes are blocked pending explicit restore, including on an empty device, to avoid overwriting an existing cloud history. Restore requires confirmation. No success claim is made for an unconfirmed backup.

This does not discover an older ID that was never linked to Google, merge separate histories, synchronize financial keys, or change wallet authority. Real account acceptance remains for the user: verify the displayed linked ID matches the one expected in Android. Never ask them to send the full recovery code.

## Verification

- Full regression of the initial correction: 987 tests, 972 passed, 0 failures, 15 skipped.
- Final targeted rerun after failure messaging and empty-device protection: 13/13 passed, including an actual browser exercising Account settings against the real authenticated route handler with isolated fixture storage.
- Tested same-account restore, account isolation, concurrent first logins, malformed storage, missing authentication, account-selection queries, session changes, local-data preservation and cancellation of restore.
- Candidate authentication boundary returned LOGIN_REQUIRED; final source protections present.
- Fresh public browser after promotion: Account settings visible, zero page errors, current correction present, Sync API HTTP 401 without session. An immediate first check saw stale propagation; a subsequent public fetch and browser check confirmed the current source.
- Initial deployment error-log scan returned zero records over the prior ten minutes. No ongoing monitor was created.

No real Google session, Sync ID, encrypted user history or signing keys were read by the agent. No real account mappings were changed during testing. No Android package or VPS deployment was performed.
