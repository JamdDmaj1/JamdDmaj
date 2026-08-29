import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import marketTrendingHandler from "../api/market-trending.js";

const root = new URL("../", import.meta.url);

test("market trending combines sanitized Bitget activity and DEX boost data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.bitget.com")) {
      return Response.json({
        code: "00000",
        data: [
          { symbol: "BTCUSDT", lastPrice: "100000", price24hPcnt: "0.025", turnover24h: "900000000", openInterest: "1000" },
          { symbol: "BAD<script>", lastPrice: "1", price24hPcnt: "9", turnover24h: "10", openInterest: "0" }
        ]
      });
    }
    if (value.endsWith("/token-boosts/top/v1")) {
      return Response.json([{ chainId: "solana", tokenAddress: "So11111111111111111111111111111111111111112", totalAmount: 250 }]);
    }
    if (value.includes("/tokens/v1/solana/")) {
      return Response.json([{
        chainId: "solana",
        pairAddress: "Pair111111111111111111111111111111111111111",
        url: "https://dexscreener.com/solana/pair111",
        baseToken: { address: "So11111111111111111111111111111111111111112", symbol: "HOT", name: "Hot Token" },
        priceUsd: "0.0123",
        priceChange: { h24: 14.5 },
        volume: { h24: 750000 },
        liquidity: { usd: 210000 }
      }]);
    }
    throw new Error(`Unexpected URL ${value}`);
  };

  const response = await marketTrendingHandler(new Request("https://www.jamddmaj.com/api/market-trending"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /s-maxage=120/);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.bitget.map((item) => item.symbol), ["BTCUSDT"]);
  assert.equal(payload.bitget[0].change24h, 2.5);
  assert.equal(payload.dexScreener[0].symbol, "HOT");
  assert.equal(payload.dexScreener[0].liquidityUsd, 210000);
  assert.match(payload.methodology.dexScreener, /promotion, not an endorsement/i);
});

test("market trending rejects unsupported methods", async () => {
  const response = await marketTrendingHandler(new Request("https://www.jamddmaj.com/api/market-trending", { method: "POST" }));
  assert.equal(response.status, 405);
});

test("market trends UI is mobile-ready and translated in every supported language", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /id="marketTrending"/);
  assert.match(html, /@media[\s\S]*?\.market-trending\s*\{\s*grid-template-columns:\s*1fr/);
  const literal = html.match(/const MARKET_TREND_TEXT = (\{[\s\S]*?\});\s*const MARKET_DETAIL_TEXT/)?.[1];
  assert.ok(literal, "market trend locale catalog should be present");
  const catalog = Function(`"use strict"; return (${literal});`)();
  const languages = ["en", "es", "fr", "de", "pt", "it", "ja", "ko", "zh", "ar"];
  const expectedKeys = Object.keys(catalog.en).sort();
  assert.deepEqual(Object.keys(catalog).sort(), languages.sort());
  languages.forEach((language) => assert.deepEqual(Object.keys(catalog[language]).sort(), expectedKeys));
});
