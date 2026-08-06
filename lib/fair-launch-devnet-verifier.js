const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const JAMDDMAJ_LOCK_PROGRAM_ID = "HvbiDNyHotAUYVqK3T2apCW5HEPbvWriK3hrPsPSaLKR";
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const DEVNET_POLICY_FLOORS = Object.freeze({
  minimumLockBps: 8_500,
  protectedParticipants: 2_000,
  cliffSeconds: 730 * 86_400,
  releaseSeconds: 365 * 86_400,
  liquidityLockSeconds: 730 * 86_400,
  governanceDelaySeconds: 2 * 86_400
});

export async function verifyFairLaunchOnDevnet({ mintAddress, policyAddress, fetchImpl = globalThis.fetch } = {}) {
  const mint = normalizePublicKey(mintAddress, "mint");
  const policy = normalizePublicKey(policyAddress, "policy");
  if (typeof fetchImpl !== "function") throw new Error("Devnet verification is unavailable in this browser.");

  const response = await fetchImpl(SOLANA_DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [[mint, policy], { commitment: "confirmed", encoding: "base64" }]
    })
  });
  if (!response?.ok) throw new Error(`Devnet RPC returned HTTP ${response?.status || "error"}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error.message || "Devnet RPC rejected the request."));
  const [mintAccount, policyAccount] = payload?.result?.value || [];
  if (!mintAccount) throw new Error("The Token-2022 mint does not exist on Devnet.");
  if (!policyAccount) throw new Error("The JamdDmaj protection policy does not exist on Devnet.");

  const mintState = decodeToken2022Mint(mintAccount, mint);
  const policyState = await decodeLaunchPolicy(policyAccount, policy);
  const checks = [
    check("cluster", true, "Solana Devnet"),
    check("token-program", mintState.owner === TOKEN_2022_PROGRAM_ID, "Mint owned by Token-2022"),
    check("mint-initialized", mintState.initialized, "Mint initialized"),
    check("mint-authority", !mintState.hasMintAuthority, "Mint authority revoked"),
    check("freeze-authority", !mintState.hasFreezeAuthority, "Freeze authority disabled"),
    check("policy-program", policyState.owner === JAMDDMAJ_LOCK_PROGRAM_ID, "Policy owned by the JamdDmaj lock program"),
    check("policy-mint", policyState.tokenMint === mint, "Policy bound to this mint"),
    check("minimum-lock", policyState.minimumLockBps >= DEVNET_POLICY_FLOORS.minimumLockBps, "At least 85% locked"),
    check("participants", policyState.protectedLimit >= DEVNET_POLICY_FLOORS.protectedParticipants, "At least 2,000 protected eligibility slots"),
    check("cliff", policyState.cliffSeconds >= DEVNET_POLICY_FLOORS.cliffSeconds, "24-month cliff"),
    check("release", policyState.releaseSeconds >= DEVNET_POLICY_FLOORS.releaseSeconds, "Gradual release of at least 12 months"),
    check("liquidity", policyState.liquidityLockSeconds >= DEVNET_POLICY_FLOORS.liquidityLockSeconds, "Liquidity locked at least 24 months"),
    check("timelock", policyState.governanceDelaySeconds >= DEVNET_POLICY_FLOORS.governanceDelaySeconds, "Governance delay enabled")
  ];
  return {
    cluster: "devnet",
    rpcUrl: SOLANA_DEVNET_RPC,
    programId: JAMDDMAJ_LOCK_PROGRAM_ID,
    mintAddress: mint,
    policyAddress: policy,
    verified: checks.every((item) => item.passed),
    checkedAt: new Date().toISOString(),
    checks,
    mint: mintState,
    policy: policyState,
    disclaimer: "Devnet verification is technical evidence, not an audit, legal approval, or promise of value."
  };
}

export function decodeToken2022Mint(account, expectedAddress = "") {
  const bytes = decodeAccountData(account?.data);
  if (bytes.length < 82) throw new Error("The mint account is shorter than the Token-2022 base mint layout.");
  return {
    address: expectedAddress,
    owner: String(account?.owner || ""),
    hasMintAuthority: readU32(bytes, 0) !== 0,
    supply: readU64(bytes, 36).toString(),
    decimals: bytes[44],
    initialized: bytes[45] === 1,
    hasFreezeAuthority: readU32(bytes, 46) !== 0
  };
}

export async function decodeLaunchPolicy(account, expectedAddress = "") {
  const bytes = decodeAccountData(account?.data);
  if (bytes.length < 157) throw new Error("The protection policy account is incomplete.");
  const expectedDiscriminator = (await sha256(new TextEncoder().encode("account:LaunchPolicy"))).slice(0, 8);
  if (!equalBytes(bytes.slice(0, 8), expectedDiscriminator)) throw new Error("This is not a JamdDmaj LaunchPolicy account.");
  return {
    address: expectedAddress,
    owner: String(account?.owner || ""),
    authority: encodeBase58(bytes.slice(8, 40)),
    tokenMint: encodeBase58(bytes.slice(40, 72)),
    eligibilityRootHex: toHex(bytes.slice(72, 104)),
    createdAt: Number(readI64(bytes, 104)),
    protectedLimit: readU32(bytes, 112),
    protectedRegistered: readU32(bytes, 116),
    minimumLockBps: readU16(bytes, 120),
    cliffSeconds: Number(readI64(bytes, 122)),
    releaseSeconds: Number(readI64(bytes, 130)),
    liquidityLockSeconds: Number(readI64(bytes, 138)),
    governanceDelaySeconds: Number(readI64(bytes, 146)),
    bump: bytes[154],
    version: readU16(bytes, 155)
  };
}

export function normalizePublicKey(value, label = "address") {
  const address = String(value || "").trim();
  const decoded = decodeBase58(address);
  if (decoded.length !== 32) throw new Error(`Enter a valid Solana ${label} address.`);
  return address;
}

function check(id, passed, label) {
  return { id, passed: passed === true, label };
}

function decodeAccountData(value) {
  const encoded = Array.isArray(value) ? value[0] : value;
  if (typeof encoded !== "string" || !encoded) throw new Error("Devnet returned invalid account data.");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(encoded, "base64"));
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase58(value) {
  if (!value) return new Uint8Array();
  const digits = [0];
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) return new Uint8Array();
    let carry = index;
    for (let cursor = 0; cursor < digits.length; cursor += 1) {
      carry += digits[cursor] * 58;
      digits[cursor] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let cursor = 0; cursor < value.length - 1 && value[cursor] === "1"; cursor += 1) digits.push(0);
  return Uint8Array.from(digits.reverse());
}

function encodeBase58(bytes) {
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let cursor = 0; cursor < digits.length; cursor += 1) {
      carry += digits[cursor] << 8;
      digits[cursor] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (let cursor = 0; cursor < bytes.length - 1 && bytes[cursor] === 0; cursor += 1) result += "1";
  for (let cursor = digits.length - 1; cursor >= 0; cursor -= 1) result += BASE58_ALPHABET[digits[cursor]];
  return result;
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] + bytes[offset + 1] * 2 ** 8 + bytes[offset + 2] * 2 ** 16 + bytes[offset + 3] * 2 ** 24) >>> 0;
}

function readU64(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

function readI64(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigInt64(0, true);
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure hashing is unavailable in this browser.");
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

function equalBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
