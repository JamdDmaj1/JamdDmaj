const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAX_PROTECTED_PARTICIPANTS = 2_000;
const DOMAIN = new TextEncoder().encode("jamddmaj-eligibility-v1");

export async function buildEligibilityTree(policyAddress, records) {
  if (Array.isArray(records) && records.length > MAX_PROTECTED_PARTICIPANTS) {
    throw new RangeError("only the first 2,000 eligible participants are protected");
  }
  const normalized = normalizeRecords(records);
  const policyBytes = decodePublicKey(policyAddress);
  const leaves = await Promise.all(normalized.map((record) => eligibilityLeaf(policyBytes, record)));
  const levels = [leaves];
  while (levels.at(-1).length > 1) {
    const current = levels.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(await hashSortedPair(current[index], current[index + 1] || current[index]));
    }
    levels.push(next);
  }
  const root = levels.at(-1)[0];
  return Object.freeze({
    schema: "jamddmaj-eligibility/v1",
    count: normalized.length,
    root: toHex(root),
    records: Object.freeze(normalized.map((record, index) => Object.freeze({
      ...record,
      leaf: toHex(leaves[index]),
      proof: Object.freeze(buildProof(levels, index).map(toHex))
    })))
  });
}

export async function verifyEligibilityRecord(policyAddress, record, rootHex, proofHex) {
  let node = await eligibilityLeaf(decodePublicKey(policyAddress), normalizeRecord(record));
  for (const sibling of proofHex || []) node = await hashSortedPair(node, fromHex(sibling));
  return toHex(node) === String(rootHex || "").toLowerCase();
}

export function normalizeIdentityCommitment(value) {
  const normalized = String(value || "").toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError("identity commitment must be a 32-byte hash, never raw personal information");
  }
  if (/^0+$/.test(normalized)) throw new TypeError("identity commitment cannot be empty");
  return normalized;
}

function normalizeRecords(records) {
  if (!Array.isArray(records) || records.length === 0) throw new TypeError("at least one eligible participant is required");
  const normalized = records.map(normalizeRecord);
  const identities = new Set();
  for (const record of normalized) {
    if (identities.has(record.identityCommitment)) throw new TypeError("an identity commitment cannot claim more than once");
    identities.add(record.identityCommitment);
  }
  return normalized;
}

function normalizeRecord(record) {
  const identityCommitment = normalizeIdentityCommitment(record?.identityCommitment);
  decodePublicKey(record?.beneficiary);
  const totalAllocation = BigInt(record?.totalAllocation);
  if (totalAllocation <= 0n || totalAllocation > 18_446_744_073_709_551_615n) throw new RangeError("allocation is outside u64");
  return Object.freeze({
    identityCommitment,
    beneficiary: String(record.beneficiary),
    totalAllocation: totalAllocation.toString()
  });
}

async function eligibilityLeaf(policyBytes, record) {
  return sha256(concatBytes(
    DOMAIN,
    policyBytes,
    fromHex(record.identityCommitment),
    decodePublicKey(record.beneficiary),
    u64le(record.totalAllocation)
  ));
}

function buildProof(levels, originalIndex) {
  const proof = [];
  let index = originalIndex;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex];
    proof.push(level[index ^ 1] || level[index]);
    index = Math.floor(index / 2);
  }
  return proof;
}

async function hashSortedPair(left, right) {
  return compareBytes(left, right) <= 0 ? sha256(concatBytes(left, right)) : sha256(concatBytes(right, left));
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is required");
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

function decodePublicKey(value) {
  const text = String(value || "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) throw new TypeError("invalid Solana public key");
  let number = 0n;
  for (const character of text) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) throw new TypeError("invalid Solana public key");
    number = number * 58n + BigInt(index);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  for (const character of text) {
    if (character !== "1") break;
    bytes.push(0);
  }
  bytes.reverse();
  if (bytes.length !== 32) throw new TypeError("Solana public key must decode to 32 bytes");
  return Uint8Array.from(bytes);
}

function u64le(value) {
  let number = BigInt(value);
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(number & 255n);
    number >>= 8n;
  }
  return bytes;
}

function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function compareBytes(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value) {
  const text = String(value || "").toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{64}$/.test(text)) throw new TypeError("expected a 32-byte hexadecimal value");
  return Uint8Array.from(text.match(/../g).map((pair) => Number.parseInt(pair, 16)));
}
