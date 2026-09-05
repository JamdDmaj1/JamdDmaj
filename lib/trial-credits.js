// Server-only service. Call only after account authentication and native attestation.
// No HTTP endpoint accepts these identities from a browser or a device-ID header.
import { redisRequest } from "./server.js";
export const TRIAL_CREDITS = 20;
export const TRIAL_SECONDS = 7 * 24 * 60 * 60;
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
