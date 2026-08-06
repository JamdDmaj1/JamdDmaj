const labels = Object.freeze({
  en: ["Public Devnet verification", "Read the mint and protection policy directly from Solana. No wallet or signature is required.", "Token-2022 mint address", "Protection policy address", "Verify on Devnet", "Enter both Devnet addresses when the protected launch has been deployed.", "Checking Solana Devnet…", "All mandatory on-chain protections passed.", "Verification failed", "Technical verification only · not an audit or legal approval"],
  es: ["Verificación pública en Devnet", "Lee el mint y la política de protección directamente desde Solana. No requiere wallet ni firma.", "Dirección del mint Token-2022", "Dirección de la política de protección", "Verificar en Devnet", "Escribe ambas direcciones Devnet cuando el lanzamiento protegido esté desplegado.", "Comprobando Solana Devnet…", "Todas las protecciones on-chain obligatorias pasaron.", "La verificación falló", "Verificación técnica · no es auditoría ni aprobación legal"],
  fr: ["Vérification publique Devnet", "Lit le mint et la politique de protection directement sur Solana. Aucun wallet ni signature requis.", "Adresse du mint Token-2022", "Adresse de la politique de protection", "Vérifier sur Devnet", "Saisissez les deux adresses Devnet après le déploiement protégé.", "Vérification de Solana Devnet…", "Toutes les protections on-chain obligatoires sont valides.", "Échec de la vérification", "Vérification technique · ni audit ni approbation juridique"],
  de: ["Öffentliche Devnet-Prüfung", "Liest Mint und Schutzrichtlinie direkt von Solana. Keine Wallet oder Signatur erforderlich.", "Token-2022-Mint-Adresse", "Adresse der Schutzrichtlinie", "Auf Devnet prüfen", "Nach der geschützten Bereitstellung beide Devnet-Adressen eingeben.", "Solana Devnet wird geprüft…", "Alle verbindlichen On-Chain-Schutzmaßnahmen bestanden.", "Prüfung fehlgeschlagen", "Technische Prüfung · kein Audit oder Rechtsgutachten"],
  pt: ["Verificação pública na Devnet", "Lê o mint e a política de proteção diretamente da Solana. Não requer wallet nem assinatura.", "Endereço do mint Token-2022", "Endereço da política de proteção", "Verificar na Devnet", "Insira os dois endereços Devnet após o lançamento protegido.", "Verificando a Solana Devnet…", "Todas as proteções on-chain obrigatórias passaram.", "A verificação falhou", "Verificação técnica · não é auditoria nem aprovação jurídica"],
  it: ["Verifica pubblica Devnet", "Legge mint e politica di protezione direttamente da Solana. Non richiede wallet o firma.", "Indirizzo mint Token-2022", "Indirizzo della politica di protezione", "Verifica su Devnet", "Inserisci entrambi gli indirizzi Devnet dopo il deployment protetto.", "Verifica di Solana Devnet…", "Tutte le protezioni on-chain obbligatorie sono valide.", "Verifica non riuscita", "Verifica tecnica · non è un audit o parere legale"],
  ja: ["Devnet公開検証", "SolanaからMintと保護ポリシーを直接読み取ります。ウォレットや署名は不要です。", "Token-2022 Mintアドレス", "保護ポリシーのアドレス", "Devnetで検証", "保護されたデプロイ後に2つのDevnetアドレスを入力してください。", "Solana Devnetを確認中…", "必須のオンチェーン保護をすべて確認しました。", "検証に失敗しました", "技術的検証のみ · 監査・法的承認ではありません"],
  ko: ["공개 Devnet 검증", "Solana에서 민트와 보호 정책을 직접 읽습니다. 지갑이나 서명이 필요하지 않습니다.", "Token-2022 민트 주소", "보호 정책 주소", "Devnet에서 검증", "보호 배포 후 두 Devnet 주소를 입력하세요.", "Solana Devnet 확인 중…", "필수 온체인 보호를 모두 통과했습니다.", "검증 실패", "기술 검증만 제공 · 감사 또는 법적 승인이 아님"],
  zh: ["公开 Devnet 验证", "直接从 Solana 读取铸币和保护策略，无需钱包或签名。", "Token-2022 铸币地址", "保护策略地址", "在 Devnet 验证", "受保护部署完成后请输入两个 Devnet 地址。", "正在检查 Solana Devnet…", "所有强制链上保护均已通过。", "验证失败", "仅技术验证 · 不代表审计或法律批准"],
  ar: ["تحقق Devnet العام", "يقرأ حساب الإصدار وسياسة الحماية مباشرة من Solana دون محفظة أو توقيع.", "عنوان إصدار Token-2022", "عنوان سياسة الحماية", "تحقق على Devnet", "أدخل عنواني Devnet بعد نشر الإطلاق المحمي.", "جارٍ فحص Solana Devnet…", "نجحت جميع وسائل الحماية الإلزامية على السلسلة.", "فشل التحقق", "تحقق تقني فقط · ليس تدقيقاً أو موافقة قانونية"]
});

const keys = ["title", "description", "mintLabel", "policyLabel", "button", "idle", "running", "success", "failure", "disclaimer"];

export function fairLaunchVerifierText(locale, key) {
  const code = String(locale || "en").toLowerCase().split("-")[0];
  const catalog = labels[code] || labels.en;
  const index = keys.indexOf(key);
  return index >= 0 ? catalog[index] : key;
}

export const FAIR_LAUNCH_VERIFIER_LOCALES = Object.freeze(Object.keys(labels));
