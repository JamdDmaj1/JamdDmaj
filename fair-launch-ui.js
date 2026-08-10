import {
  FAIR_LAUNCH_DEFAULTS,
  assessFairLaunch,
  buildFairLaunchManifest,
  calculateFairLaunchVesting,
  normalizeFairLaunchDraft
} from "./lib/fair-launch.js";
import { buildBoostPlan } from "./lib/fair-launch-boost.js";
import { verifyFairLaunchOnDevnet } from "./lib/fair-launch-devnet-verifier.js";
import { fairLaunchText, resolveFairLaunchLocale } from "./lib/fair-launch-locales.js";
import { fairLaunchVerifierText } from "./lib/fair-launch-verifier-locales.js";
import { fairLaunchUiText, resolveFairLaunchUiLocale } from "./lib/fair-launch-ui-copy.js";
import {
  checkDevnetProtectionProgram,
  createFixedSupplyTokenOnDevnet,
  validateDevnetTokenRequest
} from "./lib/solana-devnet-token.js";
import { getWalletRegistry } from "./lib/wallet-standard-registry.js";
import {
  getCompatibleSolanaWallets,
  getSolanaAccount,
  sanitizeWalletName,
  shortenWalletAddress
} from "./lib/wallet-security.js";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa
} from "@solana-mobile/wallet-standard-mobile";

registerMobileWalletAdapter();

const ASSESSMENT_LABEL_KEYS = Object.freeze({
  "creator-lock": "checkCreatorLock",
  "early-holder-lock": "checkEarlyLock",
  cliff: "checkCliff",
  "gradual-release": "checkGradual",
  "liquidity-lock": "checkLiquidity",
  "mint-authority": "checkMint",
  "freeze-authority": "checkFreeze",
  "immutable-metadata": "checkMetadata",
  multisig: "checkMultisig",
  audit: "checkAudit",
  "wallet-cap": "checkWalletCap",
  "anti-sybil": "checkAntiSybil"
});

const VERIFIER_LABEL_KEYS = Object.freeze({
  cluster: "verifyCluster",
  "token-program": "verifyTokenProgram",
  "mint-initialized": "verifyInitialized",
  "mint-authority": "verifyMintAuthority",
  "freeze-authority": "verifyFreezeAuthority",
  "policy-program": "verifyPolicyProgram",
  "policy-mint": "verifyPolicyMint",
  "minimum-lock": "verifyMinimumLock",
  participants: "verifyParticipants",
  "eligibility-root": "verifyEligibilityRoot",
  "creator-vesting": "verifyCreatorVesting",
  "creator-vault": "verifyCreatorVault",
  cliff: "verifyCliff",
  release: "verifyRelease",
  liquidity: "verifyLiquidity",
  timelock: "verifyTimelock"
});

(() => {
  const STORAGE_KEY = "jamdV1FairLaunchDraft";
  const launchButton = document.getElementById("fairLaunchBtn");
  const launchView = document.getElementById("fairLaunchView");
  const form = document.getElementById("fairLaunchForm");
  if (!launchButton || !launchView || !form) return;

  let active = false;
  let previousUi = null;
  let latestManifest = null;
  let latestManifestHash = "";
  let compatibleWallets = [];
  let connectedWallet = null;
  let connectedAccount = null;
  let removeWalletChangeListener = null;
  let currentStep = 0;
  let locale = resolveFairLaunchLocale(document.documentElement.lang);
  let devnetVerified = false;
  let protectionProgramAvailable = false;
  let protectionProgramChecked = false;
  const stepPanels = [...form.querySelectorAll("[data-fair-step]")];
  const stepButtons = [...form.querySelectorAll("[data-fair-step-target]")];

  const walletRegistry = getWalletRegistry();
  const walletSelect = document.getElementById("fairWalletSelect");
  const connectWalletButton = document.getElementById("fairConnectWalletBtn");
  const disconnectWalletButton = document.getElementById("fairDisconnectWalletBtn");
  const copyWalletButton = document.getElementById("fairCopyWalletBtn");
  const walletStatus = document.getElementById("fairWalletStatus");
  const devnetConfirm = document.getElementById("fairDevnetConfirm");
  const createDevnetButton = document.getElementById("fairCreateDevnetTokenBtn");
  const verifyDevnetButton = document.getElementById("fairVerifyDevnetBtn");
  const walletCard = document.getElementById("fairWalletCard");

  const fields = {
    projectName: document.getElementById("fairProjectName"),
    symbol: document.getElementById("fairSymbol"),
    purpose: document.getElementById("fairPurpose"),
    logoUrl: document.getElementById("fairLogoUrl"),
    bannerUrl: document.getElementById("fairBannerUrl"),
    websiteUrl: document.getElementById("fairWebsiteUrl"),
    xUrl: document.getElementById("fairXUrl"),
    telegramUrl: document.getElementById("fairTelegramUrl"),
    discordUrl: document.getElementById("fairDiscordUrl"),
    network: document.getElementById("fairNetwork"),
    totalSupply: document.getElementById("fairSupply"),
    decimals: document.getElementById("fairDecimals"),
    startingPriceUsd: document.getElementById("fairStartPrice"),
    creatorContributionUsd: document.getElementById("fairCreatorContribution"),
    creatorLockPercent: document.getElementById("fairCreatorLock"),
    earlyHolderCount: document.getElementById("fairHolderCount"),
    holderLockPercent: document.getElementById("fairHolderLock"),
    cliffMonths: document.getElementById("fairCliffMonths"),
    releaseMonths: document.getElementById("fairReleaseMonths"),
    liquidityLockMonths: document.getElementById("fairLiquidityLock"),
    maxWalletPercent: document.getElementById("fairMaxWallet"),
    revokeMintAuthority: document.getElementById("fairRevokeMint"),
    disableFreezeAuthority: document.getElementById("fairDisableFreeze"),
    immutableMetadata: document.getElementById("fairImmutableMetadata"),
    multisigTimelock: document.getElementById("fairMultisig"),
    auditRequired: document.getElementById("fairAuditRequired"),
    antiSybilEligibility: document.getElementById("fairAntiSybil")
  };

  const hiddenTargets = [
    document.getElementById("traderView"),
    document.getElementById("learnView"),
    document.querySelector(".learning-session-bar"),
    document.getElementById("messages"),
    document.querySelector(".composer-wrap"),
    document.getElementById("ticker")
  ].filter(Boolean);

  const savedDraft = loadDraft();
  populateForm(savedDraft);
  populateBoostPlan(savedDraft.boost);
  updatePlan(false);
  refreshWalletOptions();
  refreshProtectionProgramStatus();

  walletRegistry.on("register", refreshWalletOptions);
  walletRegistry.on("unregister", refreshWalletOptions);
  connectWalletButton?.addEventListener("click", connectSelectedWallet);
  disconnectWalletButton?.addEventListener("click", disconnectWallet);
  copyWalletButton?.addEventListener("click", copyWalletAddress);
  createDevnetButton?.addEventListener("click", createDevnetToken);
  verifyDevnetButton?.addEventListener("click", verifyPublicDevnetPolicy);
  devnetConfirm?.addEventListener("change", updateDevnetReadiness);
  document.getElementById("fairPrevStepBtn")?.addEventListener("click", () => showStep(currentStep - 1));
  document.getElementById("fairNextStepBtn")?.addEventListener("click", () => {
    if (validateCurrentStep()) showStep(currentStep + 1);
  });
  stepButtons.forEach((button) => button.addEventListener("click", () => showStep(Number(button.dataset.fairStepTarget))));
  configureMobileWalletLinks();
  showStep(0, false);
  applyFairLaunchLocale();
  window.addEventListener("jamddmaj:languagechange", (event) => {
    locale = resolveFairLaunchLocale(event.detail?.language || document.documentElement.lang);
    applyFairLaunchLocale();
  });

  launchButton.addEventListener("click", () => active ? exitFairLaunch(true) : enterFairLaunch());
  document.getElementById("exitFairLaunchBtn").addEventListener("click", () => exitFairLaunch(true));
  document.getElementById("generateFairPlanBtn").addEventListener("click", () => updatePlan(true));
  document.getElementById("resetFairPlanBtn").addEventListener("click", resetPlan);
  document.getElementById("downloadFairManifestBtn").addEventListener("click", downloadManifest);
  document.getElementById("fairVestingMonth").addEventListener("input", renderVestingPreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    updatePlan(true);
  });
  form.addEventListener("input", () => {
    persistDraft(readForm());
    updatePlan(false);
  });
  form.addEventListener("change", () => {
    persistDraft(readForm());
    updatePlan(false);
  });

  if (new URLSearchParams(window.location.search).get("view") === "fair-launch") enterFairLaunch();

  ["newChatBtn", "learnBtn", "sideLearnBtn", "marketsBtn", "settingsBtn", "topSettingsBtn"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", () => {
      if (active) exitFairLaunch(false);
    });
  });

  function enterFairLaunch() {
    previousUi = {
      targets: hiddenTargets.map((element) => ({
        element,
        hidden: element.hidden,
        classHidden: element.classList.contains("is-hidden")
      })),
      title: document.getElementById("chatTitle")?.textContent || "",
      model: document.getElementById("modelLabel")?.textContent || ""
    };
    active = true;
    hiddenTargets.forEach((element) => {
      element.hidden = true;
      element.classList.add("is-hidden");
    });
    launchView.hidden = false;
    launchView.classList.remove("is-hidden");
    document.body.classList.add("fair-launch-mode");
    launchButton.classList.add("active");
    launchButton.textContent = "Fair Launch ✓";
    const title = document.getElementById("chatTitle");
    const model = document.getElementById("modelLabel");
    if (title) title.textContent = "Fair Launch Lab";
    if (model) model.textContent = ui("modelLabel");
    launchView.scrollTop = 0;
    updatePlan(false);
  }

  function exitFairLaunch(restorePrevious) {
    active = false;
    launchView.hidden = true;
    launchView.classList.add("is-hidden");
    document.body.classList.remove("fair-launch-mode");
    launchButton.classList.remove("active");
    launchButton.textContent = "Fair Launch";
    if (restorePrevious && previousUi) {
      previousUi.targets.forEach(({ element, hidden, classHidden }) => {
        element.hidden = hidden;
        element.classList.toggle("is-hidden", classHidden);
      });
      const title = document.getElementById("chatTitle");
      const model = document.getElementById("modelLabel");
      if (title) title.textContent = previousUi.title;
      if (model) model.textContent = previousUi.model;
    }
    previousUi = null;
  }

  function readForm() {
    const value = {};
    for (const [key, element] of Object.entries(fields)) {
      value[key] = element.type === "checkbox" ? element.checked : element.value;
    }
    return normalizeFairLaunchDraft(value);
  }

  function populateForm(value) {
    const draft = normalizeFairLaunchDraft(value);
    for (const [key, element] of Object.entries(fields)) {
      if (element.type === "checkbox") element.checked = draft[key] === true;
      else element.value = String(draft[key]);
    }
  }

  function populateBoostPlan(value = {}) {
    const stage = document.getElementById("fairBoostStage");
    const days = document.getElementById("fairBoostDays");
    if (stage) stage.value = value?.stage === "after" ? "after" : "before";
    if (days) days.value = String(Math.min(30, Math.max(1, Number(value?.days) || 7)));
    const selected = new Set(Array.isArray(value?.services)
      ? value.services.map((item) => typeof item === "string" ? item : item?.key)
      : []);
    document.querySelectorAll('input[name="fairBoostService"]').forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  async function updatePlan(announce) {
    const config = readForm();
    const boost = readBoostPlan();
    updateBoostAvailability(boost.stage);
    latestManifest = { ...buildFairLaunchManifest(config), platformBoost: boost };
    latestManifestHash = await sha256(JSON.stringify(latestManifest));
    const assessment = assessFairLaunch(config);
    const creatorTokens = latestManifest.protection.creator.estimatedTokensAtStartingPrice;
    const creatorLocked = creatorTokens * (config.creatorLockPercent / 100);

    document.getElementById("fairSecurityScore").textContent = t("designScore", { score: assessment.score });
    document.getElementById("fairSecurityGrade").textContent = assessment.grade;
    document.getElementById("fairReadiness").textContent = assessment.readyForAudit
      ? t("designCompliant")
      : ui("blockers", { count: assessment.blockers.length });
    document.getElementById("fairCreatorPreview").textContent = ui("creatorLocked", { locked: formatNumber(creatorLocked), total: formatNumber(creatorTokens), symbol: config.symbol });
    document.getElementById("fairHolderPreview").textContent = ui("participantsLocked", { count: config.earlyHolderCount.toLocaleString(), percent: config.holderLockPercent });
    document.getElementById("fairLiquidityPreview").textContent = ui("liquidityLocked", { months: config.liquidityLockMonths });
    document.getElementById("fairManifestHash").textContent = latestManifestHash ? `SHA-256 ${latestManifestHash}` : ui("hashUnavailable");
    document.getElementById("downloadFairManifestBtn").disabled = false;
    document.getElementById("fairPlanStatus").textContent = announce
      ? ui("planGenerated")
      : ui("localPreview");
    document.getElementById("fairBoostPreview").textContent = boost.services.length
      ? ui("boostSelected", { services: boost.services.length, days: boost.days, credits: boost.totalCredits })
      : ui("noBoost");

    const checklist = document.getElementById("fairSecurityChecks");
    checklist.replaceChildren();
    assessment.checks.forEach((item) => {
      const row = document.createElement("li");
      row.dataset.passed = String(item.passed);
      const marker = document.createElement("span");
      marker.textContent = item.passed ? "✓" : "!";
      const label = document.createElement("span");
      label.textContent = ui(ASSESSMENT_LABEL_KEYS[item.id]) || item.label;
      row.append(marker, label);
      checklist.append(row);
    });
    renderVestingPreview();
    renderTransactionPreview(config);
    updateDevnetReadiness();
  }

  function showStep(requestedStep, focus = true) {
    const lastStep = Math.max(0, stepPanels.length - 1);
    currentStep = Math.min(lastStep, Math.max(0, Number(requestedStep) || 0));
    stepPanels.forEach((panel, index) => {
      panel.hidden = index !== currentStep;
    });
    stepButtons.forEach((button, index) => {
      if (index === currentStep) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    const previous = document.getElementById("fairPrevStepBtn");
    const next = document.getElementById("fairNextStepBtn");
    if (previous) previous.disabled = currentStep === 0;
    if (next) next.hidden = currentStep === lastStep;
    if (walletCard) walletCard.hidden = currentStep !== lastStep;
    const progress = document.getElementById("fairStepProgress");
    if (progress) progress.textContent = t("progress", { current: currentStep + 1, total: stepPanels.length });
    if (active) {
      const title = document.getElementById("chatTitle");
      const model = document.getElementById("modelLabel");
      if (title) title.textContent = "Fair Launch Lab";
      if (model) model.textContent = ui("modelLabel");
    }
    if (focus) {
      stepPanels[currentStep]?.querySelector("input:not([disabled]), textarea, select, button")?.focus({ preventScroll: true });
      stepPanels[currentStep]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderTransactionPreview(config = readForm()) {
    const supply = document.getElementById("fairTxSupply");
    const recipient = document.getElementById("fairTxRecipient");
    if (supply) supply.textContent = `${formatNumber(config.totalSupply)} ${config.symbol}`;
    if (recipient) recipient.textContent = connectedAccount?.address
      ? shortenWalletAddress(connectedAccount.address)
      : t("walletNotConnected");
  }

  function applyFairLaunchLocale() {
    const displayLocale = resolveFairLaunchUiLocale(locale);
    launchView.lang = displayLocale;
    launchView.dir = "ltr";
    launchView.querySelectorAll("[data-fl-key]").forEach((element) => {
      if (element.id === "fairDevnetBadgeText" && devnetVerified) element.textContent = t("devnetVerified");
      else element.textContent = t(element.dataset.flKey);
    });
    launchView.querySelectorAll("[data-fl-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.flAria));
    });
    launchView.querySelectorAll("[data-fl-verify-key]").forEach((element) => {
      element.textContent = fairLaunchVerifierText(displayLocale, element.dataset.flVerifyKey);
    });
    launchView.querySelectorAll("[data-fl-ui]").forEach((element) => {
      if (["fairWalletName", "fairWalletAddress", "fairWalletStatus", "fairBoostPreview"].includes(element.id)) return;
      element.textContent = ui(element.dataset.flUi);
    });
    launchView.querySelectorAll("[data-fl-ui-aria]").forEach((element) => {
      element.setAttribute("aria-label", ui(element.dataset.flUiAria));
    });
    showStep(currentStep, false);
    renderTransactionPreview();
    updatePlan(false);
    renderWalletConnection();
  }

  async function verifyPublicDevnetPolicy() {
    const mintInput = document.getElementById("fairVerifyMint");
    const policyInput = document.getElementById("fairVerifyPolicy");
    const status = document.getElementById("fairVerifyStatus");
    const checks = document.getElementById("fairVerifyChecks");
    const explorer = document.getElementById("fairVerifyExplorer");
    if (!verifyDevnetButton || !status || !checks || !explorer) return;

    verifyDevnetButton.disabled = true;
    checks.hidden = true;
    checks.replaceChildren();
    explorer.hidden = true;
    status.dataset.state = "pending";
    status.textContent = fairLaunchVerifierText(resolveFairLaunchUiLocale(locale), "running");
    try {
      const result = await verifyFairLaunchOnDevnet({
        mintAddress: mintInput?.value,
        policyAddress: policyInput?.value
      });
      result.checks.forEach((item) => {
        const row = document.createElement("li");
        row.dataset.passed = String(item.passed);
        const marker = document.createElement("span");
        marker.textContent = item.passed ? "✓" : "!";
        const label = document.createElement("span");
        label.textContent = ui(VERIFIER_LABEL_KEYS[item.id]) || item.label;
        row.append(marker, label);
        checks.append(row);
      });
      checks.hidden = false;
      status.dataset.state = result.verified ? "safe" : "error";
      status.textContent = result.verified
        ? fairLaunchVerifierText(resolveFairLaunchUiLocale(locale), "success")
        : `${fairLaunchVerifierText(resolveFairLaunchUiLocale(locale), "failure")}: ${result.checks.filter((item) => !item.passed).length}`;
      explorer.href = `https://explorer.solana.com/address/${encodeURIComponent(result.policyAddress)}?cluster=devnet`;
      explorer.hidden = false;
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = `${fairLaunchVerifierText(resolveFairLaunchUiLocale(locale), "failure")}: ${String(error?.message || error)}`;
    } finally {
      verifyDevnetButton.disabled = false;
    }
  }

  function t(key, variables) {
    return fairLaunchText(resolveFairLaunchUiLocale(locale), key, variables);
  }

  function ui(key, variables) {
    return fairLaunchUiText(resolveFairLaunchUiLocale(locale), key, variables);
  }

  function validateCurrentStep() {
    const panel = stepPanels[currentStep];
    if (!panel) return true;
    const required = [...panel.querySelectorAll("input[required], textarea[required], select[required]")];
    for (const input of required) {
      if (!input.checkValidity()) {
        input.setCustomValidity(ui("validationRequired"));
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
        return false;
      }
    }
    const urls = [...panel.querySelectorAll('input[type="url"]')];
    for (const input of urls) {
      const value = input.value.trim();
      if (!value) continue;
      let valid = false;
      try { valid = new URL(value).protocol === "https:"; } catch {}
      if (!valid) {
        input.setCustomValidity(ui("invalidHttps"));
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
        return false;
      }
    }
    return true;
  }

  function readBoostPlan() {
    return buildBoostPlan({
      stage: document.getElementById("fairBoostStage")?.value,
      days: document.getElementById("fairBoostDays")?.value,
      services: [...document.querySelectorAll('input[name="fairBoostService"]:checked')].map((input) => input.value)
    });
  }

  function updateBoostAvailability(stage) {
    const analytics = document.querySelector('input[name="fairBoostService"][value="analytics"]');
    if (!analytics) return;
    analytics.disabled = stage !== "after";
    if (analytics.disabled) analytics.checked = false;
    analytics.closest("label")?.toggleAttribute("data-disabled", analytics.disabled);
    analytics.closest("label")?.setAttribute("title", analytics.disabled
      ? ui("afterToken")
      : ui("forCreatedTokens"));
  }

  function renderVestingPreview() {
    const month = Number(document.getElementById("fairVestingMonth").value || 0);
    const vesting = calculateFairLaunchVesting(readForm(), month);
    document.getElementById("fairVestingMonthLabel").textContent = ui("month", { month: Math.round(vesting.month) });
    document.getElementById("fairLiquidPercent").textContent = ui("liquid", { percent: vesting.liquidPercent.toFixed(2) });
    document.getElementById("fairLockedPercent").textContent = ui("locked", { percent: vesting.lockedPercent.toFixed(2) });
    document.getElementById("fairVestingBar").style.width = `${vesting.liquidPercent}%`;
  }

  function resetPlan() {
    if (!window.confirm(ui("resetConfirm"))) return;
    populateForm(FAIR_LAUNCH_DEFAULTS);
    populateBoostPlan();
    persistDraft(FAIR_LAUNCH_DEFAULTS);
    document.getElementById("fairVestingMonth").value = "0";
    updatePlan(true);
  }

  function downloadManifest() {
    if (!latestManifest) return;
    const exportValue = { ...latestManifest, manifestSha256: latestManifestHash };
    const blob = new Blob([JSON.stringify(exportValue, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${latestManifest.token.symbol.toLowerCase()}-fair-launch-manifest.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || FAIR_LAUNCH_DEFAULTS;
    } catch {
      return FAIR_LAUNCH_DEFAULTS;
    }
  }

  function persistDraft(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...normalizeFairLaunchDraft(value),
        boost: readBoostPlan()
      }));
    } catch {
      document.getElementById("fairPlanStatus").textContent = ui("draftSaveFailed");
    }
  }

  async function sha256(value) {
    if (!globalThis.crypto?.subtle) return "";
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function refreshWalletOptions() {
    if (!walletSelect) return;
    compatibleWallets = getCompatibleSolanaWallets([...walletRegistry.get()]);
    walletSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = compatibleWallets.length
      ? ui("selectWallet")
      : ui("noWallets");
    walletSelect.append(placeholder);
    compatibleWallets.forEach(({ name }, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = name;
      walletSelect.append(option);
    });
    connectWalletButton.disabled = compatibleWallets.length === 0;
    updateDevnetReadiness();
  }

  async function connectSelectedWallet() {
    if (connectedWallet) return;
    const selected = compatibleWallets[Number(walletSelect?.value)];
    if (!selected || walletSelect?.value === "") {
      setWalletStatus(ui("selectWalletFirst"), "warning");
      return;
    }
    connectWalletButton.disabled = true;
    setWalletStatus(ui("waitingWallet", { wallet: selected.name }), "pending");
    try {
      const result = await selected.wallet.features["standard:connect"].connect();
      const account = getSolanaAccount(result?.accounts || selected.wallet.accounts);
      if (!account) throw new Error(ui("invalidWalletAccount"));
      connectedWallet = selected.wallet;
      connectedAccount = account;
      subscribeToWalletChanges(selected.wallet);
      renderWalletConnection();
    } catch (error) {
      connectedWallet = null;
      connectedAccount = null;
      const rejected = /reject|declin|cancel|denied|user/i.test(String(error?.message || error));
      setWalletStatus(rejected
        ? ui("connectCanceled")
        : ui("connectFailed"), "error");
      connectWalletButton.disabled = false;
    }
  }

  async function disconnectWallet() {
    const wallet = connectedWallet;
    clearWalletChangeListener();
    connectedWallet = null;
    connectedAccount = null;
    try {
      await wallet?.features?.["standard:disconnect"]?.disconnect?.();
    } catch {
      // Local state is still cleared when a provider cannot disconnect cleanly.
    }
    renderWalletConnection();
    setWalletStatus(ui("walletDisconnected"), "success");
  }

  async function copyWalletAddress() {
    if (!connectedAccount?.address || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(connectedAccount.address);
      setWalletStatus(ui("addressCopied"), "success");
    } catch {
      setWalletStatus(ui("copyFailed"), "error");
    }
  }

  function subscribeToWalletChanges(wallet) {
    clearWalletChangeListener();
    const events = wallet?.features?.["standard:events"];
    if (!events?.on) return;
    removeWalletChangeListener = events.on("change", ({ accounts }) => {
      const account = getSolanaAccount(accounts);
      if (!account) {
        disconnectWallet();
        return;
      }
      connectedAccount = account;
      renderWalletConnection();
    });
  }

  function clearWalletChangeListener() {
    try {
      removeWalletChangeListener?.();
    } catch {
      // Ignore provider cleanup errors.
    }
    removeWalletChangeListener = null;
  }

  function renderWalletConnection() {
    const connected = Boolean(connectedWallet && connectedAccount);
    if (walletSelect) walletSelect.disabled = connected;
    if (connectWalletButton) {
      connectWalletButton.hidden = connected;
      connectWalletButton.disabled = !compatibleWallets.length;
    }
    if (disconnectWalletButton) disconnectWalletButton.hidden = !connected;
    if (copyWalletButton) copyWalletButton.hidden = !connected;
    document.getElementById("fairWalletName").textContent = connected ? sanitizeWalletName(connectedWallet.name) : ui("noWallet");
    document.getElementById("fairWalletAddress").textContent = connected ? shortenWalletAddress(connectedAccount.address) : ui("noAddress");
    setWalletStatus(connected
      ? ui("connectedIdentity")
      : ui("walletIdle"), connected ? "success" : "neutral");
    renderTransactionPreview();
    updateDevnetReadiness();
  }

  function updateDevnetReadiness() {
    if (!createDevnetButton) return;
    const confirmed = Boolean(devnetConfirm?.checked);
    const errors = validateDevnetTokenRequest(readForm(), connectedWallet, connectedAccount);
    createDevnetButton.disabled = !confirmed || errors.length > 0 || !protectionProgramAvailable;
    const status = document.getElementById("fairDevnetStatus");
    if (!status || status.dataset.running === "true") return;
    status.textContent = protectionProgramChecked && !protectionProgramAvailable
      ? ui("protectionUnavailable")
      : !protectionProgramChecked
        ? ui("checkingProtection")
        : !connectedWallet || !connectedAccount
      ? ui("devnetConnect")
      : localizeDevnetError(errors[0]) || (confirmed ? ui("devnetReady") : ui("devnetConfirmFirst"));
  }

  async function refreshProtectionProgramStatus() {
    protectionProgramChecked = false;
    protectionProgramAvailable = false;
    updateDevnetReadiness();
    try {
      const result = await checkDevnetProtectionProgram();
      protectionProgramAvailable = result.available;
    } catch {
      protectionProgramAvailable = false;
    } finally {
      protectionProgramChecked = true;
      updateDevnetReadiness();
    }
  }

  async function createDevnetToken() {
    const status = document.getElementById("fairDevnetStatus");
    const resultBox = document.getElementById("fairDevnetResult");
    if (!status || !resultBox || !devnetConfirm?.checked) return;
    const config = readForm();
    const errors = validateDevnetTokenRequest(config, connectedWallet, connectedAccount);
    if (errors.length) {
      status.textContent = localizeDevnetError(errors[0]);
      return;
    }
    createDevnetButton.disabled = true;
    status.dataset.running = "true";
    status.textContent = ui("preparing");
    resultBox.hidden = true;
    try {
      const result = await createFixedSupplyTokenOnDevnet({ config, wallet: connectedWallet, account: connectedAccount });
      const mintUrl = `https://explorer.solana.com/address/${encodeURIComponent(result.mintAddress)}?cluster=devnet`;
      const transactionUrl = `https://explorer.solana.com/tx/${encodeURIComponent(result.signature)}?cluster=devnet`;
      const policyUrl = `https://explorer.solana.com/address/${encodeURIComponent(result.policyAddress)}?cluster=devnet`;
      resultBox.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = ui("createdTitle");
      const details = document.createElement("p");
      details.textContent = ui("createdDetails", {
        supply: config.totalSupply.toLocaleString(),
        locked: (Number(config.totalSupply) * result.creatorLockBps / 10_000).toLocaleString()
      });
      const mintLink = document.createElement("a");
      mintLink.href = mintUrl;
      mintLink.target = "_blank";
      mintLink.rel = "noopener noreferrer";
      mintLink.textContent = ui("viewMint", { address: shortenWalletAddress(result.mintAddress) });
      const separator = document.createTextNode(" · ");
      const transactionLink = document.createElement("a");
      transactionLink.href = transactionUrl;
      transactionLink.target = "_blank";
      transactionLink.rel = "noopener noreferrer";
      transactionLink.textContent = ui("viewTransaction");
      const policySeparator = document.createTextNode(" Â· ");
      const policyLink = document.createElement("a");
      policyLink.href = policyUrl;
      policyLink.target = "_blank";
      policyLink.rel = "noopener noreferrer";
      policyLink.textContent = ui("viewProtection");
      const participantStatus = document.createElement("p");
      participantStatus.textContent = ui("participantProtectionPending");
      resultBox.append(title, details, mintLink, separator, transactionLink, policySeparator, policyLink, participantStatus);
      resultBox.hidden = false;
      status.textContent = ui("createdStatus");
      const mintInput = document.getElementById("fairVerifyMint");
      const policyInput = document.getElementById("fairVerifyPolicy");
      if (mintInput) mintInput.value = result.mintAddress;
      if (policyInput) policyInput.value = result.policyAddress;
      devnetVerified = false;
    } catch (error) {
      const message = String(error?.message || error);
      status.textContent = /simulation/i.test(message)
        ? ui("simulationFailed")
        : /reject|declin|cancel|denied|user/i.test(message)
        ? ui("requestCanceled")
        : /insufficient|funds|lamport/i.test(message)
          ? ui("needsTestSol")
          : ui("createFailed");
    } finally {
      status.dataset.running = "false";
      updateDevnetReadiness();
    }
  }

  function configureMobileWalletLinks() {
    const isLocalApp = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    const base = isLocalApp ? "https://www.jamddmaj.com/" : `${window.location.origin}${window.location.pathname}`;
    const target = `${base}${base.includes("?") ? "&" : "?"}view=fair-launch`;
    const ref = isLocalApp ? "https://www.jamddmaj.com" : window.location.origin;
    const phantom = document.getElementById("fairOpenPhantom");
    const solflare = document.getElementById("fairOpenSolflare");
    if (phantom) phantom.href = `https://phantom.app/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`;
    if (solflare) solflare.href = `https://solflare.com/ul/v1/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(ref)}`;
  }

  function setWalletStatus(message, state) {
    if (!walletStatus) return;
    walletStatus.textContent = message;
    walletStatus.dataset.state = state;
  }

  function localizeDevnetError(message) {
    const value = String(message || "");
    if (!value) return "";
    if (/firmar transacciones/i.test(value)) return ui("errorWalletSign");
    if (/transacciones Solana v0/i.test(value)) return ui("errorV0");
    if (/0 a 9 decimales/i.test(value)) return ui("errorDecimals");
    if (/entero seguro/i.test(value)) return ui("errorSupply");
    if (/l[ií]mite t[eé]cnico/i.test(value)) return ui("errorSupplyLimit");
    if (/solo est[aá] habilitada/i.test(value)) return ui("errorNetwork");
    if (/revocaci[oó]n.*emisi[oó]n/i.test(value)) return ui("errorMint");
    if (/congelaci[oó]n/i.test(value)) return ui("errorFreeze");
    return value;
  }
})();

function registerMobileWalletAdapter() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  try {
    registerMwa({
      appIdentity: {
        name: "JamdDmaj AI",
        uri: "https://www.jamddmaj.com",
        icon: "/icon-192.png"
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ["solana:devnet"],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler()
    });
  } catch {
    // Unsupported browsers still receive secure Phantom and Solflare deep links.
  }
}
