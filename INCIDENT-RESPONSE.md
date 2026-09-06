# JamdDmaj security incident response

This public policy covers the JamdDmaj application, JAMD credit ledger, Fair Launch
contracts and deployment infrastructure. It does not promise that an unaudited
prototype is safe for Mainnet.

## Private reporting channel

Report vulnerabilities through GitHub private security advisories:
https://github.com/JamdDmaj1/JamdDmaj/security/advisories/new

Never place seed phrases, private keys, access tokens, personal identity documents
or an exploitable proof of concept in a public issue. Include the affected URL,
commit or on-chain address, expected impact and the minimum safe reproduction.

## Initial response and severity

The owner or designated security maintainer must acknowledge a credible report,
preserve evidence and classify it before changing production state.

- Critical: loss or unauthorized movement of funds, mint/upgrade authority compromise,
  arbitrary credit creation, signer bypass or leaked production credentials.
- High: practical account takeover, repeatable payment replay, vesting/liquidity bypass
  or exposure of protected identity data.
- Medium: bounded integrity, availability or privacy impact without a direct asset path.
- Low: defense-in-depth or documentation issue with no demonstrated exploitation.

Critical and high incidents require immediately pausing the affected off-chain action,
credit purchase or launch UI when that can be done without moving user funds. Never
silently rotate an on-chain authority, seize assets or sign a transaction as a response.

## Containment and recovery

1. Record time, reporter, affected commit, addresses, transaction signatures and logs.
2. Disable only the affected server route or feature; keep read-only verification available.
3. Revoke leaked service credentials and inspect access logs. Wallet authorities require
   the reviewed multisig/timelock process and visible signer approval.
4. Reproduce against a local validator or Devnet and create a regression test.
5. Have an independent reviewer approve critical/high remediation before re-enabling it.
6. Reconcile paid transactions idempotently. Never erase a confirmed payment or grant
   duplicate credits to hide an outage.
7. Publish a factual notice after containment without exposing secrets or unpatched details.

## Mainnet rule

No JAMD Mainnet deployment, public sale or real-liquidity action may occur during an
unresolved critical/high incident. Re-enabling requires recorded remediation evidence,
passing tests, a new verifiable build and explicit approval for the exact release.

## Records and exercises

Keep non-secret timelines, decisions, affected versions and corrective actions. Run a
tabletop exercise before Mainnet and after any material change to token payments,
authorities, vesting, eligibility or liquidity. Privileged legal advice and personal
information remain outside the public repository.
