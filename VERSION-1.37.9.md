# JamdDmaj AI v1.37.9

- Adds app-managed Bitget execution controls for fixed margin, max open trades, orders per cycle, scores, meme/unknown-cap live mode, and exit protection.
- Executor now reconciles real Bitget positions on every live run so manually closed trades no longer keep the VPS blocked as open.
- Client connector feed receives the same execution policy without storing Bitget keys in JamdDmaj Cloud.