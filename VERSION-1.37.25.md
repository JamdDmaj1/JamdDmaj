# JamdDmaj AI v1.37.25

- Prevented the Bitget exit manager from using the protected ROE lock to close a position once it has already fallen below 0% ROE.
- Added a VPS log/status note when a negative protected-lock close is skipped, so losses are not hidden behind a "profit protection" message.
- Kept Bitget protection behavior active for profitable positions: the lock can still close only while the trade remains in profit.
