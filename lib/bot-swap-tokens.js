// Stablecoins verified on Solana mainnet through Jupiter's token registry.
// BUSD is intentionally absent: it is not a real Solana asset (the symbol is
// used by unrelated tokens), so it must never be offered for a real swap.
export const BOT_SWAP_TOKENS = Object.freeze({
  SOL: Object.freeze({ mint: 'So11111111111111111111111111111111111111112', decimals: 9, label: 'SOL' }),
  USDC: Object.freeze({ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, label: 'USDC' }),
  USDT: Object.freeze({ mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, label: 'USDT' }),
});

const SYMBOLS = Object.keys(BOT_SWAP_TOKENS);

export function botSwapDirections() {
  const list = [];
  for (const from of SYMBOLS) {
    for (const to of SYMBOLS) {
      if (from === to) continue;
      list.push({ value: from + '_TO_' + to, label: from + ' → ' + to, from, to });
    }
  }
  return list;
}

export function parseBotSwapDirection(value) {
  const match = String(value || '').match(/^([A-Z]+)_TO_([A-Z]+)$/);
  if (!match) return null;
  const from = BOT_SWAP_TOKENS[match[1]];
  const to = BOT_SWAP_TOKENS[match[2]];
  if (!from || !to || match[1] === match[2]) return null;
  return { from: match[1], to: match[2], inputMint: from.mint, outputMint: to.mint, decimals: from.decimals, outputDecimals: to.decimals };
}
