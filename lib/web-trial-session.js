import { hashIdentifier, redisRequest } from "./server.js";
import { claimWebTrial, TRIAL_SECONDS } from "./trial-credits.js";
export async function trialHash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export async function issueTrialSession(accountHash, storage = redisRequest) {
  const trial = await claimWebTrial(accountHash, storage);
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2,"0")).join("");
  const key = `jamd:trial:session:${await hashIdentifier(token)}`;
  const saved = await storage("pipeline", [["SET", key, accountHash, "EX", TRIAL_SECONDS]]);
  if (saved?.[0]?.result !== "OK" || saved[0].error) throw new Error("trial-storage-unavailable");
  return { token, trial };
}
export async function authenticateTrial(request, storage = redisRequest) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error("trial-login"), {status:401});
  const value = await storage("pipeline", [["GET", `jamd:trial:session:${await hashIdentifier(token)}`]]);
  if (value?.[0]?.error) throw new Error("trial-storage-unavailable");
  const account = value?.[0]?.result;
  if (!/^[a-f0-9]{64}$/.test(account || "")) throw Object.assign(new Error("trial-login"), {status:401});
  return account;
}
