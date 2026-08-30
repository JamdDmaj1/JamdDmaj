import bs58 from "bs58";
import nacl from "tweetnacl";

const PHANTOM_CONNECT_URL = "https://phantom.app/ul/v1/connect";
const PHANTOM_BROWSE_URL = "https://phantom.app/ul/browse";
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REQUEST_ID = /^[a-f0-9]{32}$/;

export function createPhantomConnectRequest(randomBytes = secureRandomBytes) {
  const keyPair = nacl.box.keyPair();
  const requestId = [...randomBytes(16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!REQUEST_ID.test(requestId)) throw new Error("invalid-request-id");
  return Object.freeze({
    requestId,
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey
  });
}

export function buildPhantomConnectUrl({
  publicKey,
  requestId,
  appUrl = "https://www.jamddmaj.com/",
  redirectBase = "jamddmaj://phantom",
  cluster = "mainnet-beta"
}) {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== nacl.box.publicKeyLength) throw new Error("invalid-public-key");
  if (!REQUEST_ID.test(String(requestId || ""))) throw new Error("invalid-request-id");
  if (appUrl !== "https://www.jamddmaj.com/") throw new Error("invalid-app-url");
  if (redirectBase !== "jamddmaj://phantom") throw new Error("invalid-redirect");
  if (!new Set(["mainnet-beta", "devnet", "testnet"]).has(cluster)) throw new Error("invalid-cluster");

  const redirect = new URL(redirectBase);
  redirect.searchParams.set("request", requestId);
  const url = new URL(PHANTOM_CONNECT_URL);
  url.searchParams.set("app_url", appUrl);
  url.searchParams.set("dapp_encryption_public_key", bs58.encode(publicKey));
  url.searchParams.set("redirect_link", redirect.toString());
  url.searchParams.set("cluster", cluster);
  return url.toString();
}

export function buildPhantomBrowseUrl({
  appUrl = "https://www.jamddmaj.com/?wallet_connect=phantom",
  ref = "https://www.jamddmaj.com/"
} = {}) {
  const target = new URL(appUrl);
  const source = new URL(ref);
  if (target.origin !== "https://www.jamddmaj.com" || target.pathname !== "/" || target.searchParams.get("wallet_connect") !== "phantom") {
    throw new Error("invalid-browse-target");
  }
  if (source.href !== "https://www.jamddmaj.com/") throw new Error("invalid-browse-ref");
  return `${PHANTOM_BROWSE_URL}/${encodeURIComponent(target.href)}?ref=${encodeURIComponent(source.href)}`;
}

export function decryptPhantomConnectResponse(callbackUrl, pendingRequest) {
  const url = new URL(String(callbackUrl || ""));
  if (url.protocol !== "jamddmaj:" || url.hostname !== "phantom") throw new Error("invalid-callback");
  if (!pendingRequest || url.searchParams.get("request") !== pendingRequest.requestId) throw new Error("request-mismatch");
  const errorCode = bounded(url.searchParams.get("errorCode"), 80);
  if (errorCode) {
    const error = new Error(bounded(url.searchParams.get("errorMessage"), 300) || "phantom-rejected");
    error.code = errorCode;
    throw error;
  }

  const phantomPublicKey = decodeFixed(url.searchParams.get("phantom_encryption_public_key"), nacl.box.publicKeyLength, "phantom-public-key");
  const nonce = decodeFixed(url.searchParams.get("nonce"), nacl.box.nonceLength, "nonce");
  const encrypted = decodeBounded(url.searchParams.get("data"), 16, 16_384, "data");
  if (!(pendingRequest.secretKey instanceof Uint8Array) || pendingRequest.secretKey.length !== nacl.box.secretKeyLength) {
    throw new Error("missing-secret-key");
  }
  const sharedSecret = nacl.box.before(phantomPublicKey, pendingRequest.secretKey);
  const decrypted = nacl.box.open.after(encrypted, nonce, sharedSecret);
  sharedSecret.fill(0);
  if (!decrypted) throw new Error("decrypt-failed");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error("invalid-payload");
  } finally {
    decrypted.fill(0);
  }
  const publicKey = bounded(payload?.public_key, 60);
  const session = bounded(payload?.session, 4096);
  if (!SOLANA_ADDRESS.test(publicKey) || !session) throw new Error("invalid-payload");
  return Object.freeze({ publicKey, session });
}

function decodeFixed(value, expectedLength, label) {
  const bytes = decodeBounded(value, expectedLength, expectedLength, label);
  if (bytes.length !== expectedLength) throw new Error(`invalid-${label}`);
  return bytes;
}

function decodeBounded(value, minimum, maximum, label) {
  const text = bounded(value, Math.ceil(maximum * 1.5));
  if (!text) throw new Error(`missing-${label}`);
  let bytes;
  try { bytes = bs58.decode(text); } catch { throw new Error(`invalid-${label}`); }
  if (bytes.length < minimum || bytes.length > maximum) throw new Error(`invalid-${label}`);
  return bytes;
}

function bounded(value, maximum) {
  return typeof value === "string" && value.length <= maximum ? value : "";
}

function secureRandomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) throw new Error("secure-random-unavailable");
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
