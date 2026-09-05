const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
  if (bytes.length < 198) throw new Error("The protection policy account is incomplete.");
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
    platformTreasury: encodeBase58(bytes.slice(154, 186)),
    launchFeeLamports: readU64(bytes, 186),
    eligibilityRootFrozen: bytes[194] === 1,
    bump: bytes[195],
    version: readU16(bytes, 196)
  };
}

export async function decodeCreatorVesting(account, expectedAddress = "") {
  const bytes = decodeAccountData(account?.data);
  if (bytes.length < 187) throw new Error("The creator vesting account is incomplete.");
  const expectedDiscriminator = (await sha256(new TextEncoder().encode("account:VestingVault"))).slice(0, 8);
  if (!equalBytes(bytes.slice(0, 8), expectedDiscriminator)) throw new Error("This is not a JamdDmaj VestingVault account.");
  return {
    address: expectedAddress,
    owner: String(account?.owner || ""),
    policy: encodeBase58(bytes.slice(8, 40)),
    beneficiary: encodeBase58(bytes.slice(40, 72)),
    mint: encodeBase58(bytes.slice(72, 104)),
    totalAllocation: readU64(bytes, 104),
    lockedAmount: readU64(bytes, 112),
    releasedAmount: readU64(bytes, 120),
    startAt: Number(readI64(bytes, 128)),
    cliffEndAt: Number(readI64(bytes, 136)),
    releaseEndAt: Number(readI64(bytes, 144)),
    kind: bytes[184]
  };
}

export function decodeToken2022Account(account, expectedAddress = "") {
  const bytes = decodeAccountData(account?.data);
  if (bytes.length < 72) throw new Error("The Token-2022 account is incomplete.");
  return {
    address: expectedAddress,
    owner: String(account?.owner || ""),
    mint: encodeBase58(bytes.slice(0, 32)),
    authority: encodeBase58(bytes.slice(32, 64)),
    amount: readU64(bytes, 64)
  };
}

export function normalizePublicKey(value, label = "address") {
  const address = String(value || "").trim();
  const decoded = decodeBase58(address);
  if (decoded.length !== 32) throw new Error(`Enter a valid Solana ${label} address.`);
  return address;
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
