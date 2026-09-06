const en = Object.freeze({
  statusAria: "Release status", designProtected: "Protected design", mandatoryRules: "Mandatory JamdDmaj rules",
  devnetPending: "Devnet pending", noOnchainVerification: "No on-chain verification", auditPending: "Audit pending",
  notCertification: "Not a certification", mainnetBlocked: "Mainnet blocked", noRealPayments: "No payments or real funds",
  stepNavAria: "Token creation steps", identity: "Identity", protection: "Protection", rules: "Rules", boost: "Boost", devnet: "Devnet",
  minimum85: "JamdDmaj minimum: 85%", minimum2000: "JamdDmaj minimum: 2,000 eligible participants",
  minimum24: "JamdDmaj minimum: 24 months", minimum12: "JamdDmaj minimum: 36 months", maximum1: "JamdDmaj maximum: 1%",
  policyLock: "These protections are platform rules and no creator can disable them.",
  txTitle: "Verify the transaction before approval", network: "Network", supply: "Supply", destination: "Destination",
  authorities: "Authorities", authorityValue: "Mint revoked · freezing disabled", realFunds: "Real funds", none: "None",
  walletNotConnected: "Wallet not connected", previous: "Previous", next: "Next", progress: "Step {current} of {total}",
  designReview: "Design review", designScore: "{score}/100 design", designCompliant: "Meets JamdDmaj rules · not audited",
  devnetVerified: "Mint verified on Devnet"
});

export const FAIR_LAUNCH_LOCALES = Object.freeze({
  en,
  es: Object.freeze({
    statusAria: "Estado de publicación", designProtected: "Diseño protegido", mandatoryRules: "Reglas JamdDmaj obligatorias",
    devnetPending: "Devnet pendiente", noOnchainVerification: "Sin verificación on-chain", auditPending: "Auditoría pendiente",
    notCertification: "No es una certificación", mainnetBlocked: "Mainnet bloqueado", noRealPayments: "Sin pagos ni fondos reales",
    stepNavAria: "Pasos para crear el token", identity: "Identidad", protection: "Protección", rules: "Reglas", boost: "Boost", devnet: "Devnet",
    minimum85: "Mínimo JamdDmaj: 85%", minimum2000: "Mínimo JamdDmaj: 2,000 participantes elegibles",
    minimum24: "Mínimo JamdDmaj: 24 meses", minimum12: "Mínimo JamdDmaj: 36 meses", maximum1: "Máximo JamdDmaj: 1%",
    policyLock: "Estas protecciones son reglas de la plataforma y ningún creador puede desactivarlas.",
    txTitle: "Verifica la transacción antes de aprobar", network: "Red", supply: "Suministro", destination: "Destino",
    authorities: "Autoridades", authorityValue: "Emisión revocada · congelación desactivada", realFunds: "Fondos reales", none: "Ninguno",
    walletNotConnected: "Wallet no conectada", previous: "Anterior", next: "Siguiente", progress: "Paso {current} de {total}",
    designReview: "Revisión del diseño", designScore: "{score}/100 de diseño", designCompliant: "Cumple las reglas JamdDmaj · no auditado",
    devnetVerified: "Mint verificado en Devnet"
  }),
  fr: Object.freeze({
    statusAria: "État du lancement", designProtected: "Conception protégée", mandatoryRules: "Règles JamdDmaj obligatoires",
    devnetPending: "Devnet en attente", noOnchainVerification: "Aucune vérification on-chain", auditPending: "Audit en attente",
    notCertification: "Ce n’est pas une certification", mainnetBlocked: "Mainnet bloqué", noRealPayments: "Aucun paiement ni fonds réel",
    stepNavAria: "Étapes de création du token", identity: "Identité", protection: "Protection", rules: "Règles", boost: "Boost", devnet: "Devnet",
    minimum85: "Minimum JamdDmaj : 85 %", minimum2000: "Minimum JamdDmaj : 2 000 participants éligibles",
    minimum24: "Minimum JamdDmaj : 24 mois", minimum12: "Minimum JamdDmaj : 36 mois", maximum1: "Maximum JamdDmaj : 1 %",
    policyLock: "Ces protections sont des règles de la plateforme qu’aucun créateur ne peut désactiver.",
    txTitle: "Vérifiez la transaction avant d’approuver", network: "Réseau", supply: "Offre", destination: "Destination",
    authorities: "Autorités", authorityValue: "Émission révoquée · gel désactivé", realFunds: "Fonds réels", none: "Aucun",
    walletNotConnected: "Wallet non connecté", previous: "Précédent", next: "Suivant", progress: "Étape {current} sur {total}",
    designReview: "Examen de la conception", designScore: "Conception {score}/100", designCompliant: "Conforme aux règles JamdDmaj · non audité",
    devnetVerified: "Mint vérifié sur Devnet"
  }),
  de: Object.freeze({
    statusAria: "Veröffentlichungsstatus", designProtected: "Geschütztes Design", mandatoryRules: "Verbindliche JamdDmaj-Regeln",
    devnetPending: "Devnet ausstehend", noOnchainVerification: "Keine On-Chain-Prüfung", auditPending: "Audit ausstehend",
    notCertification: "Keine Zertifizierung", mainnetBlocked: "Mainnet gesperrt", noRealPayments: "Keine Zahlungen oder echten Gelder",
    stepNavAria: "Schritte zur Token-Erstellung", identity: "Identität", protection: "Schutz", rules: "Regeln", boost: "Boost", devnet: "Devnet",
    minimum85: "JamdDmaj-Mindestwert: 85 %", minimum2000: "JamdDmaj-Mindestwert: 2.000 berechtigte Teilnehmer",
    minimum24: "JamdDmaj-Mindestwert: 24 Monate", minimum12: "JamdDmaj-Mindestwert: 36 Monate", maximum1: "JamdDmaj-Höchstwert: 1 %",
    policyLock: "Diese Schutzmaßnahmen sind Plattformregeln und können nicht deaktiviert werden.",
    txTitle: "Transaktion vor der Freigabe prüfen", network: "Netzwerk", supply: "Angebot", destination: "Ziel",
    authorities: "Berechtigungen", authorityValue: "Minting widerrufen · Einfrieren deaktiviert", realFunds: "Echte Gelder", none: "Keine",
    walletNotConnected: "Wallet nicht verbunden", previous: "Zurück", next: "Weiter", progress: "Schritt {current} von {total}",
    designReview: "Designprüfung", designScore: "Design {score}/100", designCompliant: "Erfüllt JamdDmaj-Regeln · nicht auditiert",
    devnetVerified: "Mint auf Devnet verifiziert"
  }),
  pt: Object.freeze({
    statusAria: "Estado do lançamento", designProtected: "Design protegido", mandatoryRules: "Regras JamdDmaj obrigatórias",
    devnetPending: "Devnet pendente", noOnchainVerification: "Sem verificação on-chain", auditPending: "Auditoria pendente",
    notCertification: "Não é uma certificação", mainnetBlocked: "Mainnet bloqueada", noRealPayments: "Sem pagamentos ou fundos reais",
    stepNavAria: "Etapas para criar o token", identity: "Identidade", protection: "Proteção", rules: "Regras", boost: "Boost", devnet: "Devnet",
    minimum85: "Mínimo JamdDmaj: 85%", minimum2000: "Mínimo JamdDmaj: 2.000 participantes elegíveis",
    minimum24: "Mínimo JamdDmaj: 24 meses", minimum12: "Mínimo JamdDmaj: 36 meses", maximum1: "Máximo JamdDmaj: 1%",
    policyLock: "Estas proteções são regras da plataforma e nenhum criador pode desativá-las.",
    txTitle: "Verifique a transação antes de aprovar", network: "Rede", supply: "Fornecimento", destination: "Destino",
    authorities: "Autoridades", authorityValue: "Emissão revogada · congelamento desativado", realFunds: "Fundos reais", none: "Nenhum",
    walletNotConnected: "Wallet não conectada", previous: "Anterior", next: "Próximo", progress: "Etapa {current} de {total}",
    designReview: "Revisão do design", designScore: "Design {score}/100", designCompliant: "Cumpre as regras JamdDmaj · não auditado",
    devnetVerified: "Mint verificado na Devnet"
  }),
  it: Object.freeze({
    statusAria: "Stato del lancio", designProtected: "Design protetto", mandatoryRules: "Regole JamdDmaj obbligatorie",
    devnetPending: "Devnet in attesa", noOnchainVerification: "Nessuna verifica on-chain", auditPending: "Audit in attesa",
    notCertification: "Non è una certificazione", mainnetBlocked: "Mainnet bloccata", noRealPayments: "Nessun pagamento o fondo reale",
    stepNavAria: "Passaggi per creare il token", identity: "Identità", protection: "Protezione", rules: "Regole", boost: "Boost", devnet: "Devnet",
    minimum85: "Minimo JamdDmaj: 85%", minimum2000: "Minimo JamdDmaj: 2.000 partecipanti idonei",
    minimum24: "Minimo JamdDmaj: 24 mesi", minimum12: "Minimo JamdDmaj: 36 mesi", maximum1: "Massimo JamdDmaj: 1%",
    policyLock: "Queste protezioni sono regole della piattaforma e nessun creatore può disattivarle.",
    txTitle: "Verifica la transazione prima di approvare", network: "Rete", supply: "Offerta", destination: "Destinazione",
    authorities: "Autorità", authorityValue: "Emissione revocata · blocco disattivato", realFunds: "Fondi reali", none: "Nessuno",
    walletNotConnected: "Wallet non connessa", previous: "Indietro", next: "Avanti", progress: "Passaggio {current} di {total}",
    designReview: "Revisione del design", designScore: "Design {score}/100", designCompliant: "Conforme alle regole JamdDmaj · non verificato",
    devnetVerified: "Mint verificato su Devnet"
  }),
  ja: Object.freeze({
    statusAria: "公開ステータス", designProtected: "保護された設計", mandatoryRules: "必須のJamdDmajルール",
    devnetPending: "Devnet未確認", noOnchainVerification: "オンチェーン未確認", auditPending: "監査待ち",
    notCertification: "認証ではありません", mainnetBlocked: "Mainnet停止中", noRealPayments: "支払い・実資金なし",
    stepNavAria: "トークン作成手順", identity: "基本情報", protection: "保護", rules: "ルール", boost: "ブースト", devnet: "Devnet",
    minimum85: "JamdDmaj最低値：85%", minimum2000: "JamdDmaj最低値：対象者2,000人",
    minimum24: "JamdDmaj最低値：24か月", minimum12: "JamdDmaj最低値：36か月", maximum1: "JamdDmaj上限：1%",
    policyLock: "これらはプラットフォームの必須保護で、作成者は無効にできません。",
    txTitle: "承認前にトランザクションを確認", network: "ネットワーク", supply: "供給量", destination: "送付先",
    authorities: "権限", authorityValue: "発行権限を破棄・凍結を無効化", realFunds: "実資金", none: "なし",
    walletNotConnected: "ウォレット未接続", previous: "戻る", next: "次へ", progress: "{total}段階中{current}段階",
    designReview: "設計レビュー", designScore: "設計 {score}/100", designCompliant: "JamdDmajルール準拠・未監査",
    devnetVerified: "DevnetでMintを確認済み"
  }),
  ko: Object.freeze({
    statusAria: "출시 상태", designProtected: "보호된 설계", mandatoryRules: "필수 JamdDmaj 규칙",
    devnetPending: "Devnet 대기", noOnchainVerification: "온체인 확인 없음", auditPending: "감사 대기",
    notCertification: "인증이 아닙니다", mainnetBlocked: "Mainnet 차단", noRealPayments: "결제 또는 실제 자금 없음",
    stepNavAria: "토큰 생성 단계", identity: "기본 정보", protection: "보호", rules: "규칙", boost: "부스트", devnet: "Devnet",
    minimum85: "JamdDmaj 최소: 85%", minimum2000: "JamdDmaj 최소: 적격 참여자 2,000명",
    minimum24: "JamdDmaj 최소: 24개월", minimum12: "JamdDmaj 최소: 36개월", maximum1: "JamdDmaj 최대: 1%",
    policyLock: "이 보호 기능은 플랫폼 필수 규칙이며 생성자가 비활성화할 수 없습니다.",
    txTitle: "승인 전에 트랜잭션 확인", network: "네트워크", supply: "공급량", destination: "대상",
    authorities: "권한", authorityValue: "발행 권한 폐기 · 동결 비활성화", realFunds: "실제 자금", none: "없음",
    walletNotConnected: "지갑 연결 안 됨", previous: "이전", next: "다음", progress: "{total}단계 중 {current}단계",
    designReview: "설계 검토", designScore: "설계 {score}/100", designCompliant: "JamdDmaj 규칙 충족 · 미감사",
    devnetVerified: "Devnet에서 Mint 확인됨"
  }),
  zh: Object.freeze({
    statusAria: "发布状态", designProtected: "受保护的设计", mandatoryRules: "JamdDmaj 强制规则",
    devnetPending: "Devnet 待验证", noOnchainVerification: "尚未链上验证", auditPending: "审计待完成",
    notCertification: "这不是认证", mainnetBlocked: "Mainnet 已锁定", noRealPayments: "无付款或真实资金",
    stepNavAria: "代币创建步骤", identity: "基本信息", protection: "保护", rules: "规则", boost: "推广", devnet: "Devnet",
    minimum85: "JamdDmaj 最低：85%", minimum2000: "JamdDmaj 最低：2,000 名合格参与者",
    minimum24: "JamdDmaj 最低：24 个月", minimum12: "JamdDmaj 最低：36 个月", maximum1: "JamdDmaj 最高：1%",
    policyLock: "这些保护是平台强制规则，创建者无法关闭。",
    txTitle: "批准前请核对交易", network: "网络", supply: "供应量", destination: "接收地址",
    authorities: "权限", authorityValue: "铸币权限已撤销 · 冻结已禁用", realFunds: "真实资金", none: "无",
    walletNotConnected: "钱包未连接", previous: "上一步", next: "下一步", progress: "第 {current} 步，共 {total} 步",
    designReview: "设计检查", designScore: "设计 {score}/100", designCompliant: "符合 JamdDmaj 规则 · 未审计",
    devnetVerified: "Mint 已在 Devnet 验证"
  }),
  ar: Object.freeze({
    statusAria: "حالة الإطلاق", designProtected: "تصميم محمي", mandatoryRules: "قواعد JamdDmaj إلزامية",
    devnetPending: "Devnet قيد الانتظار", noOnchainVerification: "لا يوجد تحقق على السلسلة", auditPending: "التدقيق معلق",
    notCertification: "ليست شهادة", mainnetBlocked: "Mainnet محظورة", noRealPayments: "لا مدفوعات أو أموال حقيقية",
    stepNavAria: "خطوات إنشاء الرمز", identity: "الهوية", protection: "الحماية", rules: "القواعد", boost: "الترويج", devnet: "Devnet",
    minimum85: "الحد الأدنى لـ JamdDmaj: 85%", minimum2000: "الحد الأدنى لـ JamdDmaj: 2,000 مشارك مؤهل",
    minimum24: "الحد الأدنى لـ JamdDmaj: 24 شهرًا", minimum12: "الحد الأدنى لـ JamdDmaj: 36 شهرًا", maximum1: "الحد الأقصى لـ JamdDmaj: 1%",
    policyLock: "هذه الحمايات قواعد إلزامية للمنصة ولا يمكن للمنشئ تعطيلها.",
    txTitle: "تحقق من المعاملة قبل الموافقة", network: "الشبكة", supply: "المعروض", destination: "الوجهة",
    authorities: "الصلاحيات", authorityValue: "إلغاء صلاحية الإصدار · تعطيل التجميد", realFunds: "أموال حقيقية", none: "لا يوجد",
    walletNotConnected: "المحفظة غير متصلة", previous: "السابق", next: "التالي", progress: "الخطوة {current} من {total}",
    designReview: "مراجعة التصميم", designScore: "التصميم {score}/100", designCompliant: "متوافق مع قواعد JamdDmaj · غير مدقق",
    devnetVerified: "تم التحقق من Mint على Devnet"
  })
});

export const FAIR_LAUNCH_LOCALE_KEYS = Object.freeze(Object.keys(en));

export function resolveFairLaunchLocale(value) {
  const code = String(value || "en").toLowerCase().split("-")[0];
  return FAIR_LAUNCH_LOCALES[code] ? code : "en";
}

export function fairLaunchText(locale, key, variables = {}) {
  const catalog = FAIR_LAUNCH_LOCALES[resolveFairLaunchLocale(locale)] || en;
  const template = catalog[key] || en[key] || key;
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
