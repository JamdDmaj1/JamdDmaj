const keys = ["title", "available", "vesting", "note", "loading", "error"];
const rows = {
  en: ["JamdDmaj · JAMD · Devnet", "Available", "In vesting", "Test tokens without monetary value. Name supplied by JamdDmaj; Phantom metadata is unchanged.", "Loading…", "Devnet balance unavailable."],
  es: ["JamdDmaj · JAMD · Devnet", "Disponibles", "En bloqueo y liberación gradual", "Tokens de prueba sin valor monetario. Nombre proporcionado por JamdDmaj; los metadatos de Phantom no cambian.", "Cargando…", "Saldo Devnet no disponible."],
  fr: ["JamdDmaj · JAMD · Devnet", "Disponibles", "Sous acquisition progressive", "Jetons de test sans valeur monétaire. Nom fourni par JamdDmaj ; les métadonnées Phantom restent inchangées.", "Chargement…", "Solde Devnet indisponible."],
  de: ["JamdDmaj · JAMD · Devnet", "Verfügbar", "In gestaffelter Freigabe", "Test-Token ohne Geldwert. Name von JamdDmaj; Phantom-Metadaten bleiben unverändert.", "Wird geladen…", "Devnet-Guthaben nicht verfügbar."],
  pt: ["JamdDmaj · JAMD · Devnet", "Disponíveis", "Em liberação gradual", "Tokens de teste sem valor monetário. Nome fornecido por JamdDmaj; os metadados do Phantom não mudam.", "Carregando…", "Saldo Devnet indisponível."],
  it: ["JamdDmaj · JAMD · Devnet", "Disponibili", "In rilascio graduale", "Token di prova senza valore monetario. Nome fornito da JamdDmaj; i metadati Phantom restano invariati.", "Caricamento…", "Saldo Devnet non disponibile."],
  ja: ["JamdDmaj · JAMD · Devnet", "利用可能", "段階的解除の対象", "金銭的価値のないテストトークンです。名前はJamdDmajが表示し、Phantomのメタデータは変更されません。", "読み込み中…", "Devnet残高を取得できません。"],
  ko: ["JamdDmaj · JAMD · Devnet", "사용 가능", "단계적 해제 대상", "금전적 가치가 없는 테스트 토큰입니다. 이름은 JamdDmaj에서 표시하며 Phantom 메타데이터는 변경되지 않습니다.", "불러오는 중…", "Devnet 잔액을 불러올 수 없습니다."],
  zh: ["JamdDmaj · JAMD · Devnet", "可用", "分期解锁中", "测试代币无货币价值。名称由 JamdDmaj 提供；Phantom 元数据保持不变。", "加载中…", "无法获取 Devnet 余额。"],
  ar: ["JamdDmaj · JAMD · Devnet", "متاح", "قيد التحرير التدريجي", "رموز اختبار بلا قيمة مالية. الاسم مقدم من JamdDmaj؛ لا تتغير بيانات Phantom الوصفية.", "جارٍ التحميل…", "رصيد Devnet غير متاح."]
};
export const JAMD_LAB_COPY = Object.freeze(Object.fromEntries(Object.entries(rows).map(([locale, values]) => [locale, Object.freeze(Object.fromEntries(keys.map((key, i) => [key, values[i]])))])));
export function jamdLabText(locale, key) { return (JAMD_LAB_COPY[locale] || JAMD_LAB_COPY.en)[key] || JAMD_LAB_COPY.en[key] || ""; }
