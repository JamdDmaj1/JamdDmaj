# JamdDmaj AI v1.37.34

- Adds visible VPS heartbeat diagnostics so scanner logs show when Vercel rejects or misses executor status updates.
- Keeps the app/VPS heartbeat debugging simple: failures now show the HTTP status instead of silently leaving the app on UNKNOWN.
