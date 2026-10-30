# Firebase push setup — Android client compiled, delivery not enabled

User-provided Documents/google-services.json validated against Android package
com.jamddmaj.ai and Firebase project jamddmaj-2afc8 (224373038543). Contains only
client config, not a service-account credential. Converted documented generated
resource fields to src/release/res/values/firebase-client.xml with apply_patch.
Public API key is a client identifier; not a server sending credential. Other
isolated preview/devnet identities are not registered to the production project.

Official Firebase Android setup / Google Services generated-resource docs and
FCM receive/server/web docs consulted. BoM 35.1.0 POM verified available in
Google Maven, messaging dependency added. Analytics not included, collection
disabled and messaging automatic initialization disabled by manifest.

MarketPush Capacitor bridge: origin + production identity guard, UI-thread
WebView reads, permission request, registration-token retrieval (never logged),
separate reception-enable acknowledgement, disable/delete-token. No wallet
imports, key access or financial calls. Registration token must only be sent
to an authenticated backend, never in chat or logs.

Data-only FCM receiver is nonexported, requires persisted opt-in and Android
notification permission; accepts bounded price/signal/test messages, fixed
private-visibility channel, click opens MainActivity only. No financial deep
links, automatic execution or incoming caller-provided intent accepted.

Verification: Android compileReleaseJavaWithJavac + processReleaseResources
successful (94 tasks, 1m24). Boundary regression test passed. No phone install,
permission prompt, registration, test delivery or production deployment done.

Still required: user registers web app + public web config/VAPID; secure server
sending credential or workload identity authorized for FCM; authenticated device
subscription/preferences persistence and server price/published-signal worker;
actual opt-in and closed-app receipt test. Firebase client config alone is NOT
functional push delivery. Pending client API/UI wiring awaits real server setup.
Do not claim completion or closed-app delivery, do not enable finance/bot.

Discover HTML/JS/CSS/tour CSS reviewed: internal disabled client integration does
not alter public availability; existing explicit open-app-only copy retained.
Private Firebase Admin SDK filename patterns added to gitignore preemptively.

Web client provisioned by user: app ID 1:224373038543:web:7bab7d90aa392e3274c6ba.
User-supplied public VAPID validates as 65-byte uncompressed P-256 point. Public
client config shares the project key from provided Android config; Analytics
measurement ID deliberately omitted. Firebase JS 13.1.0 pinned from npm, actual
installed Messaging register/onRegistered/unregister FID APIs verified.

Web transport now exports explicit-permission registration/FID, disposal and
unregistration. No eager initialization or subscription, no local UI claims of
push activation. Same-origin HTTPS allowlist, bundled Firebase service worker,
bounded data-only messages, fixed safe notification click destination, no offline
wallet cache. Worker response configured no-store and root allowed scope.
Build passes; public config and payload/worker regressions added. No production
worker registration, FID retrieval, real delivery, server credentials or backend
enrollment available yet. Need authenticated subscription API + delivery worker
before exposing activation. Existing local notifications remain open-app only.
