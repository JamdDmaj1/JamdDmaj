# Browser notification body correction

User confirmed receipt but clarified the notification only identified JamdDmaj,
without a useful message. Prior receipt is not proof of correct content.

Inspection showed Firebase's default visible-client branch can forward data-only
messages to an open tab without displaying a system notification. Our client only
attached the foreground callback during explicit enrollment, so another remaining
tab could swallow the body. The old worker also initialized Firebase asynchronously.
This is a code-confirmed gap, not proof of the user's exact OS display setting.

The worker now installs a synchronous, bounded push display handler before Firebase
maintenance listeners, with per-kind titles and the exact validated body. Valid
JamdDmaj messages stop propagation to avoid duplicate or generic displays. Other
messages fall through to Firebase. Click targets remain fixed and same-origin;
no transaction or arbitrary URL is accepted. New worker skips waiting/claims clients
without fetch handlers, offline caches or wallet access. The delayed test text now
explicitly states it is a reception test, not a signal or operation.

Eleven focused tests passed. Discover HTML/JS now asks users to check title and
body, not merely any notification. Discover CSS/tour CSS reviewed, no layout change
necessary. Actual post-fix title/body receipt requires user confirmation.
