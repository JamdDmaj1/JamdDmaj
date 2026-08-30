const SOLFLARE_BROWSE_URL = "https://solflare.com/ul/v1/browse";
const APP_ORIGIN = "https://www.jamddmaj.com";

export function buildSolflareBrowseUrl({
  appUrl = `${APP_ORIGIN}/?wallet_connect=solflare`,
  ref = `${APP_ORIGIN}/`
} = {}) {
  const target = new URL(appUrl);
  const source = new URL(ref);
  if (target.origin !== APP_ORIGIN || target.pathname !== "/" || target.searchParams.get("wallet_connect") !== "solflare") {
    throw new Error("Solflare browse target must be the official JamdDmaj wallet return route.");
  }
  if (source.href !== `${APP_ORIGIN}/`) throw new Error("Solflare browse ref must be the official JamdDmaj origin.");
  return `${SOLFLARE_BROWSE_URL}/${encodeURIComponent(target.href)}?ref=${encodeURIComponent(source.href)}`;
}
