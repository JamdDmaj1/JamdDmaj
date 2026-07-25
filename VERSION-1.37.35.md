# JamdDmaj AI v1.37.35

- Adds a safe executor heartbeat fallback so the app can show LIVE when Vercel has received the VPS heartbeat even if the private Pro state is stale.
- Makes Pro state refresh requests bypass cache and display a clear private-state error instead of silently staying on UNKNOWN.
