import {
  corsHeaders,
  enforceRateLimits,
  hashIdentifier,
  isServiceConfigured,
  jsonResponse
} from "../lib/server.js";

export const config = { runtime: "edge" };

const MAX_QUERY_LENGTH = 500;
const FETCH_TIMEOUT_MS = 9000;

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Metodo no permitido." } }, 405);
  }
  if (!isServiceConfigured()) {
    return jsonResponse(request, { error: { message: "La busqueda automatica no esta configurada." } }, 503);
  }

  const deviceId = normalizeDeviceId(request.headers.get("x-jamddmaj-device"));
  if (!deviceId) {
    return jsonResponse(request, { error: { message: "No se pudo identificar este dispositivo." } }, 400);
  }

  try {
    await enforceRateLimits(request, `live-${deviceId}`);
    const input = await request.json();
    const query = String(input.query || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) return jsonResponse(request, { ok: true, context: "", results: [] });

    const youtubeIntent = hasYouTubeIntent(query);
    const results = [];
  if (youtubeIntent) {
    const youtube = await findLatestYouTubeVideo(query);
    if (youtube) results.push(youtube);
  }

  if (!results.length && shouldSearchWeb(query)) {
      const webResults = await searchDuckDuckGo(query);
      if (youtubeIntent) {
        const youtubeFromWeb = await findLatestFromWebChannel(webResults);
        if (youtubeFromWeb) results.push(youtubeFromWeb);
      }
      if (!results.length) results.push(...webResults);
  }

    const context = buildLiveContext(query, results);
    return jsonResponse(request, {
      ok: true,
      source: "free-live-search",
      query,
      context,
      results
    });
  } catch (error) {
    const status = Number(error.status) || 502;
    return jsonResponse(request, {
      error: { message: status === 429 ? error.message : "No se pudo completar la busqueda automatica." }
    }, status);
  }
}

function normalizeDeviceId(value) {
  const clean = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{16,120}$/.test(clean) ? clean : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasYouTubeIntent(query) {
  const text = normalizeText(query);
  return /\b(youtube|youtu\.be|ultimo video|last video|latest video|video mas reciente|newest video|canal|channel)\b/.test(text);
}

function shouldSearchWeb(query) {
  const text = normalizeText(query);
  return hasYouTubeIntent(query)
    || /\b(ultimo|ultima|latest|reciente|recent|hoy|today|ayer|yesterday|manana|tomorrow|noticia|news|actual|current|ahora|now|precio|price)\b/.test(text);
}

async function findLatestYouTubeVideo(query) {
  const channelQuery = extractYouTubeChannelQuery(query);
  if (!channelQuery) return null;
  const channelId = await resolveYouTubeChannelId(channelQuery);
  if (!channelId) return null;
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml = await fetchText(feedUrl);
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1] || "";
  if (!entry) return null;
  const title = decodeHtml(getXmlText(entry, "title"));
  const author = decodeHtml(getXmlText(entry, "name"));
  const published = getXmlText(entry, "published") || getXmlText(entry, "updated");
  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1] || "";
  const link = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "";
  const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : link;
  if (!title || !url) return null;
  return {
    type: "youtube_latest",
    title,
    url,
    channel: author || channelQuery,
    published,
    source: "YouTube RSS"
  };
}

async function findLatestFromWebChannel(results) {
  for (const result of results || []) {
    try {
      const url = new URL(result.url);
      if (!/youtube\.com$/i.test(url.hostname.replace(/^www\./, ""))) continue;
      if (!url.pathname.startsWith("/@") && !url.pathname.startsWith("/channel/") && !url.pathname.startsWith("/c/") && !url.pathname.startsWith("/user/")) continue;
      const html = await fetchText(url.href);
      const channelId = parseChannelId(html);
      if (!channelId) continue;
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
      const xml = await fetchText(feedUrl);
      const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1] || "";
      if (!entry) continue;
      const title = decodeHtml(getXmlText(entry, "title"));
      const author = decodeHtml(getXmlText(entry, "name"));
      const published = getXmlText(entry, "published") || getXmlText(entry, "updated");
      const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1] || "";
      if (!title || !videoId) continue;
      return {
        type: "youtube_latest",
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        channel: author || result.title,
        published,
        source: "YouTube RSS via web result"
      };
    } catch {}
  }
  return null;
}

function extractYouTubeChannelQuery(query) {
  const text = String(query || " ");
  const urlHandle = text.match(/youtube\.com\/@([a-zA-Z0-9._-]+)/i)?.[1];
  if (urlHandle) return `@${urlHandle}`;
  const handle = text.match(/@([a-zA-Z0-9._-]{2,})/)?.[1];
  if (handle) return `@${handle}`;
  const patterns = [
    /(?:ultimo|ultima|last|latest|reciente|recent|newest)?\s*(?:video|short)?\s*(?:de|from|of)\s+([^?.!,\n]+)/i,
    /(?:canal|channel)\s+(?:de|from)?\s*([^?.!,\n]+)/i,
    /youtube\s+(?:de|from)?\s*([^?.!,\n]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1];
    if (match) return cleanChannelQuery(match);
  }
  return cleanChannelQuery(text);
}

function cleanChannelQuery(value) {
  const cleaned = String(value || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(mandame|manda|enviame|enviar|quiero|dame|send|give|show|can|you|me|the|a|an|el|la|los|las|ultimo|ultima|last|latest|newest|recent|video|videos|youtube|en|in|on|de|from|of|porfa|please|pero)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

async function resolveYouTubeChannelId(channelQuery) {
  const clean = cleanChannelQuery(channelQuery);
  const handle = clean.startsWith("@")
    ? clean
    : `@${clean.replace(/[^a-zA-Z0-9._-]+/g, "")}`;
  const directCandidates = [
    `https://www.youtube.com/${handle}`,
    `https://www.youtube.com/c/${encodeURIComponent(clean)}`,
    `https://www.youtube.com/user/${encodeURIComponent(clean)}`
  ];
  for (const url of directCandidates) {
    try {
      const html = await fetchText(url);
      const id = parseChannelId(html);
      if (id) return id;
    } catch {}
  }
  try {
    const searchHtml = await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${clean} channel`)}`);
    return parseChannelId(searchHtml);
  } catch {
    return "";
  }
}

function parseChannelId(html) {
  const text = String(html || "");
  return (
    text.match(/<link[^>]+href="[^"]*feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]{20,})"/i)?.[1]
    || text.match(/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})"/i)?.[1]
    || text.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1]
    || text.match(/"browseId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1]
    || text.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1]
    || text.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/)?.[1]
    || text.match(/channel_id=(UC[a-zA-Z0-9_-]{20,})/)?.[1]
    || ""
  );
}

async function searchDuckDuckGo(query) {
  const html = await fetchText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const results = [];
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && results.length < 5) {
    const url = cleanDuckUrl(decodeHtml(match[1]));
    const title = stripTags(decodeHtml(match[2]));
    const snippet = stripTags(decodeHtml(match[3]));
    if (url && title) {
      results.push({ type: "web_result", title, url, snippet, source: "DuckDuckGo" });
    }
  }
  return results;
}

function cleanDuckUrl(value) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.href;
  } catch {
    return "";
  }
}

function buildLiveContext(query, results) {
  if (!results.length) return "";
  const timestamp = new Date().toISOString();
  const lines = [`Free live lookup requested by the app at ${timestamp} for: "${query}".`];
  results.forEach((item, index) => {
    if (item.type === "youtube_latest") {
      lines.push([
        `Result ${index + 1}: YouTube latest video`,
        `channel ${item.channel || "unknown"}`,
        `title "${item.title}"`,
        `url ${item.url}`,
        `published ${item.published || "unknown"}`,
        `source ${item.source}`
      ].join("; "));
    } else {
      lines.push([
        `Result ${index + 1}: ${item.title}`,
        `url ${item.url}`,
        `snippet ${item.snippet || ""}`,
        `source ${item.source}`
      ].join("; "));
    }
  });
  return lines.join("\n");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 JamdDmajAI/1.11",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`Fetch failed ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function getXmlText(xml, tagName) {
  return String(xml || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))?.[1]?.trim() || "";
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
