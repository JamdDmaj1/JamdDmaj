# JamdDmaj AI v1.37.22

- Fixed the Bitget open-position limit from the app so `Max open on Bitget` is honored by the VPS executor.
- The executor now accepts both `maxOpen` and `maxLiveOpen`, preventing mismatches between the app, server config, and VPS.
- Raised `Orders per cycle` from 5 to 10 in the app and executor.
- Auto-risk still caps orders per cycle to the allowed open-position limit, so a higher cycle value cannot exceed the live max-open safety limit.
