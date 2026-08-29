import { getWalletRegistry } from "./lib/wallet-standard-registry.js";
import {
  getCompatibleSolanaWallets,
  getSolanaAccount,
  sanitizeWalletName,
  shortenWalletAddress
} from "./lib/wallet-security.js";
import { walletLoginText, resolveWalletLoginLocale } from "./lib/wallet-login-locales.js";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa
} from "@solana-mobile/wallet-standard-mobile";

registerMobileWalletAdapterOnce();

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
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = wallets.length ? text("choose") : text("none");
    select.append(placeholder);
    wallets.forEach(({ name }, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.dataset.walletName = name;
      option.textContent = name;
      select.append(option);
    });
    const preferred = wallets.findIndex(({ name }) => /phantom/i.test(name));
    const prior = wallets.findIndex(({ name }) => name === priorName);
    if (!connectedWallet && wallets.length) select.value = String(prior >= 0 ? prior : preferred >= 0 ? preferred : 0);
    select.disabled = Boolean(connectedWallet);
    connectButton.disabled = !wallets.length || Boolean(connectedWallet);
  }

  async function connectWallet() {
    const selected = wallets[Number(select.value)];
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
      connectButton.disabled = !wallets.length;
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
    connectButton.disabled = !wallets.length;
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
})();

function registerMobileWalletAdapterOnce() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || window.__jamddmajMwaRegistered) return;
  try {
    registerMwa({
      appIdentity: { name: "JamdDmaj AI", uri: "https://www.jamddmaj.com", icon: "/icon-192.png" },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ["solana:devnet"],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler()
    });
    window.__jamddmajMwaRegistered = true;
  } catch {
    // Desktop injection and previously registered mobile adapters remain available.
  }
}
