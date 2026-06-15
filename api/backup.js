import {
  corsHeaders,
  hashIdentifier,
  isServiceConfigured,
  jsonResponse,
  redisRequest
} from "../lib/server.js";

export const config = { runtime: "edge" };

const MAX_BODY_BYTES = 1_500_000;
const MAX_BACKUP_BYTES = 1_200_000;

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Metodo no permitido." } }, 405);
  }
  if (!isServiceConfigured()) {
    return jsonResponse(request, { error: { message: "El respaldo automatico no esta configurado." } }, 503);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(request, { error: { message: "El respaldo es demasiado grande." } }, 413);
  }

  try {
    const input = await request.json();
    const recoveryHash = normalizeHash(input.recoveryHash);
    if (!recoveryHash) {
      return jsonResponse(request, { error: { message: "Codigo de recuperacion invalido." } }, 400);
    }
    if (input.action === "save") {
      return saveBackup(request, recoveryHash, input);
    }
    if (input.action === "restore") {
      return restoreBackup(request, recoveryHash);
    }
    return jsonResponse(request, { error: { message: "Accion invalida." } }, 400);
  } catch {
    return jsonResponse(request, { error: { message: "No se pudo procesar el respaldo." } }, 400);
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
    return jsonResponse(request, { error: { message: "El respaldo es demasiado grande." } }, 413);
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
    return jsonResponse(request, { error: { message: "No se encontro respaldo para ese codigo." } }, 404);
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
