# JAMD buy-only liquidity fee implementation boundary

User-approved terms: 1% of buys toward new permanently locked liquidity, zero
additional sell/ordinary-transfer fee, no JAMD burn. Existing fixed 100 million
supply and allocation plan remain unchanged. Approval of the design is not
approval to sign or deploy financial transactions.

Implemented exact USDC base-unit planning in `lib/jamd-buy-liquidity-policy.js`,
with checked u64 bounds, downward rounding (never above 1%), zero sell/transfer
fee and explicit non-executable state. Intent records those terms without
turning on any chain gate or claiming a pool exists. Four focused tests pass.
This is partial preparation, not collection or liquidity automation.

Reviewed current official sources on 2026-10-31:
- https://solana.com/docs/tokens/extensions/transfer-fees
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/states/pool.rs
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/utils/token.rs
- https://github.com/raydium-io/raydium-docs-v1/blob/main/products/cpmm/fees.mdx

TransferFeeConfig applies to transfers, not exclusively purchases. Raydium's
OnlyToken0/OnlyToken1 creator-fee modes choose the charged asset, not an exempt
sale direction. Neither alone enforces the approved terms. A simple no-hook
token can be traded in other permissionless pools without our router. Universal
buy-only charging therefore cannot be promised through a website fee.

The existing `jamddmaj-lock` liquidity vault is Devnet-only and time-unlockable;
it is not evidence of a permanent LP lock and must not be relabeled as such.

Next integration depends on a user choice: a disclosed fee limited to purchases
through JamdDmaj, or a dedicated on-chain market design with its compatibility
and routing restrictions reviewed explicitly. The latter must not silently
become a transfer tax or sell restriction. Both still require atomic fee custody,
bounded slippage/reserve funding, pool binding, verifiable permanent LP lock,
failure recovery and independent review before real-fund enablement.

Discover HTML, JS, CSS and tour reviewed. No web code or published availability
changed in this step; no Discover edit warranted. No token, pool, transfer,
fee charge or mainnet deployment performed. No published-version claim.
