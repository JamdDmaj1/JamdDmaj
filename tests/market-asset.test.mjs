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
      return Response.json({ code: "00000", data: [{ lastPrice: "160", price24hPcnt: "0.04", high24h: "165", low24h: "150", turnover24h: "9000000", openInterest: "500000", fundingRate: "0.0001" }] });
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
  assert.equal(payload.news[0].domain, "example.com");
  assert.equal(payload.trend.direction, "bullish");
  assert.ok(payload.trend.confidence <= 82);
  assert.match(payload.sources.chart, /Bitget/);
});

test("market asset rejects unsafe or incomplete identifiers", async () => {
  const response = await marketAssetHandler(new Request("https://www.jamddmaj.com/api/market-asset?symbol=%3Cscript%3E&coinId=../bad"));
  assert.equal(response.status, 400);
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
  const literal = html.match(/const MARKET_DETAIL_TEXT = (\{[\s\S]*?\});\s*const UI_EXTENDED/)?.[1];
  assert.ok(literal, "asset detail locale catalog should be present");
  const catalog = Function(`"use strict"; return (${literal});`)();
  const languages = ["en", "es", "fr", "de", "pt", "it", "ja", "ko", "zh", "ar"];
  const expectedKeys = Object.keys(catalog.en).sort();
  assert.deepEqual(Object.keys(catalog).sort(), languages.sort());
  languages.forEach((language) => assert.deepEqual(Object.keys(catalog[language]).sort(), expectedKeys));
});
