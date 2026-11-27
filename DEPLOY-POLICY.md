# Release and Vercel deployment policy

JamdDmaj runs on Vercel Pro, which allows **6,000 deployments per day**.
The repository still enforces a conservative internal budget of **50 production
deployments per UTC day** so one-fix-per-deploy churn cannot run uncontrolled.

Rapid one-fix-per-deploy iterations waste build time and review quality. Use one
release for all fixes even though the Vercel plan has much more headroom.

## Mandatory flow

1. Commit every fix. Do not deploy from a dirty tree.
2. Bump the version once for the whole batch.
3. Run the gate in dry-run:
   `npm run release:prod -- --dry-run`
4. If it passes, release the whole batch once:
   `npm run release:prod -- --confirm`
5. The gate refuses versions already live and enforces **max 50 production
   deploys per UTC day** in `.deploy-ledger.json`.

## Rules

- Group fixes: do not deploy after each small change.
- Preview deployments also consume the daily budget; avoid them unless needed.
- Keep runtime configuration (risk limits, executor tokens, feature flags) on
  the VPS or Redis, so it does not require a web deployment.
- Never create extra Vercel accounts or projects to evade the limit.
- If the limit is exhausted, wait for the UTC reset or upgrade the plan; do not
  claim a release shipped when `/api/status` still shows the old version.
- After every web release, review `discover.html` as required by AGENTS.md.
