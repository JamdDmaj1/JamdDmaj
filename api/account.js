import { corsHeaders, hashIdentifier, jsonResponse, redisRequest } from "../lib/server.js";
import { issueTrialSession, trialHash } from "../lib/web-trial-session.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const accountSecret = String(process.env.JAMDDMAJ_ACCOUNT_SECRET || "").trim();
  const enabled = Boolean(clientId && accountSecret.length >= 32 && process.env.UPSTASH_REDIS_REST_URL);
  if (request.method === "GET") {
    return jsonResponse(request, { ok: true, google: { enabled, clientId: enabled ? clientId : "" } });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  if (!enabled) {
    return jsonResponse(request, { error: { message: "Google account linking is not configured yet." } }, 503);
  }
  try {
    const input = await request.json();
    const action = String(input?.action || "");
    if (!['google', 'googleMobileStart', 'googleMobileFinish'].includes(action)) {
      return jsonResponse(request, { error: { message: "Invalid account action." } }, 400);
    }

    if (action === "googleMobileStart") {
      const accessToken = String(input.accessToken || "").trim();
      const state = normalizeOAuthValue(input.state, 16, 128);
      const challenge = normalizeOAuthValue(input.challenge, 32, 128);
      if (!accessToken || accessToken.length > 10000 || !state || !challenge) {
        return jsonResponse(request, { error: { message: "Invalid mobile Google request." } }, 400);
      }
      const identity = await verifyGoogleAccessToken(accessToken, clientId);
      const ticket = randomUrlToken(32);
      const ticketHash = await hashIdentifier(`google-ticket:${ticket}`);
      await redisRequest("pipeline", [[
        "SET",
        `jamd:account:ticket:${ticketHash}`,
        JSON.stringify({ ...identity, challenge }),
        "EX",
        300
      ]]);
      return jsonResponse(request, { ok: true, ticket, state });
    }

    let identity;
    if (action === "googleMobileFinish") {
      const ticket = normalizeOAuthValue(input.ticket, 32, 128);
      const verifier = normalizeOAuthValue(input.verifier, 32, 160);
      if (!ticket || !verifier) {
        return jsonResponse(request, { error: { message: "Invalid mobile Google callback." } }, 400);
      }
      const ticketHash = await hashIdentifier(`google-ticket:${ticket}`);
      const response = await redisRequest("pipeline", [["GETDEL", `jamd:account:ticket:${ticketHash}`]]);
      const ticketData = parseJson(response?.[0]?.result);
      if (!ticketData?.sub || !ticketData?.challenge) {
        return jsonResponse(request, { error: { message: "This Google sign-in expired. Please try again." } }, 401);
      }
      const challenge = await sha256Base64Url(verifier);
      if (challenge !== ticketData.challenge) {
        return jsonResponse(request, { error: { message: "This Google sign-in could not be verified." } }, 401);
      }
      identity = ticketData;
    } else {
      const credential = String(input.credential || "").trim();
      const accessToken = String(input.accessToken || "").trim();
      if ((!credential && !accessToken) || credential.length > 10000 || accessToken.length > 10000) {
        return jsonResponse(request, { error: { message: "Invalid Google credential." } }, 400);
      }
      identity = accessToken
        ? await verifyGoogleAccessToken(accessToken, clientId)
        : await verifyGoogleCredential(credential, clientId);
    }

    const result = await linkGoogleProfile(input, identity, accountSecret);
    if (result.linked) result.webTrial = await issueTrialSession(await trialHash(`google:${identity.sub}`));
    return jsonResponse(request, result);
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "Google sign-in could not be completed." }
    }, Number(error?.status) || 401);
  }
}

export async function linkGoogleProfile(input, identity, accountSecret, storage = redisRequest) {
    const accountHash = await hashIdentifier(`google:${identity.sub}`);
    const key = `jamd:account:google:${accountHash}`;
    const response = await storage("pipeline", [["GET", key]]);
    if (response?.[0]?.error || response?.[0]?.result === undefined) throw new Error("Account storage unavailable.");
    const existing = parseJson(response?.[0]?.result);
    if (response[0].result !== null && !existing?.wrappedRecovery) throw new Error("The linked profile could not be recovered.");
    const suppliedCode = normalizeRecoveryCode(input.recoveryCode);
    let recoveryCode = "";
    let linked = false;

    if (existing?.wrappedRecovery) {
      recoveryCode = await unwrapRecoveryCode(existing.wrappedRecovery, accountSecret);
      linked = true;
    } else if (suppliedCode) {
      recoveryCode = suppliedCode;
      const record = {
        provider: "google",
        subHash: accountHash,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        wrappedRecovery: await wrapRecoveryCode(recoveryCode, accountSecret),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const saved = await storage("pipeline", [["SET", key, JSON.stringify(record), "NX"]]);
      if (saved?.[0]?.error || !['OK', null].includes(saved?.[0]?.result)) throw new Error("Account storage unavailable.");
      if (saved[0].result === null) {
        const winner = await storage("pipeline", [["GET", key]]);
        const record = parseJson(winner?.[0]?.result);
        if (winner?.[0]?.error || !record?.wrappedRecovery) throw new Error("The linked profile could not be recovered.");
        recoveryCode = await unwrapRecoveryCode(record.wrappedRecovery, accountSecret);
      }
      linked = true;
    }

    return {
      ok: true,
      linked,
      needsProfile: !linked,
      recoveryCode: linked ? recoveryCode : "",
      profile: {
        provider: "google",
        email: identity.email,
        name: identity.name,
        picture: identity.picture
      }
    };
}

// Only call after authenticating the existing Google account session. The full
// trial account hash and the older Google profile key share the same prefix.
export async function readGoogleSyncProfile(owner, secret, storage = redisRequest) {
  if (!/^[a-f0-9]{64}$/.test(owner || '') || typeof secret !== 'string' || secret.length < 32) throw new Error('Account unavailable.');
  const rows = await storage('pipeline', [['GET', `jamd:account:google:${owner.slice(0, 32)}`]]);
  if (rows?.[0]?.error || rows?.[0]?.result === undefined) throw new Error('Account unavailable.');
  if (rows[0].result === null) return {ok:true,linked:false};
  const record = parseJson(rows[0].result);
  if (record?.provider !== 'google' || record.subHash !== owner.slice(0,32) || !record.wrappedRecovery) throw new Error('Account unavailable.');
  return {ok:true,linked:true,recoveryCode:await unwrapRecoveryCode(record.wrappedRecovery, secret)};
}

async function verifyGoogleCredential(credential, clientId) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new Error("Google could not verify this sign-in.");
  const data = await response.json();
  if (data.aud !== clientId || String(data.email_verified) !== "true" || !data.sub) {
    throw new Error("This Google credential is not valid for JamdDmaj.");
  }
  return {
    sub: String(data.sub),
    email: String(data.email || "").slice(0, 320),
    name: String(data.name || "Google user").slice(0, 120),
    picture: /^https:\/\//.test(String(data.picture || "")) ? String(data.picture).slice(0, 1000) : ""
  };
}

async function verifyGoogleAccessToken(accessToken, clientId) {
  const check = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  if (!check.ok) throw new Error("Google could not verify this sign-in.");
  const token = await check.json();
  if (token.aud !== clientId) throw new Error("This Google token is not valid for JamdDmaj.");
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!profileResponse.ok) throw new Error("Google profile access failed.");
  const profile = await profileResponse.json();
  if (!profile.sub || profile.email_verified !== true) throw new Error("Google email verification is required.");
  return {
    sub: String(profile.sub),
    email: String(profile.email || "").slice(0, 320),
    name: String(profile.name || "Google user").slice(0, 120),
    picture: /^https:\/\//.test(String(profile.picture || "")) ? String(profile.picture).slice(0, 1000) : ""
  };
}

async function wrapRecoveryCode(code, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await accountKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(code)
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

async function unwrapRecoveryCode(value, secret) {
  const key = await accountKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(value.iv) },
    key,
    fromBase64(value.data)
  );
  const code = normalizeRecoveryCode(new TextDecoder().decode(decrypted));
  if (!code) throw new Error("The linked profile could not be recovered.");
  return code;
}

async function accountKey(secret) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function normalizeRecoveryCode(value) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{20}$/.test(code) ? code : "";
}

function normalizeOAuthValue(value, minimum, maximum) {
  const clean = String(value || "").trim();
  return clean.length >= minimum && clean.length <= maximum && /^[A-Za-z0-9_-]+$/.test(clean)
    ? clean
    : "";
}

function randomUrlToken(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64(new Uint8Array(digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(String(value || "")), (character) => character.charCodeAt(0));
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
