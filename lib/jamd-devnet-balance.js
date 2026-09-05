import { decodeCreatorVesting, decodeToken2022Account, normalizePublicKey, TOKEN_2022_PROGRAM_ID } from "./fair-launch-devnet-verifier.js";

export const JAMD_DEVNET = Object.freeze({
  mint: "5uYzXBoGBrBCPFLqvEzGH8Aab4MNPKKPTcunZa7Q4aWH",
  policy: "BBDS7mfmvGPDDrQdHCpCRfaqNXz9BCKchZH9qfbTd5Aj",
  vesting: "2E73Hoag7z847nQGBzT2rNBuddkSUXZXBbCJXmwjftAY",
  vault: "CnpVehhvVUu78UF5ZQE2XyP8u7tf9VnnzWm1EEMDs4c5",
  program: "BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V",
  decimals: 9
});

export async function readJamdDevnetBalance(owner, fetchImpl = fetch) {
  normalizePublicKey(owner);
  async function rpc(method, params) {
    const response = await fetchImpl("https://api.devnet.solana.com", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("devnet-unavailable");
    const body = await response.json();
    if (body.error || !body.result) throw new Error("devnet-unavailable");
    return body.result.value;
  }
  const [accounts, protection] = await Promise.all([
    rpc("getTokenAccountsByOwner", [owner, { mint: JAMD_DEVNET.mint }, { encoding: "jsonParsed", commitment: "confirmed" }]),
    rpc("getMultipleAccounts", [[JAMD_DEVNET.vesting, JAMD_DEVNET.vault], { encoding: "base64", commitment: "confirmed" }])
  ]);
  let available = 0n;
  for (const item of accounts) {
    const info = item.account?.data?.parsed?.info;
    if (item.account?.owner !== TOKEN_2022_PROGRAM_ID || info?.owner !== owner || info?.mint !== JAMD_DEVNET.mint) throw new Error("invalid-token-account");
    if (!/^\d+$/.test(info.tokenAmount?.amount)) throw new Error("invalid-amount");
    if (info.state === "initialized") available += BigInt(info.tokenAmount.amount);
  }
  const vesting = await decodeCreatorVesting(protection[0], JAMD_DEVNET.vesting);
  const vault = decodeToken2022Account(protection[1], JAMD_DEVNET.vault);
  if (vesting.owner !== JAMD_DEVNET.program || vesting.policy !== JAMD_DEVNET.policy ||
      vesting.mint !== JAMD_DEVNET.mint || vault.owner !== TOKEN_2022_PROGRAM_ID ||
      vault.mint !== JAMD_DEVNET.mint || vault.authority !== JAMD_DEVNET.vesting ||
      vesting.releasedAmount > vesting.lockedAmount || vault.amount < vesting.lockedAmount - vesting.releasedAmount) {
    throw new Error("invalid-protection");
  }
  const entitled = vesting.beneficiary === owner;
  return {
    ok: true, network: "solana:devnet", address: owner,
    mint: JAMD_DEVNET.mint, name: "Jamd", symbol: "JAMD", decimals: 9,
    availableBaseUnits: available.toString(),
    vestingBaseUnits: entitled ? (vesting.lockedAmount - vesting.releasedAmount).toString() : "0",
    cliffEndAt: entitled ? vesting.cliffEndAt : null,
    releaseEndAt: entitled ? vesting.releaseEndAt : null,
    metadataSource: "app-registry", updatedAt: new Date().toISOString()
  };
}
