import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "www");
const assets = [
  "index.html",
  "oauth-mobile.html",
  "google-mobile.html",
  "manifest.json",
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

console.log(`Prepared ${assets.length} web assets in www.`);

async function emptyDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map((entry) => (
    rm(resolve(directory, entry.name), { recursive: true, force: true })
  )));
}
