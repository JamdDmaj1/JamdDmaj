# Client Bitget Automation Safety

Do not collect customer Bitget API keys in JamdDmaj Vercel, Redis, analytics, support chat, or any shared backend.

Recommended trust model:

1. Each customer creates their own Bitget API key with only the permissions required for futures trading.
2. Each customer runs a private executor or managed connector where the secret stays in their own environment.
3. JamdDmaj can provide signals, education, risk settings, and status UI, but customer keys should not be stored by the JamdDmaj cloud app.
4. The connector should start in dry-run, then small-size live, with explicit real-risk confirmation.
5. Automatic exits must be opt-in and visible: protection trigger, protected lock, reversal close, and daily limits.

Minimum product language for customers:

- JamdDmaj does not guarantee profit.
- API keys should be restricted and revocable.
- The customer remains in control of exchange permissions and trade size.
- The app should show every automatic Bitget entry and every automatic exit reason.

Never build a central key vault until there is professional security review, key encryption design, audit logs, breach response, and legal terms.


## v1.37.6 client connector

The app may help a customer prepare a private connector by generating local .env setup text from their Bitget API key, secret, and passphrase. That text must be pasted only into the customer's private VPS or connector. The JamdDmaj cloud app must not receive, log, back up, or store those exchange secrets.

For production, set JAMDDMAJ_CLIENT_FEED_TOKEN in Vercel if the signal feed should be token-gated. The customer's Bitget keys still stay outside JamdDmaj Cloud.
