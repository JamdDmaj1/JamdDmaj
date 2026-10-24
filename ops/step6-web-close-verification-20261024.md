# Step 6 follow-up: external-owner web closes

Scope: selected Phantom position -> account-bound full-close review -> explicit
sign-only approval -> durable one-attempt submission -> rooted actual payout ->
separately approved protected USDC conversion or orphan TP/SL cancellation ->
complete daily fee accounting and release of the original shared risk.

**Implementation and unfunded verification completed. Not a production trading
activation or publication.** The October 23 missing-web-close implementation
blocker is addressed in this source change. Production still runs the previous
release with financial execution disabled. Step 7 must install matching server,
relay and browser assets and verify the deployed version; Android release work
is separate. No funded wallet/provider acceptance is claimed.

## Evidence

- Final main regression: 969 cases, 958 passed, zero failed, eleven explicit
  platform/opt-in skips. Log:
  `.perps-build/close-regression-accepted-20261024.log`. The separately added
  external-close persistence-failure case also passed; a refused uncertainty
  write leaves SIGNING held and makes zero transport attempts.
- Full native-close source suite: 83/83 passed, including original custody
  protections. Log: `.perps-build/close-lifecycle-20261024.log`.
- Six targeted external-close/Phantom tests also passed after stricter packet
  bounds and genuine-journal checks were added. All six BTC/ETH/SOL LONG/SHORT
  routes recovered the first leg, actual proceeds, protected conversion where
  required and final fee accounting across a reopened server journal.
- External Phantom orphan cancellation uses the same verified native cleanup
  proof, with a separate owner signature. Its exact attempt is persisted as
  UNCERTAIN before the fake transport, replay fails, and parent risk stays held.
- Separate approval, copied reviews/fake journals, foreign account, missing
  session, foreign origin, extra identity fields, oversized requests, mutated
  signed bytes, expired/hidden/changed sessions and late signatures were tested.
  Lost acknowledgements remain uncertain after restart and cannot be resent.
- Actual Edge, isolated persistent fixture profile: close IndexedDB retained
  the same UNCERTAIN signature across reload, offline mode, wallet-session
  clearing and a fresh browser process. Repeated claim rejected, financial
  requests zero. Test: `real browser close journal ...` in
  `tests/perps-server-close-intent.test.mjs` (opt-in browser module).
- Compiled close panel in isolated headless Edge: zero module errors, zero
  requests on initialization, unchecked consent, disabled confirmation; one
  explicit review request rendered the disabled-execution response without a
  provider prompt or financial request. Generated local check:
  `.perps-build/check-close-browser-20261024.mjs`.
- Real HTTP fixture crosses client/relay/loopback service, authenticates the
  existing opaque Google session and returns disabled execution before any
  builder or signer. No new authentication provider was introduced.
- Linux isolated tests: **12/12 passed**, including six-route close/conversion,
  separate cancellation, browser client/journal, real HTTP, authentication drain
  and single-flight recovery. Unit `jamddmaj-close-fixture-20261024` used
  PrivateNetwork, PrivateTmp, DynamicUser, ProtectSystem=strict, ProtectHome,
  NoNewPrivileges, MemoryMax=384M and CPUQuota=75%. The fixture process cannot
  reach financial services or production wallet directories.
- Updated bundled Linux service CLI: **1/1 passed** in
  `jamddmaj-close-restart-20261024`: SIGTERM drains, new process retains policy,
  SIGKILL leaves a stale lease, and restart refuses that lease without resetting
  any records. Only new temporary fixture stores were opened.
- Browser build and strict browser-import graph passed. Node-only public wallet
  decoding remains separately checked against signing/custody/submission
  dependencies. The older native AI quota VM test now handles all module exports
  rather than failing to parse the existing session-diagnostic export.

## Persistence and operational boundaries

- No new server database/schema, custody wallet or key. Existing backed-up
  close/conversion/cancellation tables in the shared risk journal are reused.
  Unsigned review packets use the existing bounded expiring private review DB,
  verified by readback before release to the browser.
- New close IDs and cancellation IDs are permanently owner-account namespaced.
  Request bodies cannot select an owner, transport, signing key or endpoint.
- A distinct strict-durability browser close journal holds SIGNING/OWNER_SIGNED/
  UNCERTAIN records. Entries and display sizing check these holds. No reset,
  delete, retry, automatic approval or sign-and-send provider capability exists.
- Conversion consumes only the verified actual payout, not the total wallet
  balance. It keeps the originally approved bytes and minimum, independently
  re-simulates, and requires a new approval. Initial close protection is native
  price protection, not an invented absolute minimum payout guarantee.
- Finalized financial proof, all sibling exits and complete daily costs must
  reconcile before server risk is released. Unresolved/failed evidence remains
  held; acknowledgment alone cannot free capital or authorize another send.
- Production worker/web/TLS services were observed active, but not replaced,
  restarted, activated or given new financial authority in this follow-up.
  Only fixture bundles were added under
  `/opt/jamddmaj-perps/checks/close-20261024/`.
- Existing native application source, custody backups, recovery identity and
  real user balances were not modified or inspected. Prior Android 135/135
  Linux validation remains historical evidence, not a newly published APK.

## Publication requirements (step 7)

1. Preserve and verify the existing encrypted recovery/checkpoint before service
   replacement; do not migrate/reset financial tables.
2. Install the matching manual-service bundle and allow only the fixed
   `/api/perps-close` route in the TLS boundary. Keep execution flags false.
3. Publish matching relay and built web assets; check session, policy,
   disabled-review response, UI imports and logs on the exact deployment.
4. Build and verify the Android update separately, retaining install identity
   and application data. No actual funded trade is part of these tests.

Do not interpret this report as “trading is enabled,” “the bot is active,” or
“the public app has been updated.”
