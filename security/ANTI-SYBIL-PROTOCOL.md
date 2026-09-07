# JAMD eligibility and anti-Sybil protocol

Status: review-ready design; no real participant cohort has been approved or sealed.

## Purpose and boundary

The first 2,000 protected eligibility slots represent independently reviewed
people, not wallets. A wallet address alone is never evidence of a unique
person. The provider must perform a legally permitted uniqueness check outside
JamdDmaj and return only an opaque, random or salted 32-byte commitment.

JamdDmaj must never receive or publish names, identity documents, biometrics,
addresses, dates of birth or the provider's raw verification records. The
provider keeps any required records under its own retention and deletion policy.

## Required provider guarantees

1. One active commitment per verified person for a specific launch policy.
2. A new random salt and domain separation for every launch; commitments cannot
   be correlated across projects.
3. Binding of commitment, launch policy, beneficiary wallet and allocation
   before inclusion in the Merkle tree.
4. Documented sanctions, geography, age and eligibility rules selected only
   after legal review; JamdDmaj does not silently choose them.
5. Signed export containing provider, policy address, record count, root,
   generation timestamp and a digest of the ruleset, without personal data.
6. A correction and appeals window before the root becomes immutable.
7. Independent sampling and reconciliation of count, duplicates and exclusions.

## Safe operating sequence

1. Legal counsel approves the jurisdiction and eligibility rules.
2. The provider verifies people and issues unlinkable commitments.
3. The offline builder rejects empty, duplicate, malformed, over-`u64` and
   greater-than-2,000 inputs.
4. Two reviewers independently rebuild the root from the signed export.
5. The root and manifest hashes are published for a public challenge period.
6. A multisig schedules sealing after the timelock. The root is sealed once.
7. Registration proofs reveal only the commitment, wallet, allocation and proof.

No synthetic or invented participant may be used as production evidence.
