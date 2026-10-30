import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "www");
const assets = [
  "index.html",
  "wallet-web.html",
  "wallet-web.css",
  "fee-recipient-setup.html",
  "fee-recipient-setup.css",
  "private-simulator.html",
  "private-simulator-ui.js",
  "manual-order-review-ui.js",
  "discover.html",
  "discover.css",
  "discover-refresh.css",
  "discover-tour.css",
  "discover.js",
  "jamd-roadmap.js",
  "jamd-credit-ui.js",
  "candlesticks.js",
  "fair-launch.css",
  "app-polish.css",
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

await mkdir(resolve(output, ".well-known"), { recursive: true });
await build({absWorkingDir:root,entryPoints:[resolve(root,'web-trial-ui.js')],outfile:resolve(output,'web-trial-ui.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none'});
await cp(resolve(root, ".well-known", "security.txt"), resolve(output, ".well-known", "security.txt"));

await build({
  absWorkingDir:root,entryPoints:[resolve(root,'wallet-web-ui.js')],outfile:resolve(output,'wallet-web-ui.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'none'
});
await build({absWorkingDir:root,entryPoints:[resolve(root,'fee-recipient-setup-ui.js')],outfile:resolve(output,'fee-recipient-setup-ui.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],legalComments:'none'});

await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "fair-launch-ui.js")],
  outfile: resolve(output, "fair-launch-ui.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none"
});

await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "jamd-credit-ui.js")],
  outfile: resolve(output, "jamd-credit-ui.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none"
});

await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "wallet-login-ui.js")],
  outfile: resolve(output, "wallet-login-ui.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  legalComments: "none"
});

await mkdir(resolve(output, "lib"), { recursive: true });
await cp(resolve(root, "lib", "wallet-display.js"), resolve(output, "lib", "wallet-display.js"));
await cp(resolve(root, "lib", "wallet-portfolio-store.js"), resolve(output, "lib", "wallet-portfolio-store.js"));
await cp(resolve(root, "lib", "wallet-trading-state.js"), resolve(output, "lib", "wallet-trading-state.js"));
await cp(resolve(root, "lib", "wallet-trading-panel.js"), resolve(output, "lib", "wallet-trading-panel.js"));
await build({
  absWorkingDir: root, entryPoints: [resolve(root, "assets-wallet-ui.js")],
  outfile: resolve(output, "assets-wallet-ui.js"), bundle: true, format: "esm",
  plugins: [{name:'shared-public-portfolio',setup(builder){
    builder.onResolve({filter:/wallet-portfolio-store\.js$/},()=>({path:'./lib/wallet-portfolio-store.js',external:true}));
    builder.onResolve({filter:/wallet-trading-state\.js$/},()=>({path:'./lib/wallet-trading-state.js',external:true}));
    builder.onResolve({filter:/perps-web-wallet-session\.js$/},()=>({path:'./lib/perps-web-wallet-session.js',external:true}));
  }}],
  platform: "browser", target: ["es2020"], legalComments: "none"
});
await build({
  absWorkingDir:root,entryPoints:[resolve(root,'lib','perps-web-wallet-session.js')],
  outfile:resolve(output,'lib','perps-web-wallet-session.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none',
  plugins:[{name:'shared-wallet-session-portfolio',setup(builder){
    builder.onResolve({filter:/wallet-portfolio-store\.js$/},()=>({path:'./wallet-portfolio-store.js',external:true}));
  }}]
});
await cp(resolve(root, "lib", "terminal-layout.js"), resolve(output, "lib", "terminal-layout.js"));
await build({absWorkingDir:root,entryPoints:[resolve(root,'lib/market-signal-alerts.js')],outfile:resolve(output,'lib/market-signal-alerts.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none'});
await build({absWorkingDir:root,entryPoints:[resolve(root,'firebase-messaging-sw.js')],outfile:resolve(output,'firebase-messaging-sw.js'),bundle:true,format:'iife',platform:'browser',target:['es2020'],legalComments:'none'});
await build({absWorkingDir:root,entryPoints:[resolve(root,'lib/firebase-push-web.js')],outfile:resolve(output,'lib/firebase-push-web.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none'});
await cp(resolve(root, "lib", "first-visit-access.js"), resolve(output, "lib", "first-visit-access.js"));
await build({absWorkingDir:root,entryPoints:[resolve(root,'first-visit-ui.js')],outfile:resolve(output,'first-visit-ui.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none'});
await cp(resolve(root, "lib", "wallet-receipt-reader.js"), resolve(output, "lib", "wallet-receipt-reader.js"));
await cp(resolve(root, "lib", "wallet-receipt-notifications.js"), resolve(output, "lib", "wallet-receipt-notifications.js"));
await cp(resolve(root, "lib", "market-sentiment-ui.js"), resolve(output, "lib", "market-sentiment-ui.js"));
await cp(resolve(root, "lib", "finance-markets.js"), resolve(output, "lib", "finance-markets.js"));
await cp(resolve(root, "lib", "finance-preferences.js"), resolve(output, "lib", "finance-preferences.js"));
await cp(resolve(root, "lib", "finance-depth.js"), resolve(output, "lib", "finance-depth.js"));
await cp(resolve(root, "lib", "finance-candles.js"), resolve(output, "lib", "finance-candles.js"));
await cp(resolve(root, "lib", "finance-activity.js"), resolve(output, "lib", "finance-activity.js"));
await cp(resolve(root, "lib", "automation-panel.js"), resolve(output, "lib", "automation-panel.js"));
await cp(resolve(root, "lib", "perps-control-panel.js"), resolve(output, "lib", "perps-control-panel.js"));
await cp(resolve(root, "lib", "perps-navigation.js"), resolve(output, "lib", "perps-navigation.js"));
await cp(resolve(root, "lib", "perps-web-recovery-ui.js"), resolve(output, "lib", "perps-web-recovery-ui.js"));
await cp(resolve(root, "lib", "finance-route.js"), resolve(output, "lib", "finance-route.js"));
await build({
  absWorkingDir: root, entryPoints: [resolve(root, "lib", "perps-control-client.js")],
  outfile: resolve(output, "lib", "perps-control-client.js"), bundle: true,
  format: "esm", platform: "browser", target: ["es2020"], legalComments: "none"
});
await cp(resolve(root, "lib", "finance-polish.js"), resolve(output, "lib", "finance-polish.js"));
await cp(resolve(root, "lib", "markets-catalog.js"), resolve(output, "lib", "markets-catalog.js"));
await cp(resolve(root, "lib", "swap-quote-ui.js"), resolve(output, "lib", "swap-quote-ui.js"));
for (const name of ['perps-manual-policy-panel','perps-web-order-panel','perps-web-close-panel']) {
  await build({
    absWorkingDir:root,entryPoints:[resolve(root,'lib',name+'.js')],outfile:resolve(output,'lib',name+'.js'),
    bundle:true,format:'esm',platform:'browser',target:['es2020'],legalComments:'none',
    plugins:[{name:'shared-perps-wallet-authority',setup(builder){
      builder.onResolve({filter:/wallet-portfolio-store\.js$/},()=>({path:'./wallet-portfolio-store.js',external:true}));
      builder.onResolve({filter:/perps-web-wallet-session\.js$/},()=>({path:'./perps-web-wallet-session.js',external:true}));
      builder.onResolve({filter:/wallet-trading-state\.js$/},()=>({path:'./wallet-trading-state.js',external:true}));
    }}]
  });
}
await build({
  absWorkingDir: root, entryPoints: [resolve(root, "funding-ui.js")],
  outfile: resolve(output, "funding-ui.js"), bundle: true, format: "esm",
  platform: "browser", target: ["es2020"], legalComments: "none"
});
await cp(resolve(root, "lib", "manual-order-draft.js"), resolve(output, "lib", "manual-order-draft.js"));
await cp(resolve(root, "lib", "private-simulator.js"), resolve(output, "lib", "private-simulator.js"));
await cp(resolve(root, "lib", "simulator-account.js"), resolve(output, "lib", "simulator-account.js"));
await cp(resolve(root, "lib", "simulator-i18n.js"), resolve(output, "lib", "simulator-i18n.js"));
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
