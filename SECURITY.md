# JamdDmaj security policy

## Current scope

Fair Launch is limited to simulation and Solana Devnet. Mainnet, real liquidity and public token sales are not approved. JAMD credit recharge uses only valueless Devnet tokens.

## Reporting a vulnerability

Do not publish exploitable details or wallet secrets in a public issue. Use the private GitHub security-advisory feature for this repository. Include the affected commit, impact, reproduction steps and a safe proof of concept. Never include seed phrases, private keys or production credentials. The triage and recovery process is defined in `INCIDENT-RESPONSE.md`.

## Release rule

A Mainnet release is blocked until every item in `security/mainnet-readiness.json` is independently evidenced and marked approved. A verified build proves that deployed bytecode matches the public source; it does not replace a security audit.

## Mandatory external evidence

- Independent smart-contract audit with a public final report and all critical/high findings resolved.
- Legal review for the operator and intended launch jurisdictions.
- Adversarial Devnet rehearsal using the exact release candidate.
- Reproducible/verifiable build tied to an immutable source commit and executable hash.
- Upgrade authority controlled by reviewed multisig/timelock governance, or intentionally removed after audit.
- Published incident-response process and private security contact.
- Explicit owner approval for the exact audited commit and deployment addresses.
