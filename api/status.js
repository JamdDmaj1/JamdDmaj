import { corsHeaders, isServiceConfigured, jsonResponse } from "../lib/server.js";
import { getProServerState } from "../lib/pro-signals.js";

export const config = { runtime: "edge" };

const FALLBACK_VERSION = "1.37.50";
const FALLBACK_APK_URL = "https://github.com/JamdDmaj1/JamdDmaj/releases/latest/download/JamdDmaj-AI.apk";
const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/JamdDmaj1/JamdDmaj/releases/latest";

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "GET") {
    return jsonResponse(request, { error: { message: "Metodo no permitido." } }, 405);
  }

  const release = await resolveLatestRelease();
  const proExecutorHeartbeat = await getPublicExecutorHeartbeat();
  return jsonResponse(request, {
    ready: isServiceConfigured(),
    mode: "managed-free-chat",
    backup: isServiceConfigured(),
    liveSearch: isServiceConfigured(),
    proServer: Boolean(
      process.env.UPSTASH_REDIS_REST_URL
      && process.env.UPSTASH_REDIS_REST_TOKEN
      && process.env.JAMDDMAJ_CRON_SECRET
    ),
    googleAccount: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.JAMDDMAJ_ACCOUNT_SECRET),
    version: FALLBACK_VERSION,
    latestVersion: release.latestVersion,
    apkUrl: release.apkUrl,
    releaseUrl: release.releaseUrl,
    releaseName: release.releaseName,
    updateSource: release.source,
    proExecutorHeartbeat
  });
}

async function getPublicExecutorHeartbeat() {
  try {
    const state = await getProServerState();
    const executor = state.executor || {};
    return {
      mode: executor.mode || "unknown",
      ok: executor.ok === true,
      livePaused: executor.livePaused === true,
      lastRunAt: executor.lastRunAt || null,
      receivedAt: executor.receivedAt || null,
      bitgetSynced: executor.bitgetSynced === true,
      lastError: executor.lastError ? "VPS reported an executor error." : ""
    };
  } catch {
    return null;
  }
}

async function resolveLatestRelease() {
  const envVersion = cleanVersion(process.env.JAMDDMAJ_LATEST_VERSION || "");
  const envApkUrl = String(process.env.JAMDDMAJ_APK_URL || "").trim();
  let best = {
    latestVersion: envVersion || FALLBACK_VERSION,
    apkUrl: envApkUrl || FALLBACK_APK_URL,
    releaseUrl: "https://github.com/JamdDmaj1/JamdDmaj/releases/latest",
    releaseName: envVersion ? "JamdDmaj AI v" + envVersion : "JamdDmaj AI v" + FALLBACK_VERSION,
    source: envVersion ? "vercel-env" : "fallback"
  };

  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      cache: "no-store",
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "JamdDmaj-App-Update-Checker"
      }
    });
    if (!response.ok) throw new Error("GitHub release " + response.status);
    const release = await response.json();
    const githubVersion = cleanVersion(release?.tag_name || release?.name || "");
    if (githubVersion && compareVersions(githubVersion, best.latestVersion) >= 0) {
      const apkAsset = Array.isArray(release.assets)
        ? release.assets.find((asset) => /JamdDmaj-AI\.apk$/i.test(String(asset.name || "")))
        : null;
      best = {
        latestVersion: githubVersion,
        apkUrl: String(apkAsset?.browser_download_url || FALLBACK_APK_URL),
        releaseUrl: String(release.html_url || best.releaseUrl),
        releaseName: String(release.name || "JamdDmaj AI v" + githubVersion),
        source: "github-release"
      };
    }
  } catch {
    // Keep the env or fallback release if GitHub is temporarily unavailable.
  }

  return best;
}

function cleanVersion(value) {
  const match = String(value || "").match(/v?(\d+(?:\.\d+){1,3})/i);
  return match ? match[1] : "";
}

function compareVersions(left, right) {
  const a = String(left || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}
