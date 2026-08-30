import { getWalletRegistry } from "./lib/wallet-standard-registry.js";
import {
  getCompatibleSolanaWallets,
  getSolanaAccount,
  sanitizeWalletName,
  shortenWalletAddress
} from "./lib/wallet-security.js";
import { walletLoginText, resolveWalletLoginLocale } from "./lib/wallet-login-locales.js";
import {
  buildPhantomBrowseUrl,
  buildPhantomConnectUrl,
  createPhantomConnectRequest,
  decryptPhantomConnectResponse
} from "./lib/phantom-deeplink.js";
import { buildSolflareBrowseUrl } from "./lib/solflare-deeplink.js";
(() => {
  const dialog = document.getElementById("walletLoginDialog");
  const marketWalletButton = document.getElementById("marketsWalletBtn");
  const marketWalletName = document.getElementById("marketsWalletName");
  const marketWalletStatus = document.getElementById("marketsWalletStatus");
  const openButtons = [document.getElementById("walletBtn"), document.getElementById("sideWalletBtn"), marketWalletButton].filter(Boolean);
  const closeButton = document.getElementById("walletCloseBtn");
  const select = document.getElementById("walletLoginSelect");
  const connectButton = document.getElementById("walletConnectBtn");
  const disconnectButton = document.getElementById("walletDisconnectBtn");
  const copyButton = document.getElementById("walletCopyBtn");
  const refreshBalanceButton = document.getElementById("walletRefreshBalanceBtn");
  const inspectButton = document.getElementById("walletInspectBtn");
  const inspectInput = document.getElementById("walletInspectAddress");
  const ownPortfolioButton = document.getElementById("walletOwnPortfolioBtn");
  const balance = document.getElementById("walletLoginBalance");
  const portfolioLabel = document.getElementById("walletPortfolioLabel");
  const portfolioList = document.getElementById("walletPortfolioList");
  const status = document.getElementById("walletLoginStatus");
  if (!dialog || !select || !connectButton) return;

  const registry = getWalletRegistry();
  let wallets = [];
  let connectedWallet = null;
  let connectedAccount = null;
  let removeWalletChangeListener = null;
  let pendingPhantomRequest = null;
  let portfolioController = null;
  let viewedAddress = "";
  let locale = resolveWalletLoginLocale(document.documentElement.lang);

  registry.on("register", refreshWallets);
  registry.on("unregister", refreshWallets);
  openButtons.forEach((button) => button.addEventListener("click", openDialog));
  closeButton?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  connectButton.addEventListener("click", connectWallet);
  disconnectButton?.addEventListener("click", disconnectWallet);
  copyButton?.addEventListener("click", copyAddress);
  refreshBalanceButton?.addEventListener("click", () => loadPortfolio(viewedAddress || connectedAccount?.address));
  inspectButton?.addEventListener("click", inspectPublicAddress);
  ownPortfolioButton?.addEventListener("click", () => loadPortfolio(connectedAccount?.address));
  window.addEventListener("jamddmaj:languagechange", (event) => {
    locale = resolveWalletLoginLocale(event.detail?.language || document.documentElement.lang);
    applyLocale();
    refreshWallets();
    renderConnection();
  });
  window.addEventListener("jamddmaj:wallet-connected", (event) => {
    if (event.detail?.source === "global") return;
    adoptConnection(event.detail?.wallet, event.detail?.account);
  });
  window.addEventListener("jamddmaj:wallet-disconnected", (event) => {
    if (event.detail?.source === "global") return;
    clearConnection();
    renderConnection();
  });

  applyLocale();
  refreshWallets();
  initializeNativePhantomCallback();
  initializeWalletBrowserEntry();

  function text(key, replacements) {
    return walletLoginText(locale, key, replacements);
  }

  function openDialog() {
    refreshWallets();
    dialog.showModal();
  }

  function refreshWallets() {
    wallets = getCompatibleSolanaWallets([...registry.get()]);
    const legacyPhantom = getLegacyPhantomWallet();
    if (legacyPhantom && !wallets.some(({ name }) => /phantom/i.test(name))) {
      wallets.unshift({ wallet: legacyPhantom, name: "Phantom" });
    }
    const priorName = select.selectedOptions?.[0]?.dataset?.walletName || "";
    const nativePhantom = isNativeApp();
    const mobileWebPhantom = isMobileWeb();
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = wallets.length || nativePhantom || mobileWebPhantom ? text("choose") : text("none");
    select.append(placeholder);
    wallets.forEach(({ name }, index) => {
      const option = document.createElement("option");
      option.value = `wallet:${index}`;
      option.dataset.walletName = name;
      option.textContent = name;
      select.append(option);
    });
    if (nativePhantom && !wallets.some(({ name }) => /phantom/i.test(name))) {
      const option = document.createElement("option");
      option.value = "phantom-mobile";
      option.dataset.walletName = "Phantom";
      option.textContent = "Phantom";
      select.append(option);
    }
    if (mobileWebPhantom && !wallets.some(({ name }) => /phantom/i.test(name))) {
      const option = document.createElement("option");
      option.value = "phantom-browser";
      option.dataset.walletName = "Phantom";
      option.textContent = "Phantom";
      select.append(option);
    }
    if (isMobileWeb() && !wallets.some(({ name }) => /solflare/i.test(name))) {
      const option = document.createElement("option");
      option.value = "solflare-browser";
      option.dataset.walletName = "Solflare";
      option.textContent = "Solflare";
      select.append(option);
    }
    const preferred = wallets.findIndex(({ name }) => /phantom/i.test(name));
    const prior = wallets.findIndex(({ name }) => name === priorName);
    if (!connectedWallet) {
      if (prior >= 0) select.value = `wallet:${prior}`;
      else if (preferred >= 0) select.value = `wallet:${preferred}`;
      else if (nativePhantom) select.value = "phantom-mobile";
      else if (mobileWebPhantom) select.value = "phantom-browser";
      else if (wallets.length) select.value = "wallet:0";
    }
    select.disabled = Boolean(connectedWallet);
    connectButton.disabled = !hasConnectOption() || Boolean(connectedWallet);
  }

  async function connectWallet() {
    if (select.value === "phantom-mobile") return connectPhantomMobile();
    if (select.value === "phantom-browser") return openInsidePhantom();
    if (select.value === "solflare-browser") return openInsideSolflare();
    const selectedIndex = /^wallet:(\d+)$/.exec(select.value)?.[1];
    const selected = selectedIndex === undefined ? null : wallets[Number(selectedIndex)];
    if (!selected) return setStatus(text("none"), "warning");
    connectButton.disabled = true;
    setStatus(text("waiting", { wallet: selected.name }), "pending");
    try {
      const result = await selected.wallet.features["standard:connect"].connect();
      const account = getSolanaAccount(result?.accounts || selected.wallet.accounts);
      if (!account) throw new Error("invalid-account");
      adoptConnection(selected.wallet, account);
      window.dispatchEvent(new CustomEvent("jamddmaj:wallet-connected", {
        detail: { wallet: selected.wallet, account, source: "global" }
      }));
      renderConnection();
    } catch (error) {
      clearConnection();
      const canceled = /reject|declin|cancel|denied|user/i.test(String(error?.message || error));
      setStatus(text(canceled ? "canceled" : "failed"), "error");
      connectButton.disabled = !hasConnectOption();
    }
  }

  function openInsidePhantom() {
    try {
      const url = buildPhantomBrowseUrl();
      connectButton.disabled = true;
      setStatus(text("waiting", { wallet: "Phantom" }), "pending");
      window.location.assign(url);
    } catch {
      connectButton.disabled = !hasConnectOption();
      setStatus(text("failed"), "error");
    }
  }

  function openInsideSolflare() {
    try {
      connectButton.disabled = true;
      setStatus(text("waiting", { wallet: "Solflare" }), "pending");
      window.location.assign(buildSolflareBrowseUrl());
    } catch {
      connectButton.disabled = !hasConnectOption();
      setStatus(text("failed"), "error");
    }
  }

  function getLegacyPhantomWallet() {
    const provider = globalThis.phantom?.solana;
    if (!provider?.isPhantom || typeof provider.connect !== "function") return null;
    const chains = Object.freeze(["solana:mainnet", "solana:devnet"]);
    return Object.freeze({
      name: "Phantom",
      chains,
      accounts: Object.freeze([]),
      features: Object.freeze({
        "standard:connect": Object.freeze({
          version: "1.0.0",
          connect: async () => {
            const result = await provider.connect();
            const address = String(result?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "");
            return { accounts: [{ address, chains, features: [] }] };
          }
        })
      })
    });
  }

  function initializeWalletBrowserEntry() {
    if (isNativeApp()) return;
    let requested = "";
    try { requested = new URL(window.location.href).searchParams.get("wallet_connect") || ""; } catch { /* Ignore malformed locations. */ }
    if (!/^(phantom|solflare)$/.test(requested)) return;
    setTimeout(() => {
      refreshWallets();
      if (!dialog.open) dialog.showModal();
    }, 600);
  }

  async function connectPhantomMobile() {
    if (!isNativeApp()) return setStatus(text("none"), "warning");
    clearPendingPhantomRequest();
    try {
      pendingPhantomRequest = createPhantomConnectRequest();
      const url = buildPhantomConnectUrl({
        publicKey: pendingPhantomRequest.publicKey,
        requestId: pendingPhantomRequest.requestId
      });
      connectButton.disabled = true;
      setStatus(text("waiting", { wallet: "Phantom" }), "pending");
      const platform = globalThis.Capacitor?.getPlatform?.();
      const launcher = globalThis.Capacitor?.Plugins?.ExternalWallet;
      if (platform === "android") {
        if (!launcher?.openPhantom) throw new Error("native-phantom-launcher-unavailable");
        await launcher.openPhantom({ url });
      } else {
        window.location.assign(url);
      }
    } catch {
      clearPendingPhantomRequest();
      connectButton.disabled = !hasConnectOption();
      setStatus(text("failed"), "error");
    }
  }

  async function initializeNativePhantomCallback() {
    if (!isNativeApp()) return;
    const app = globalThis.Capacitor?.Plugins?.App;
    if (!app?.addListener) return;
    await app.addListener("appUrlOpen", ({ url }) => handlePhantomCallback(url));
    try {
      const launch = await app.getLaunchUrl?.();
      if (launch?.url?.startsWith("jamddmaj://phantom")) await handlePhantomCallback(launch.url);
    } catch {
      // A cold-start callback without an in-memory key must be retried safely.
    }
  }

  async function handlePhantomCallback(url) {
    if (!String(url || "").startsWith("jamddmaj://phantom")) return;
    try { await globalThis.Capacitor?.Plugins?.Browser?.close?.(); } catch { /* The tab may already be closed. */ }
    if (!dialog.open) dialog.showModal();
    const request = pendingPhantomRequest;
    try {
      const result = decryptPhantomConnectResponse(url, request);
      const account = getSolanaAccount([{
        address: result.publicKey,
        chains: ["solana:mainnet", "solana:devnet"],
        features: []
      }]);
      if (!account) throw new Error("invalid-account");
      const wallet = Object.freeze({ name: "Phantom", chains: account.chains, features: {} });
      adoptConnection(wallet, account);
      window.dispatchEvent(new CustomEvent("jamddmaj:wallet-connected", {
        detail: { wallet, account, source: "global" }
      }));
      renderConnection();
    } catch (error) {
      clearConnection();
      const canceled = Boolean(error?.code) || /reject|declin|cancel|denied|user/i.test(String(error?.message || error));
      setStatus(text(canceled ? "canceled" : "failed"), "error");
      connectButton.disabled = !hasConnectOption();
    } finally {
      clearPendingPhantomRequest();
    }
  }

  async function disconnectWallet() {
    const wallet = connectedWallet;
    clearConnection();
    try {
      await wallet?.features?.["standard:disconnect"]?.disconnect?.();
    } catch {
      // The local connection is still removed if the provider cannot disconnect cleanly.
    }
    window.dispatchEvent(new CustomEvent("jamddmaj:wallet-disconnected", { detail: { source: "global" } }));
    renderConnection();
  }

  function adoptConnection(wallet, account) {
    if (!wallet || !getSolanaAccount([account])) return;
    clearConnection();
    connectedWallet = wallet;
    connectedAccount = account;
    viewedAddress = account.address;
    const events = wallet.features?.["standard:events"];
    if (events?.on) {
      removeWalletChangeListener = events.on("change", ({ accounts }) => {
        const nextAccount = getSolanaAccount(accounts);
        if (!nextAccount) {
          clearConnection();
          renderConnection();
          return;
        }
        connectedAccount = nextAccount;
        viewedAddress = nextAccount.address;
        loadPortfolio(nextAccount.address);
        renderConnection();
      });
    }
  }

  function clearConnection() {
    try { removeWalletChangeListener?.(); } catch { /* Provider cleanup is best effort. */ }
    removeWalletChangeListener = null;
    connectedWallet = null;
    connectedAccount = null;
    viewedAddress = "";
    portfolioController?.abort();
    portfolioController = null;
  }

  function clearPendingPhantomRequest() {
    try { pendingPhantomRequest?.secretKey?.fill?.(0); } catch { /* Ephemeral key cleanup is best effort. */ }
    pendingPhantomRequest = null;
  }

  async function copyAddress() {
    if (!connectedAccount?.address || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(connectedAccount.address);
      setStatus(text("copied"), "success");
    } catch {
      setStatus(text("failed"), "error");
    }
  }

  async function inspectPublicAddress() {
    const address = String(inspectInput?.value || "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return setStatus(text("invalidAddress"), "error");
    }
    await loadPortfolio(address);
  }

  async function loadPortfolio(address) {
    const publicAddress = String(address || "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicAddress)) return;
    portfolioController?.abort();
    portfolioController = new AbortController();
    viewedAddress = publicAddress;
    const own = publicAddress === connectedAccount?.address;
    if (portfolioLabel) portfolioLabel.textContent = text(own ? "ownPortfolio" : "watching", { address: shortenWalletAddress(publicAddress) });
    if (portfolioList) portfolioList.textContent = text("loadingBalance");
    refreshBalanceButton && (refreshBalanceButton.disabled = true);
    try {
      const response = await fetch(`/api/solana-portfolio?address=${encodeURIComponent(publicAddress)}`, {
        signal: portfolioController.signal,
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error?.message || "portfolio-unavailable");
      renderPortfolio(data, own);
      setStatus(own ? text("connected") : text("watchOnly"), "success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (portfolioList) portfolioList.textContent = text("balanceFailed");
      if (own && balance) balance.textContent = "—";
      setStatus(text("balanceFailed"), "error");
    } finally {
      if (refreshBalanceButton) refreshBalanceButton.disabled = false;
    }
  }

  function renderPortfolio(data, own) {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
    const estimate = money.format(Number(data.estimatedValueUsd) || 0);
    if (own && balance) balance.textContent = estimate;
    if (own && marketWalletStatus && connectedAccount) {
      marketWalletStatus.textContent = `${shortenWalletAddress(connectedAccount.address)} · ${estimate}`;
    }
    if (!portfolioList) return;
    portfolioList.replaceChildren();
    const solRow = portfolioRow("SOL", `${amount.format(Number(data.sol?.amount) || 0)} SOL`, money.format(Number(data.sol?.valueUsd) || 0));
    portfolioList.append(solRow);
    (Array.isArray(data.tokens) ? data.tokens : []).slice(0, 30).forEach((token) => {
      const value = Number(token.valueUsd) > 0 ? money.format(token.valueUsd) : text("unpriced");
      portfolioList.append(portfolioRow(token.symbol, amount.format(token.amount), value));
    });
    if (!data.tokens?.length && Number(data.sol?.amount || 0) === 0) {
      portfolioList.replaceChildren(document.createTextNode(text("noAssets")));
    }
    if (ownPortfolioButton) ownPortfolioButton.hidden = own || !connectedAccount;
  }

  function portfolioRow(symbol, tokenAmount, usdValue) {
    const row = document.createElement("div");
    row.className = "wallet-asset-row";
    const name = document.createElement("strong");
    name.textContent = String(symbol || "Token").slice(0, 20);
    const quantity = document.createElement("span");
    quantity.textContent = tokenAmount;
    const value = document.createElement("span");
    value.textContent = usdValue;
    row.append(name, quantity, value);
    return row;
  }

  function renderConnection() {
    const connected = Boolean(connectedWallet && connectedAccount);
    select.disabled = connected;
    connectButton.hidden = connected;
    connectButton.disabled = !hasConnectOption();
    if (disconnectButton) disconnectButton.hidden = !connected;
    if (copyButton) copyButton.hidden = !connected;
    const name = document.getElementById("walletLoginName");
    const address = document.getElementById("walletLoginAddress");
    if (name) name.textContent = connected ? sanitizeWalletName(connectedWallet.name) : text("notConnected");
    if (address) address.textContent = connected ? shortenWalletAddress(connectedAccount.address) : "—";
    openButtons.forEach((button) => {
      button.classList.toggle("active", connected);
      button.dataset.connected = String(connected);
      const label = button.querySelector("[data-wallet-button-label]");
      if (label) label.textContent = connected ? shortenWalletAddress(connectedAccount.address) : text("wallet");
    });
    if (marketWalletName) marketWalletName.textContent = connected ? sanitizeWalletName(connectedWallet.name) : "Phantom";
    if (marketWalletStatus) marketWalletStatus.textContent = connected
      ? `${shortenWalletAddress(connectedAccount.address)}${balance?.textContent && balance.textContent !== "—" ? ` · ${balance.textContent}` : ""}`
      : text("notConnected");
    marketWalletButton?.setAttribute("aria-label", connected
      ? `${sanitizeWalletName(connectedWallet.name)} ${shortenWalletAddress(connectedAccount.address)}`
      : `${text("wallet")}: ${text("notConnected")}`);
    setStatus(text(connected ? "connected" : "idle"), connected ? "success" : "neutral");
    if (connected) loadPortfolio(connectedAccount.address);
    else {
      if (balance) balance.textContent = "—";
      if (portfolioLabel) portfolioLabel.textContent = text("holdings");
      if (portfolioList) portfolioList.textContent = text("connectForBalance");
    }
  }

  function applyLocale() {
    document.querySelectorAll("[data-wallet-copy]").forEach((element) => {
      const key = element.dataset.walletCopy;
      if (key) element.textContent = text(key);
    });
    closeButton?.setAttribute("aria-label", text("close"));
    document.querySelectorAll("[data-wallet-placeholder]").forEach((element) => {
      const key = element.dataset.walletPlaceholder;
      if (key) element.setAttribute("placeholder", text(key));
    });
    if (!connectedAccount && marketWalletStatus) marketWalletStatus.textContent = text("notConnected");
  }

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function hasConnectOption() {
    return wallets.length > 0 || isNativeApp() || isMobileWeb();
  }

  function isMobileWeb() {
    if (isNativeApp()) return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(String(globalThis.navigator?.userAgent || ""));
  }

  function isNativeApp() {
    try { return Boolean(globalThis.Capacitor?.isNativePlatform?.()); } catch { return false; }
  }
})();
