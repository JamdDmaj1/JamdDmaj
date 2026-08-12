# Version 1.37.53

## Verifiable launch fee

- Adds the confirmed JamdDmaj platform fee of 0.1 SOL to the protected launch transaction.
- Binds the fee on-chain to the public treasury `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr`.
- The fee, token creation, 85% creator lock and authority revocation are atomic: either every step succeeds or none takes effect.
- Shows the exact fee and shortened treasury address before the wallet opens.
- Extends the public verifier to confirm the fee amount and treasury recorded in each launch policy.
- Adds matching English and Spanish interface copy and automated policy tests.

This version exercises the fee only with valueless Devnet SOL. Mainnet remains blocked pending an independent audit, legal review and explicit deployment funding approval.
