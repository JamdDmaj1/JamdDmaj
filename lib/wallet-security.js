const SOLANA_CHAIN_PREFIX = "solana:";

export function isSolanaChain(chain) {
  return typeof chain === "string" && chain.startsWith(SOLANA_CHAIN_PREFIX);
}

export function sanitizeWalletName(value) {
  const text = String(value || "Wallet").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (text || "Wallet").slice(0, 50);
}

export function getSolanaAccount(accounts) {
  if (!Array.isArray(accounts)) return null;
  return accounts.find((account) => (
    account &&
    typeof account.address === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(account.address) &&
    Array.isArray(account.chains) &&
    account.chains.some(isSolanaChain)
  )) || null;
}

export function getCompatibleSolanaWallets(wallets) {
  if (!Array.isArray(wallets)) return [];
  const compatible = [];
  for (const wallet of wallets) {
    try {
      const features = wallet?.features;
      const chains = wallet?.chains;
      if (!features?.["standard:connect"]?.connect || !Array.isArray(chains) || !chains.some(isSolanaChain)) continue;
      compatible.push({ wallet, name: sanitizeWalletName(wallet.name) });
    } catch {
      // A malformed injected provider must not break the rest of the app.
    }
  }
  return compatible.sort((a, b) => a.name.localeCompare(b.name));
}

export function shortenWalletAddress(address) {
  const value = String(address || "");
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}
