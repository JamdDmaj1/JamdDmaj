# JamdDmaj AI 1.32.0

## Pro Signals

- Added a VPS-only Bitget executor script.
- Bitget secrets stay local on the VPS, never in the app, Vercel, or GitHub.
- Execution is off by default.
- Dry-run mode scans and prepares order plans without sending real orders.
- Live mode requires an explicit risk confirmation phrase on the VPS.
- Default live safeguards: one open order, one new order per run, small margin, high score filter, meme tokens blocked.

## Setup

Read `BITGET-LIVE-SETUP.md` before enabling anything live.
