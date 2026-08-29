import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import marketAssetHandler, { analyzeTrend } from "../api/market-asset.js";

const root = new URL("../", import.meta.url);

test("market asset combines candles, metrics, transparent trend and recent news", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/market/candles")) {
      const rows = Array.from({ length: 60 }, (_, index) => {
        const open = 100 + index;
        return [String(1700000000000 + index * 3600000), String(open), String(open + 2), String(open - 1), String(open + 1), "1000", "150000"];
      });
      return Response.json({ code: "00000", data: rows.reverse() });
    }
    if (value.includes("/market/tickers")) {
      return Response.json({ code: "00000", data: [{ lastPrice: "160", price24hPcnt: "0.04", highPrice24h: "165", lowPrice24h: "150", turnover24h: "9000000", openInterest: "500000", fundingRate: "0.0001" }] });
    }
    if (value.includes("api.coingecko.com")) {
      return Response.json({
        name: "Bitcoin",
        market_cap_rank: 1,
        image: { small: "https://assets.coingecko.com/btc.png" },
        categories: ["Layer 1"],
        last_updated: "2026-08-29T12:00:00Z",
        market_data: {
          market_cap: { usd: 3000000000000 }, total_volume: { usd: 50000000000 }, circulating_supply: 20000000,
          fully_diluted_valuation: { usd: 3100000000000 }, ath: { usd: 170000 }, ath_change_percentage: { usd: -5 },
          price_change_percentage_24h: 4, price_change_percentage_7d: 8, price_change_percentage_30d: 12
        }
      });
    }
    if (value.includes("gdeltproject.org")) {
      return Response.json({ articles: [{ title: "Bitcoin market update", url: "https://example.com/bitcoin", domain: "example.com", seendate: "20260829T120000Z", language: "English" }] });
    }
    throw new Error(`Unexpected URL ${value}`);
  };

  const response = await marketAssetHandler(new Request("https://www.jamddmaj.com/api/market-asset?symbol=BTC&coinId=bitcoin&name=Bitcoin&timeframe=1h"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.asset.name, "Bitcoin");
  assert.equal(payload.candles.length, 60);
  assert.equal(payload.candles[0].time < payload.candles.at(-1).time, true);
  assert.equal(payload.metrics.marketCapRank, 1);
  assert.equal(payload.ticker.high24h, 165);
  assert.equal(payload.ticker.low24h, 150);
  assert.equal(payload.news[0].domain, "example.com");
  assert.equal(payload.trend.direction, "bullish");
  assert.ok(payload.trend.confidence <= 82);
  assert.match(payload.sources.chart, /Bitget/);
});

test("market asset rejects unsafe or incomplete identifiers", async () => {
  const response = await marketAssetHandler(new Request("https://www.jamddmaj.com/api/market-asset?symbol=%3Cscript%3E&coinId=../bad"));
  assert.equal(response.status, 400);
});

test("every DEX trend opens an internal detail with real pool candles and metrics", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.dexscreener.com/latest/dex/pairs")) {
      return Response.json({ pairs: [{
        baseToken: { address: "Token1111111111111111111111111111111111111", name: "Internal Token" },
        priceUsd: "0.25", priceChange: { h24: 12.5 }, volume: { h24: 750000 }, liquidity: { usd: 210000 },
        marketCap: 2500000, fdv: 3000000, txns: { h24: { buys: 400, sells: 300 } }, pairCreatedAt: 1700000000000,
        info: { imageUrl: "https://assets.example.com/token.png" }
      }] });
    }
    if (value.includes("api.geckoterminal.com")) {
      const now = Math.floor(Date.now() / 1000);
      const rows = Array.from({ length: 60 }, (_, index) => [now - (59 - index) * 3600, 0.1 + index / 1000, 0.11 + index / 1000, 0.09 + index / 1000, 0.105 + index / 1000, 1000 + index]);
      return Response.json({ data: { attributes: { ohlcv_list: rows.reverse() } } });
    }
    if (value.includes("gdeltproject.org")) return Response.json({ articles: [] });
    throw new Error(`Unexpected URL ${value}`);
  };
  const url = "https://www.jamddmaj.com/api/market-asset?source=dex&symbol=INT&name=Internal%20Token&chainId=solana&tokenAddress=Token1111111111111111111111111111111111111&pairAddress=Pair11111111111111111111111111111111111111&timeframe=1h";
  const response = await marketAssetHandler(new Request(url));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.asset.source, "dex");
  assert.equal(payload.candles.length, 60);
  assert.equal(payload.metrics.liquidityUsd, 210000);
  assert.equal(payload.metrics.transactions24h, 700);
  assert.match(payload.sources.chart, /GeckoTerminal/);
});

test("trend analysis reports uncertainty instead of inventing a prediction", () => {
  assert.equal(analyzeTrend([{ close: 1 }]).direction, "insufficient");
  const mixed = analyzeTrend(Array.from({ length: 60 }, (_, index) => ({ close: 100 + Math.sin(index) })));
  assert.ok(["mixed", "bullish", "bearish"].includes(mixed.direction));
  assert.ok(mixed.confidence >= 25 && mixed.confidence <= 82);
});

test("asset research UI is internal, mobile-safe and translated in every supported language", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /id="marketDetailView"/);
  assert.match(html, /id="assetChart"/);
  assert.match(html, /MARKET_TREND_API_URL/);
  assert.doesNotMatch(html, /fetch\("\/api\/market-trending"/);
  assert.match(html, /@media \(max-width: 500px\)[\s\S]*?\.asset-detail-grid\s*\{\s*grid-template-columns:\s*1fr/);
  const literal = html.match(/const MARKET_DETAIL_TEXT = (\{[\s\S]*?\});\s*const DEX_METRIC_TEXT/)?.[1];
  assert.ok(literal, "asset detail locale catalog should be present");
  const catalog = Function(`"use strict"; return (${literal});`)();
  const languages = ["en", "es", "fr", "de", "pt", "it", "ja", "ko", "zh", "ar"];
  const expectedKeys = Object.keys(catalog.en).sort();
  assert.deepEqual(Object.keys(catalog).sort(), languages.sort());
  languages.forEach((language) => assert.deepEqual(Object.keys(catalog[language]).sort(), expectedKeys));
  const dexLiteral = html.match(/const DEX_METRIC_TEXT = (\{[\s\S]*?\});\s*const UI_EXTENDED/)?.[1];
  assert.ok(dexLiteral, "DEX metric locale catalog should be present");
  const dexCatalog = Function(`"use strict"; return (${dexLiteral});`)();
  const dexKeys = Object.keys(dexCatalog.en).sort();
  languages.forEach((language) => assert.deepEqual(Object.keys(dexCatalog[language]).sort(), dexKeys));
  assert.match(html, /openMarketAsset\(\{[\s\S]*?source:\s*row\.dataset\.source/);
});
