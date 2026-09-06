import { readFile } from "node:fs/promises";
import { evaluateReadiness } from "../lib/mainnet-readiness.js";

const fileUrl = new URL("../security/mainnet-readiness.json", import.meta.url);
const readiness = JSON.parse(await readFile(fileUrl, "utf8"));
const report = evaluateReadiness(readiness);

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--enforce") && !report.ready) {
  process.exitCode = 1;
}
