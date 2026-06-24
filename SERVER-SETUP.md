# JamdDmaj v1.31 server setup

## 1. Create private secrets

Run in PowerShell from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-server-secrets.ps1
```

Add both generated values to Vercel Environment Variables:

- `JAMDDMAJ_CRON_SECRET`
- `JAMDDMAJ_ACCOUNT_SECRET`

Add the exact same `JAMDDMAJ_CRON_SECRET` value to GitHub repository Settings, Secrets and variables, Actions.

Redeploy Vercel after changing variables.

## 2. Enable the 24/7 scanner

After deployment, open the private Pro mode on the authorized device. The 24/7 server card will appear below Telegram.

1. Press `Enable 24/7`.
2. Press `Run server now` once to test it.
3. Open GitHub Actions and manually run `JamdDmaj Pro Scanner` once.
4. Manually run `JamdDmaj Pro Watchdog` once and confirm it finishes in green.

The scanner requests a private Vercel cycle about every five minutes. The independent watchdog checks every 15 minutes and attempts a recovery if no recent cycle is found. Both workflows reuse the same `JAMDDMAJ_CRON_SECRET`; no new secret is required. Calls, monitoring results, and paper-trading data are stored in Upstash. Confirmed alerts are sent to the configured Telegram channel.

## 3. Configure Google account linking

Create a Google OAuth 2.0 Web application in Google Cloud Console.

- Authorized JavaScript origin: `https://jamd-dmaj.vercel.app`
- Add `http://localhost:3000` only for local testing.

Copy the Web Client ID into the Vercel variable `GOOGLE_CLIENT_ID`. Keep `JAMDDMAJ_ACCOUNT_SECRET` configured and redeploy.

Google links the existing encrypted JamdDmaj Sync ID. The server stores only an AES-GCM wrapped recovery code, never the plain Sync ID.

## 4. Publish an update users can open from the app

Commit and push normally, then create a version tag:

```powershell
git tag v1.31.0
git push origin v1.31.0
```

The `Publish Signed Android Release` workflow builds `JamdDmaj-AI.apk` with the permanent signing key and attaches it to a GitHub Release. The app checks the stable latest-release URL.

Always increase Android `versionCode` and the app version before publishing another tag.
