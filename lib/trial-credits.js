// Server-only service. Call only after account authentication and native attestation.
// No HTTP endpoint accepts these identities from a browser or a device-ID header.
import { redisRequest } from "./server.js";
export const TRIAL_CREDITS = 20;
export const TRIAL_SECONDS = 7 * 24 * 60 * 60;
// Web policy approved by the owner: once per server-verified Google account.
// This deliberately makes no claim of device uniqueness.
export const WEB_TRIAL_SCRIPT = `#!lua flags=allow-key-locking
local now = tonumber(redis.call("TIME")[1])
local existing = redis.call("GET", KEYS[1])
if existing then
  local record = cjson.decode(existing)
  if record.expiresAt <= now then record.status = "expired"
  elseif record.credits <= 0 then record.status = "exhausted" end
  return cjson.encode(record)
end
local record = cjson.encode({status="active", credits=20, startedAt=now, expiresAt=now+604800})
redis.call("SET", KEYS[1], record)
return record
`;

export async function claimWebTrial(accountHash, storage = redisRequest) {
  // accountHash must be derived on the server after Google's token validation.
  const key = `jamd:trial:v1:account:${serverIdentity(accountHash)}`;
  const result = await storage("pipeline", [["EVAL", WEB_TRIAL_SCRIPT, 1, key]]);
  if (result?.[0]?.error || typeof result?.[0]?.result !== "string") throw new Error("trial-storage-unavailable");
  const record = JSON.parse(result[0].result);
  if (!["active", "expired", "exhausted"].includes(record?.status)
      || !Number.isInteger(record.credits) || record.credits < 0 || record.credits > TRIAL_CREDITS
      || !Number.isSafeInteger(record.startedAt) || !Number.isSafeInteger(record.expiresAt)
      || record.expiresAt - record.startedAt !== TRIAL_SECONDS) throw new Error("invalid-trial-record");
  return record;
}
export const TRIAL_SCRIPT = `#!lua flags=allow-key-locking
local now = tonumber(redis.call("TIME")[1])
local existing = redis.call("GET", KEYS[1])
if existing then return existing end
if redis.call("EXISTS", KEYS[2]) == 1 then return '{"status":"device-used"}' end
local record = cjson.encode({status="active", credits=20, startedAt=now, expiresAt=now+604800})
redis.call("SET", KEYS[1], record)
redis.call("SET", KEYS[2], "used")
return record
`;
export const CONSUME_TRIAL_SCRIPT = `#!lua flags=allow-key-locking
local now = tonumber(redis.call("TIME")[1])
local raw = redis.call("GET", KEYS[1])
if not raw then return '{"status":"missing"}' end
local record = cjson.decode(raw)
if record.expiresAt <= now then return '{"status":"expired"}' end
if redis.call("EXISTS", KEYS[2]) == 1 then return '{"status":"duplicate"}' end
if record.credits < 1 then return '{"status":"exhausted"}' end
record.credits = record.credits - 1
redis.call("SET", KEYS[1], cjson.encode(record))
redis.call("SET", KEYS[2], "spent", "EX", math.max(1, record.expiresAt-now))
return cjson.encode(record)
`;

function serverIdentity(value) {
  if (!/^[a-f0-9]{64}$/.test(value || "")) throw new Error("verified-identity-required");
  return value;
}
export function trialKeys({ accountHash, deviceHash, attestationVerified, provider }) {
  if (attestationVerified !== true || !["apple-devicecheck", "google-device-recall"].includes(provider)) {
    throw new Error("native-device-verification-required");
  }
  return [`jamd:trial:v1:account:${serverIdentity(accountHash)}`,
    `jamd:trial:v1:device:${provider}:${serverIdentity(deviceHash)}`];
}
export async function claimTrial(verifiedIdentity, storage = redisRequest) {
  const keys = trialKeys(verifiedIdentity);
  const result = await storage("pipeline", [["EVAL", TRIAL_SCRIPT, 2, ...keys]]);
  if (result?.[0]?.error || typeof result?.[0]?.result !== "string") throw new Error("trial-storage-unavailable");
  return JSON.parse(result[0].result);
}
export async function consumeTrial(accountHash, requestId, storage = redisRequest) {
  serverIdentity(accountHash);
  if (!/^[a-f0-9]{64}$/.test(requestId || "")) throw new Error("server-request-id-required");
  const key = `jamd:trial:v1:account:${accountHash}`;
  const result = await storage("pipeline", [["EVAL", CONSUME_TRIAL_SCRIPT, 2, key, `${key}:request:${requestId}`]]);
  if (result?.[0]?.error || typeof result?.[0]?.result !== "string") throw new Error("trial-storage-unavailable");
  return JSON.parse(result[0].result);
}

export const REFUND_TRIAL_SCRIPT = `#!lua flags=allow-key-locking
if redis.call("GET", KEYS[2]) ~= "spent" then return 0 end
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
local now = tonumber(redis.call("TIME")[1])
if record.expiresAt <= now then return 0 end
record.credits = math.min(20, record.credits + 1)
redis.call("SET", KEYS[1], cjson.encode(record))
redis.call("SET", KEYS[2], "refunded", "KEEPTTL")
return 1
`;
export async function refundTrial(accountHash, requestId, storage = redisRequest) {
  serverIdentity(accountHash); serverIdentity(requestId);
  const key = `jamd:trial:v1:account:${accountHash}`;
  const result = await storage("pipeline", [["EVAL", REFUND_TRIAL_SCRIPT, 2, key, `${key}:request:${requestId}`]]);
  if (result?.[0]?.error || ![0,1].includes(result?.[0]?.result)) throw new Error("trial-storage-unavailable");
}
