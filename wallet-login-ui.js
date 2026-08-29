import { getWalletRegistry } from "./lib/wallet-standard-registry.js";
import {
  getCompatibleSolanaWallets,
  getSolanaAccount,
  sanitizeWalletName,
  shortenWalletAddress
} from "./lib/wallet-security.js";
import { walletLoginText, resolveWalletLoginLocale } from "./lib/wallet-login-locales.js";
import {
  buildPhantomConnectUrl,
  createPhantomConnectRequest,
  decryptPhantomConnectResponse
} from "./lib/phantom-deeplink.js";
(() => {
  const dialog = document.getElementById("walletLoginDialog");
  const openButtons = [document.getElementById("walletBtn"), document.getElementById("sideWalletBtn")].filter(Boolean);
  const closeButton = document.getElementById("walletCloseBtn");
  const select = document.getElementById("walletLoginSelect");
  const connectButton = document.getElementById("walletConnectBtn");
  const disconnectButton = document.getElementById("walletDisconnectBtn");
  const copyButton = document.getElementById("walletCopyBtn");
  const status = document.getElementById("walletLoginStatus");
  if (!dialog || !select || !connectButton) return;

  const registry = getWalletRegistry();
  let wallets = [];
  let connectedWallet = null;
  let connectedAccount = null;
  let removeWalletChangeListener = null;
  let pendingPhantomRequest = null;
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

  function text(key, replacements) {
    return walletLoginText(locale, key, replacements);
  }

  function openDialog() {
    refreshWallets();
    dialog.showModal();
  }

  function refreshWallets() {
    wallets = getCompatibleSolanaWallets([...registry.get()]);
    const priorName = select.selectedOptions?.[0]?.dataset?.walletName || "";
    const nativePhantom = isNativeApp();
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = wallets.length || nativePhantom ? text("choose") : text("none");
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
    const preferred = wallets.findIndex(({ name }) => /phantom/i.test(name));
    const prior = wallets.findIndex(({ name }) => name === priorName);
    if (!connectedWallet) {
      if (prior >= 0) select.value = `wallet:${prior}`;
      else if (preferred >= 0) select.value = `wallet:${preferred}`;
      else if (nativePhantom) select.value = "phantom-mobile";
      else if (wallets.length) select.value = "wallet:0";
    }
    select.disabled = Boolean(connectedWallet);
    connectButton.disabled = !hasConnectOption() || Boolean(connectedWallet);
  }

  async function connectWallet() {
    if (select.value === "phantom-mobile") return connectPhantomMobile();
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
      const browser = globalThis.Capacitor?.Plugins?.Browser;
      if (browser?.open) await browser.open({ url });
      else window.location.assign(url);
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
        renderConnection();
      });
    }
  }

  function clearConnection() {
    try { removeWalletChangeListener?.(); } catch { /* Provider cleanup is best effort. */ }
    removeWalletChangeListener = null;
    connectedWallet = null;
    connectedAccount = null;
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
    setStatus(text(connected ? "connected" : "idle"), connected ? "success" : "neutral");
  }

  function applyLocale() {
    document.querySelectorAll("[data-wallet-copy]").forEach((element) => {
      const key = element.dataset.walletCopy;
      if (key) element.textContent = text(key);
    });
    closeButton?.setAttribute("aria-label", text("close"));
  }

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function hasConnectOption() {
    return wallets.length > 0 || isNativeApp();
  }

  function isNativeApp() {
    try { return Boolean(globalThis.Capacitor?.isNativePlatform?.()); } catch { return false; }
  }
})();
