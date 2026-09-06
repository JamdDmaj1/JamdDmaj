import { redisRequest } from "./server.js";

const MAX_CREDITS = 10_000_000;
const identity = value => {
  if (!/^[a-f0-9]{64}$/.test(value || "")) throw new Error("verified-identity-required");
  return value;
};
const requestIdentity = value => {
  if (!/^[a-f0-9]{64}$/.test(value || "")) throw new Error("server-request-id-required");
  return value;
};
const creditKey = accountHash => `jamd:credits:v1:account:${identity(accountHash)}`;

export async function readPaidCredits(accountHash, storage = redisRequest) {
  const result = await storage("pipeline", [["GET", creditKey(accountHash)]]);
  if (result?.[0]?.error) throw new Error("credit-storage-unavailable");
  const credits = Number(result?.[0]?.result || 0);
  if (!Number.isSafeInteger(credits) || credits < 0 || credits > MAX_CREDITS) throw new Error("invalid-credit-balance");
  return credits;
}

export const GRANT_CREDITS_SCRIPT = `#!lua flags=allow-key-locking
local prior = redis.call("GET", KEYS[2])
if prior then return {0, tonumber(redis.call("GET", KEYS[1]) or "0")} end
local balance = tonumber(redis.call("GET", KEYS[1]) or "0")
local amount = tonumber(ARGV[1])
if not amount or amount < 1 or balance + amount > 10000000 then return {-1, balance} end
redis.call("SET", KEYS[2], ARGV[2])
balance = redis.call("INCRBY", KEYS[1], amount)
return {1, balance}
`;

export async function grantPaidCredits(accountHash, paymentId, amount, storage = redisRequest) {
  const key = creditKey(accountHash);
  if (!/^[a-z0-9:]{20,180}$/i.test(paymentId || "")) throw new Error("invalid-payment-id");
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) throw new Error("invalid-credit-grant");
  const paymentHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(paymentId));
  const paymentKey = `jamd:credits:v1:payment:${[...new Uint8Array(paymentHash)].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  const result = await storage("pipeline", [["EVAL", GRANT_CREDITS_SCRIPT, 2, key, paymentKey, amount, identity(accountHash)]]);
  const value = result?.[0]?.result;
  if (result?.[0]?.error || !Array.isArray(value) || value.length !== 2) throw new Error("credit-storage-unavailable");
  const [created, credits] = value.map(Number);
  if (![0,1].includes(created) || !Number.isSafeInteger(credits) || credits < 0 || credits > MAX_CREDITS) throw new Error("invalid-credit-grant-result");
  return { created: created === 1, credits };
}

export const CONSUME_PAID_CREDIT_SCRIPT = `#!lua flags=allow-key-locking
if redis.call("EXISTS", KEYS[2]) == 1 then return '{"status":"duplicate"}' end
local balance = tonumber(redis.call("GET", KEYS[1]) or "0")
if balance < 1 then return '{"status":"exhausted"}' end
balance = redis.call("DECR", KEYS[1])
redis.call("SET", KEYS[2], "spent", "EX", 2592000)
return cjson.encode({status="active", credits=balance})
`;

export async function consumePaidCredit(accountHash, requestId, storage = redisRequest) {
  const key = creditKey(accountHash);
  const result = await storage("pipeline", [["EVAL", CONSUME_PAID_CREDIT_SCRIPT, 2, key, `${key}:request:${requestIdentity(requestId)}`]]);
  if (result?.[0]?.error || typeof result?.[0]?.result !== "string") throw new Error("credit-storage-unavailable");
  return JSON.parse(result[0].result);
}

export const REFUND_PAID_CREDIT_SCRIPT = `#!lua flags=allow-key-locking
if redis.call("GET", KEYS[2]) ~= "spent" then return 0 end
redis.call("INCR", KEYS[1])
redis.call("SET", KEYS[2], "refunded", "KEEPTTL")
return 1
`;

export async function refundPaidCredit(accountHash, requestId, storage = redisRequest) {
  const key = creditKey(accountHash);
  const result = await storage("pipeline", [["EVAL", REFUND_PAID_CREDIT_SCRIPT, 2, key, `${key}:request:${requestIdentity(requestId)}`]]);
  if (result?.[0]?.error || ![0,1].includes(Number(result?.[0]?.result))) throw new Error("credit-storage-unavailable");
}
