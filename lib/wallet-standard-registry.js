let registry;

export function getWalletRegistry() {
  if (registry) return registry;

  registry = createWalletRegistry(typeof window === "undefined" ? null : window);
  return registry;
}

export function createWalletRegistry(eventTarget) {

  const wallets = new Set();
  const listeners = { register: new Set(), unregister: new Set() };

  const register = (...candidates) => {
    const added = candidates.filter((wallet) => wallet && !wallets.has(wallet));
    added.forEach((wallet) => wallets.add(wallet));
    if (added.length) listeners.register.forEach((listener) => safeCall(listener, ...added));
    return () => {
      const removed = added.filter((wallet) => wallets.delete(wallet));
      if (removed.length) listeners.unregister.forEach((listener) => safeCall(listener, ...removed));
    };
  };

  const api = Object.freeze({ register });
  const walletRegistry = Object.freeze({
    get: () => Object.freeze([...wallets]),
    on(event, listener) {
      if (!listeners[event] || typeof listener !== "function") return () => {};
      listeners[event].add(listener);
      return () => listeners[event].delete(listener);
    }
  });

  if (eventTarget) {
    eventTarget.addEventListener("wallet-standard:register-wallet", (event) => {
      if (typeof event?.detail === "function") safeCall(event.detail, api);
    });
    eventTarget.dispatchEvent(walletEvent("wallet-standard:app-ready", api));
  }

  return walletRegistry;
}

export function walletEvent(type, detail) {
  if (typeof CustomEvent === "function") return new CustomEvent(type, { detail });
  const event = new Event(type);
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

function safeCall(callback, ...args) {
  try {
    return callback(...args);
  } catch {
    return undefined;
  }
}
