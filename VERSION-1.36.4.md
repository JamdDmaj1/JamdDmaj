# JamdDmaj AI 1.36.4

Bitget symbol mapping fix.

## What changed

- The VPS executor now prefers `bitgetPair`/`pair` for live symbols instead of the display symbol.
- Contracts like `1000BONKUSDT`, `1000PEPEUSDT`, and similar prefixed futures keep the full Bitget symbol.
- TP1/SL/order sizing now uses `contractMultiplier` so Bitget receives contract-level prices.
- Live mode now rejects with `Bitget contract not found SYMBOL` before placing an order if the contract is missing.

## VPS note

After deploying, download the executor again:

```bash
curl -fsSL https://raw.githubusercontent.com/JamdDmaj1/JamdDmaj/main/scripts/bitget-executor.mjs -o /opt/jamddmaj-scanner/bitget-executor.mjs
chmod +x /opt/jamddmaj-scanner/bitget-executor.mjs
grep -n "bitgetSymbolForSignal\|exchangePrice" /opt/jamddmaj-scanner/bitget-executor.mjs
```
