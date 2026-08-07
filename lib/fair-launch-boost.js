export const JDMAJ_BOOST_CATALOG = Object.freeze({
  featured: Object.freeze({ label: "Destacado en JamdDmaj", creditsPerDay: 8, stages: ["before", "after"] }),
  verified: Object.freeze({ label: "Perfil y utilidad verificados", creditsPerDay: 3, stages: ["before", "after"] }),
  analytics: Object.freeze({ label: "Analitica y transparencia de holders", creditsPerDay: 5, stages: ["after"] }),
  community: Object.freeze({ label: "Campana educativa de comunidad", creditsPerDay: 4, stages: ["before", "after"] }),
  security: Object.freeze({ label: "Visibilidad de auditoria y bloqueos", creditsPerDay: 4, stages: ["before", "after"] })
});

export const FORBIDDEN_BOOST_CLAIMS = Object.freeze([
  "fake volume",
  "fake holders",
  "guaranteed returns",
  "price manipulation",
  "wash trading"
]);

export function buildBoostPlan(value = {}) {
  const stage = value.stage === "after" ? "after" : "before";
  const days = clampInteger(value.days, 1, 30, 7);
  const requested = Array.isArray(value.services) ? value.services : [];
  const services = [...new Set(requested)]
    .filter((key) => JDMAJ_BOOST_CATALOG[key]?.stages.includes(stage))
    .map((key) => ({
      key,
      label: JDMAJ_BOOST_CATALOG[key].label,
      credits: JDMAJ_BOOST_CATALOG[key].creditsPerDay * days
    }));
  return Object.freeze({
    schema: "jamddmaj-boost/v1",
    stage,
    days,
    currency: "JamdDmaj platform credits",
    paymentEnabled: false,
    services,
    totalCredits: services.reduce((total, item) => total + item.credits, 0),
    safeguards: Object.freeze({
      noFakeVolume: true,
      noFakeHolders: true,
      noPriceManipulation: true,
      noGuaranteedReturns: true
    })
  });
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
