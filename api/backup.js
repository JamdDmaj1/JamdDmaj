import {
  corsHeaders,
  hashIdentifier,
  isServiceConfigured,
  jsonResponse,
  redisRequest
} from "../lib/server.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const MAX_BODY_BYTES = 1_500_000;
const MAX_BACKUP_BYTES = 1_200_000;

async function handleWebRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  if (!isServiceConfigured()) {
    return jsonResponse(request, { error: { message: "Cloud backup is not configured." } }, 503);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(request, { error: { message: "The backup is too large." } }, 413);
  }

  try {
    const input = await request.json();
    const recoveryHash = normalizeHash(input.recoveryHash);
    if (!recoveryHash) {
      return jsonResponse(request, { error: { message: "Invalid recovery code." } }, 400);
    }
    if (input.action === "save") {
      return saveBackup(request, recoveryHash, input);
    }
    if (input.action === "restore") {
      return restoreBackup(request, recoveryHash);
    }
    return jsonResponse(request, { error: { message: "Invalid action." } }, 400);
  } catch {
    return jsonResponse(request, { error: { message: "The backup could not be processed." } }, 400);
  }
}

async function saveBackup(request, recoveryHash, input) {
  const encrypted = sanitizeEncryptedBackup(input.encrypted);
  const payload = JSON.stringify({
    encrypted,
    updatedAt: String(input.updatedAt || new Date().toISOString()).slice(0, 40),
    device: await hashIdentifier(request.headers.get("x-jamddmaj-device") || "unknown")
  });
  if (new TextEncoder().encode(payload).byteLength > MAX_BACKUP_BYTES) {
    return jsonResponse(request, { error: { message: "The backup is too large." } }, 413);
  }
  await redisRequest("pipeline", [
    ["SET", `jamd:backup:${recoveryHash}`, payload],
    ["SET", `jamd:backup-seen:${recoveryHash}`, new Date().toISOString()]
  ]);
  return jsonResponse(request, { ok: true });
}

async function restoreBackup(request, recoveryHash) {
  const data = await redisRequest("pipeline", [["GET", `jamd:backup:${recoveryHash}`]]);
  const raw = data?.[0]?.result;
  if (!raw) {
    return jsonResponse(request, { error: { message: "No backup found for that code." } }, 404);
  }
  const parsed = JSON.parse(raw);
  const encrypted = sanitizeEncryptedBackup(parsed.encrypted);
  return jsonResponse(request, {
    ok: true,
    encrypted,
    updatedAt: parsed.updatedAt || ""
  });
}

function normalizeHash(value) {
  const clean = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(clean) ? clean : "";
}

function sanitizeEncryptedBackup(value) {
  const iv = String(value?.iv || "");
  const data = String(value?.data || "");
  if (!/^[a-zA-Z0-9+/=]{12,80}$/.test(iv) || !/^[a-zA-Z0-9+/=]{20,1600000}$/.test(data)) {
    throw new Error("Invalid encrypted backup");
  }
  return { iv, data };
}

// Vercel's Node runtime supplies IncomingMessage/ServerResponse, while the
// existing handler is written against the Web Request/Response contract.
// This adapter keeps the backup on its own runtime without changing its logic.
export default async function handler(request, response) {
  if (request?.headers && typeof request.headers.get === "function") {
    return handleWebRequest(request);
  }
  return handleNodeRequest(request, response);
}

async function handleNodeRequest(request, response) {
  try {
    const chunks = [];
    if (request.body !== undefined && request.body !== null) {
      chunks.push(Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === "string" ? request.body : JSON.stringify(request.body)));
    } else {
      for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers || {})) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const host = headers.get("host") || "www.jamddmaj.com";
    const url = new URL(request.url || "/api/backup", "https://" + host);
    const webRequest = new Request(url, {
      method: request.method || "POST",
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks)
    });
    const webResponse = await handleWebRequest(webRequest);
    response.statusCode = webResponse.status;
    for (const [key, value] of webResponse.headers) response.setHeader(key, value);
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
    }
    response.end(JSON.stringify({ error: { message: "The backup could not be processed." } }));
  }
}

