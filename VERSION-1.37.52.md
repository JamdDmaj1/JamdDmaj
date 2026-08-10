# Version 1.37.52

## Fair Launch Devnet protection

- Token creation now requires the JamdDmaj protection program to be executable on Devnet.
- A single atomic transaction creates the Token-2022 mint, locks 85% of the creator allocation in the vesting vault and revokes mint authority.
- The app refuses to create an unprotected token when the program is unavailable.
- Public verification now checks the canonical policy PDA, creator vesting account and actual Token-2022 vault balance.
- The first-participant eligibility root is sealed once after anti-Sybil review; registration stays closed until then.
- English and Spanish Fair Launch messages explain active and pending protections without claiming that design settings are on-chain guarantees.

Mainnet, real payments, public sales and real liquidity remain disabled pending an independent audit and legal review.
