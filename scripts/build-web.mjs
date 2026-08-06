import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "www");
const assets = [
  "index.html",
  "candlesticks.js",
  "fair-launch.css",
  "oauth-mobile.html",
  "google-mobile.html",
  "manifest.json",
  "robots.txt",
  "sitemap.xml",
  "icon-72.png",
  "icon-96.png",
  "icon-128.png",
  "icon-144.png",
  "icon-152.png",
  "icon-192.png",
  "icon-384.png",
  "icon-512.png"
];

await mkdir(output, { recursive: true });
await emptyDirectory(output);

for (const asset of assets) {
  await cp(resolve(root, asset), resolve(output, asset));
}

await build({
  absWorkingDir: root,
  entryPoints: ["./fair-launch-ui.js"],
  outfile: resolve(output, "fair-launch-ui.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none"
});

await mkdir(resolve(output, "lib"), { recursive: true });
await cp(resolve(root, "lib", "fair-launch.js"), resolve(output, "lib", "fair-launch.js"));
await cp(resolve(root, "lib", "wallet-security.js"), resolve(output, "lib", "wallet-security.js"));
await cp(resolve(root, "lib", "wallet-standard-registry.js"), resolve(output, "lib", "wallet-standard-registry.js"));
await cp(resolve(root, "lib", "fair-launch-boost.js"), resolve(output, "lib", "fair-launch-boost.js"));
await cp(resolve(root, "lib", "fair-launch-locales.js"), resolve(output, "lib", "fair-launch-locales.js"));

console.log(`Prepared ${assets.length} web assets in www.`);

async function emptyDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map((entry) => (
    rm(resolve(directory, entry.name), { recursive: true, force: true })
  )));
}
