// Stablecoins verified on Solana mainnet through Jupiter's token registry.
// BUSD is intentionally absent: it is not a real Solana asset (the symbol is
// used by unrelated tokens), so it must never be offered for a real swap.
export const BOT_SWAP_TOKENS = Object.freeze({
  SOL: Object.freeze({ mint: 'So11111111111111111111111111111111111111112', decimals: 9, label: 'SOL' }),
  USDC: Object.freeze({ mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, label: 'USDC' }),
  USDT: Object.freeze({ mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, label: 'USDT' }),
  CBBTC: Object.freeze({ mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', decimals: 8, label: 'cbBTC' }),
  AVAX: Object.freeze({ mint: 'avaxGHCq3T7hoxd73oY2KY9hJSTaeMibXvHy5KNzh5D', decimals: 9, label: 'AVAX' }),
  JUP: Object.freeze({ mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, label: 'JUP' }),
  RAY: Object.freeze({ mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, label: 'RAY' }),
  JITOSOL: Object.freeze({ mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, label: 'JitoSOL' }),
  BONK: Object.freeze({ mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, label: 'BONK' }),
  PEPE: Object.freeze({ mint: 'PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m', decimals: 4, label: 'PEPE' }),
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
