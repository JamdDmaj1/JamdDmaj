# JamdDmaj AI v1.37.41

- Deduplicates repeated executor rejection snapshots so the daily learning report reflects distinct scanner decisions instead of counting the same VPS heartbeat thousands of times.
- Keeps run totals unchanged for operational monitoring and does not modify trading filters, execution, TP/SL, sizing, leverage, or account risk.
- Adds the conventional `npm run build` command for consistent local and automated validation.
