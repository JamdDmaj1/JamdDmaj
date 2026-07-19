# JamdDmaj AI v1.37.24

- Changed the Bitget exit manager protection trigger from an internal marker into a real Bitget protective stop-loss attempt.
- Protection now reports `protected on Bitget` only after Bitget accepts the TP/SL protection request.
- Failed protection attempts are reported as `exit manager protection failed` with the Bitget rejection reason.
- New live orders now keep price precision metadata so protection prices are formatted correctly for Bitget.
