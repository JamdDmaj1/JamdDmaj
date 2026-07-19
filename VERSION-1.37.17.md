# JamdDmaj AI v1.37.17

- Fixed Bitget Duplicate clientOid rejections by generating a fresh unique clientOid for every order attempt.
- The executor now retries once with a new clientOid if Bitget still reports a duplicate.
- This does not restrict the token universe: the scanner still evaluates any Bitget USDT futures token that passes long or short filters.
- Kept the original signal id separately so tracking, learning, and app diagnostics still work.
