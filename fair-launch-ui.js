import {
  FAIR_LAUNCH_DEFAULTS,
  assessFairLaunch,
  buildFairLaunchManifest,
  calculateFairLaunchVesting,
  normalizeFairLaunchDraft
} from "./lib/fair-launch.js";

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

  const fields = {
    projectName: document.getElementById("fairProjectName"),
    symbol: document.getElementById("fairSymbol"),
    purpose: document.getElementById("fairPurpose"),
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

  populateForm(loadDraft());
  updatePlan(false);

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
    if (model) model.textContent = "Diseño anti-rug · simulación local";
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

  async function updatePlan(announce) {
    const config = readForm();
    latestManifest = buildFairLaunchManifest(config);
    latestManifestHash = await sha256(JSON.stringify(latestManifest));
    const assessment = assessFairLaunch(config);
    const creatorTokens = latestManifest.protection.creator.estimatedTokensAtStartingPrice;
    const creatorLocked = creatorTokens * (config.creatorLockPercent / 100);

    document.getElementById("fairSecurityScore").textContent = `${assessment.score}/100`;
    document.getElementById("fairSecurityGrade").textContent = assessment.grade;
    document.getElementById("fairReadiness").textContent = assessment.readyForAudit
      ? "Listo para revisión técnica, no para mainnet"
      : `${assessment.blockers.length} bloqueo(s) antes de auditoría`;
    document.getElementById("fairCreatorPreview").textContent = `${formatNumber(creatorLocked)} de ${formatNumber(creatorTokens)} ${config.symbol} bloqueados`;
    document.getElementById("fairHolderPreview").textContent = `${config.earlyHolderCount.toLocaleString()} participantes elegibles · ${config.holderLockPercent}% bloqueado`;
    document.getElementById("fairLiquidityPreview").textContent = `${config.liquidityLockMonths} meses · recibos LP bloqueados`;
    document.getElementById("fairManifestHash").textContent = latestManifestHash ? `SHA-256 ${latestManifestHash}` : "Hash local no disponible";
    document.getElementById("downloadFairManifestBtn").disabled = false;
    document.getElementById("fairPlanStatus").textContent = announce
      ? "Manifiesto simulado generado. No se creó ningún token ni se conectó una billetera."
      : "Vista previa local: ningún dato se envía ni se firma.";

    const checklist = document.getElementById("fairSecurityChecks");
    checklist.replaceChildren();
    assessment.checks.forEach((item) => {
      const row = document.createElement("li");
      row.dataset.passed = String(item.passed);
      const marker = document.createElement("span");
      marker.textContent = item.passed ? "✓" : "!";
      const label = document.createElement("span");
      label.textContent = item.label;
      row.append(marker, label);
      checklist.append(row);
    });
    renderVestingPreview();
  }

  function renderVestingPreview() {
    const month = Number(document.getElementById("fairVestingMonth").value || 0);
    const vesting = calculateFairLaunchVesting(readForm(), month);
    document.getElementById("fairVestingMonthLabel").textContent = `Mes ${Math.round(vesting.month)}`;
    document.getElementById("fairLiquidPercent").textContent = `${vesting.liquidPercent.toFixed(2)}% líquido`;
    document.getElementById("fairLockedPercent").textContent = `${vesting.lockedPercent.toFixed(2)}% bloqueado`;
    document.getElementById("fairVestingBar").style.width = `${vesting.liquidPercent}%`;
  }

  function resetPlan() {
    if (!window.confirm("¿Restablecer el diseño seguro recomendado?")) return;
    populateForm(FAIR_LAUNCH_DEFAULTS);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFairLaunchDraft(value)));
    } catch {
      document.getElementById("fairPlanStatus").textContent = "El navegador no pudo guardar este borrador local.";
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
})();
