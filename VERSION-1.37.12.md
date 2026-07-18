# JamdDmaj AI v1.37.12

- Fixed the Bitget executor so open server signals remain executable while their monitor window is still active.
- The VPS no longer drops valid OPEN signals only because they are older than the recent-open minute window.
- This helps automatic Bitget entries pick up active Telegram/server calls that still have monitoredUntil/validUntil time remaining.
