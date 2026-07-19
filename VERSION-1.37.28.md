# JamdDmaj AI v1.37.28

- Fixed auto-risk reducing `maxOpen` after positions were already open.
- The VPS now sizes the effective open-position limit from account equity minus reserve and configured per-trade margin, instead of Bitget available margin after existing positions.
- Added extra account-risk fields so the app can explain the effective limit more clearly.
