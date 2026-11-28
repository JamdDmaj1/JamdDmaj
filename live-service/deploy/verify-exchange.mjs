#!/usr/bin/env node
// Read-only exchange verification for onboarding a new adapter.
// Run from /opt/jamddmaj-live with a temporary environment:
//
// JAMDDMAJ_TEST_EXCHANGE=binance \
// JAMDDMAJ_TEST_API_KEY=... JAMDDMAJ_TEST_API_SECRET=... \
// node deploy/verify-exchange.mjs
//
// It never prints keys and never places an order. After a successful result,
// add the exchange id to JAMDDMAJ_LIVE_VERIFIED_EXCHANGES and restart the
// service. It does not edit production configuration by itself.

import {exchangeDefinition, probeExchange, safeError} from '../src/adapters/ccxt.mjs';

const id = String(process.env.JAMDDMAJ_TEST_EXCHANGE || '').trim().toLowerCase();
const definition = exchangeDefinition(id);
if (!definition) {
  console.error('Unknown exchange. Supported: bitget, binance, bybit, okx, kucoin, gate, htx, phemex, bingx, deribit, krakenfutures, mexc');
  process.exit(2);
}
const apiKey = String(process.env.JAMDDMAJ_TEST_API_KEY || '').trim();
const secret = String(process.env.JAMDDMAJ_TEST_API_SECRET || '').trim();
const passphrase = String(process.env.JAMDDMAJ_TEST_PASSPHRASE || '').trim();
if (!apiKey || !secret || (definition.passphrase && !passphrase)) {
  console.error('Missing temporary test credentials in the environment.');
  process.exit(2);
}
try {
  const result = await probeExchange(definition, {apiKey, secret, passphrase}, {timeout: 20000});
  console.log(JSON.stringify({
    exchange: id,
    status: result.status,
    balance: result.balance,
    positionCount: result.positions.length,
    verifiedForLive: definition.verified === true
  }, null, 1));
  console.log('Read-only check passed. Add the exchange to JAMDDMAJ_LIVE_VERIFIED_EXCHANGES only after reviewing fills, fees, stop orders and position reconciliation.');
} catch (error) {
  console.error('Verification failed:', safeError(error));
  process.exitCode = 1;
}
