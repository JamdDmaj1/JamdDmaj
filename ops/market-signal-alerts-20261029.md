# Market / published signal alerts — local, publication pending

Markets (main and Finance) now offers up to 20 device-local one-shot catalog
coin USD price alerts, above/below inclusive threshold, deletion and status.
Finance Profile → existing Notifications card now includes opt-in newly published
Telegram open-signal notices. Uses existing authorized /api/pro action:status;
does not poll Telegram directly, bypass service authorization, activate bot or
submit orders. Baseline is enable time, persistent seen IDs prevent replays.

30-second checks only while document initially visible. Browser notifications
request permission on explicit button only; unavailable/native WebView falls
back to in-app toast. No closed-app/background push implemented or promised.
Preferences per-device/origin, not synchronized account settings. WebView and
browser storage may differ. Price source is token-prices; not execution quotes.
Only catalog coins supported; arbitrary DEX mint alerts not implemented.

Browser mocked prices/signals/Notification class verified threshold, one-shot,
dedup, deletion and restricted read requests (GET quotes / POST status only).
No OS prompts, real notifications, user session or financial actions used.
Threshold unit tests, bilingual Finance navigation, module graph build and
automation signal filtering tests checked. Main tour + Discover ES/EN copy
aligned; Discover HTML/CSS/tour CSS reviewed, structure unchanged.
