const VERSION = "legal-relevance-v2";

const STRONG_SIGNAL_RULES = [
  {
    key: "labour-law-framework",
    label: "droit ou code du travail",
    score: 4,
    pattern: /droit du travail|code du travail|legislation sociale/,
  },
  {
    key: "employment-relationship",
    label: "relation de travail (salarié, employeur ou contrat de travail)",
    score: 3,
    pattern: /contrat de travail|relation de travail|lien de subordination|employeur|salarie|personnel salarie/,
  },
  {
    key: "termination",
    label: "rupture du contrat ou licenciement",
    score: 4,
    pattern: /licenciement|rupture conventionnelle|rupture du contrat|rupture de la relation|motif economique|plan de sauvegarde de l emploi|plans? sociaux?|plans? de departs? volontaires?|depart volontaire|pse|inaptitude/,
  },
  {
    key: "working-time-and-leave",
    label: "temps de travail, repos ou congés",
    score: 3,
    pattern: /temps de travail|duree du travail|duree legale|repos quotidien|repos hebdomadaire|conges payes|conge parental|conge de maternite|conge de paternite|conge de naissance|conge supplementaire de naissance|droit aux conges|teletravail|travail de nuit/,
  },
  {
    key: "pay",
    label: "rémunération, paie ou salaire minimum",
    score: 4,
    pattern: /smic|salaires?|salaire minimum|minimum conventionnel|minima conventionnels?|remuneration|paie|bulletin de paie|egalite de remuneration|interessement|participation (?:salariale|aux benefices|des salaries)|epargne salariale|cotisation patronale|urssaf/,
  },
  {
    key: "collective-relations",
    label: "relations collectives, CSE, syndicat ou accord collectif",
    score: 4,
    pattern: /cse|comite social et economique|comite social|syndicat|syndical|representant du personnel|representation du personnel|dialogue social|negociation collective|accord collectif|accord de branche|convention collective|branche professionnelle|greve/,
  },
  {
    key: "occupational-health-and-equality",
    label: "santé au travail, accident, harcèlement ou discrimination",
    score: 4,
    pattern: /harcelement|discrimination|accident du travail|maladie professionnelle|sante au travail|securite (?:au travail|des travailleurs)|conditions de travail|exposition professionnelle|amiante|risques psychosociaux|prevention des risques professionnels|violence au travail/,
  },
  {
    key: "apprenticeship-contract",
    label: "contrat d’apprentissage ou de professionnalisation",
    score: 3,
    pattern: /contrat d apprentissage|contrat de professionnalisation|apprenti(?:e)? .* contrat|apprentissage .* contrat|alternance .* contrat/,
  },
  {
    key: "unemployment-and-labour-litigation",
    label: "assurance chômage, indemnisation ou contentieux du travail",
    score: 4,
    pattern: /assurance chomage|allocation(?:s)? chomage|indemnisation du chomage|unedic|france travail .* indemn|conseil de prud hommes|prud hommes|prudhom(?:al|me)?|contentieux du travail|litige du travail/,
  },
  {
    key: "platform-collective-dialogue",
    label: "dialogue social des plateformes avec les travailleurs concernés",
    score: 4,
    pattern: /dialogue social .* plateforme|plateforme .* dialogue social|travailleurs independants .* plateforme|plateforme .* travailleurs independants|accord .* plateforme .* travailleurs/,
  },
  {
    key: "labour-policy-implementation",
    label: "activité partielle ou inspection du travail",
    score: 3,
    pattern: /chomage technique|activite partielle|inspection du travail|droit syndical/,
  },

  {
    key: "professional-training-and-employment-support",
    label: "formation professionnelle ou obligations d’emploi encadrées",
    score: 3,
    pattern: /\bformation professionnelle\b|aides? a l emploi|obligations? d emploi|obligation d emploi/,
  },
];

const WEAK_SIGNAL_RULES = [
  { key: "employment-context", label: "emploi", pattern: /emploi|marche du travail/ },
  { key: "public-service-context", label: "fonction publique ou agent public", pattern: /agent public|agents publics|fonction publique|fonctionnaire/ },
  { key: "retirement-context", label: "retraite", pattern: /retraite|pension/ },
  { key: "social-protection-context", label: "protection sociale générale", pattern: /protection sociale|securite sociale|assurance maladie|remboursement des soins/ },
  { key: "professional-context", label: "contexte professionnel général", pattern: /professionnel|qualification professionnelle|travailleur/ },
  { key: "unemployment-context", label: "chômage non qualifié", pattern: /chomage/ },
];

const EXCLUSION_RULES = [
  {
    key: "individual-retirement-act",
    label: "acte individuel d’admission à la retraite",
    pattern: /admission a la retraite|portant admission a la retraite/,
  },
  {
    key: "administrative-personnel-act",
    label: "acte individuel de nomination, délégation ou recrutement administratif",
    pattern: /portant nomination|nomination sur l emploi|fin de delegation .* fonction|delegation dans les fonctions|avis de recrutement .* corps|recrutement .* corps .* ministere|vacance d un emploi|ouverture d un concours|examen professionnel|liste d aptitude|changement de corps/,
  },
  {
    key: "ministry-organization",
    label: "organisation interne d’un ministère ou d’une administration",
    pattern: /organisation du ministere|organisation interne du ministere|chambres regionales des comptes/,
  },
  {
    key: "non-labour-professional-regulation",
    label: "réglementation professionnelle sans lien de travail",
    pattern: /qualification professionnelle .* personne(?:s)? morale(?:s)? .* expertise(?:s)? en assurance|expertise(?:s)? en assurance|assurance recolte|produits et prestations remboursables/,
  },
  {
    key: "institutional-social-governance",
    label: "gouvernance institutionnelle sans relation de travail directe",
    pattern: /france competences|operateurs de competences|commissions paritaires nationales de l emploi|centre(?:s)? de formation d apprenti/,
  },
];

export const LEGAL_RELEVANCE_VERSION = VERSION;

export function classifyLegalRelevance(input = {}, overrides = {}) {
  const fields = normalizeInput(
    typeof input === "string" && overrides && typeof overrides === "object"
      ? { ...overrides, title: input, text: input }
      : input
  );
  const { corpus, title, sourceKind, sourceType, sourceName } = fields;
  const isPress = sourceKind === "press" || sourceType === "press-rss" || fields.category === "presse";
  const isSocialCaseLaw = detectSocialCaseLaw(fields);

  if (!corpus) {
    return result({
      included: false,
      score: 0,
      level: "excluded",
      reasons: ["Texte insuffisant pour établir une preuve juridique sociale."],
      excludedBy: "no-text",
    });
  }

  if (isSocialCaseLaw) {
    return result({
      included: true,
      score: 10,
      level: "primary",
      reasons: ["Preuve juridique primaire : décision de la chambre sociale de la Cour de cassation."],
      excludedBy: null,
    });
  }

  const strongSignals = STRONG_SIGNAL_RULES.filter(({ pattern }) => pattern.test(corpus));
  const weakSignals = WEAK_SIGNAL_RULES.filter(({ pattern }) => pattern.test(corpus));
  const exclusion = EXCLUSION_RULES.find(({ pattern }) => pattern.test(title));
  if (exclusion && !strongSignals.length) {
    return result({
      included: false,
      score: 0,
      level: "excluded",
      reasons: [exclusion.label],
      excludedBy: exclusion.key,
    });
  }

  if (!strongSignals.length) {
    const weakReason = weakSignals.length
      ? `Signal${weakSignals.length > 1 ? "s" : ""} faible${weakSignals.length > 1 ? "s" : ""} (${weakSignals.map(({ label }) => label).join(", ")}) sans preuve directe d’une règle de droit du travail.`
      : "Aucun signal de droit du travail suffisamment direct n’a été détecté.";
    return result({
      included: false,
      score: weakSignals.length,
      level: "excluded",
      reasons: [weakReason],
      excludedBy: weakSignals.length ? "weak-signal-only" : "insufficient-legal-evidence",
    });
  }

  const score = Math.min(
    20,
    strongSignals.reduce((total, { score: signalScore }) => total + signalScore, 0) + Math.min(weakSignals.length, 2)
  );
  const signalReasons = strongSignals.map(({ label }) => `Preuve juridique : ${label}.`);
  if (weakSignals.length) {
    signalReasons.push(`Contexte complémentaire : ${weakSignals.map(({ label }) => label).join(", ")}.`);
  }

  return result({
    included: true,
    score,
    level: isPress ? "secondary" : "strong",
    reasons: isPress
      ? [`Signal presse secondaire fondé sur une preuve sociale identifiable.`, ...signalReasons]
      : signalReasons,
    excludedBy: null,
  });
}

export function enrichLegacyEntries(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const copy = cloneEntry(entry);
    if (isCurrentLegalRelevance(entry.legalRelevance)) {
      return entry.legalRelevance.included === false ? [] : [copy];
    }

    const legalRelevance = classifyLegalRelevance(legacyLegalInput(entry));
    if (!legalRelevance.included) {
      return [];
    }
    copy.legalRelevance = legalRelevance;
    return [copy];
  });
}

export function normalizeLegalText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[‐‑‒–—−]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInput(input) {
  if (typeof input === "string") {
    const corpus = normalizeLegalText(input);
    return { corpus, title: corpus, category: "", sourceKind: "", sourceType: "", sourceName: "" };
  }

  const value = input && typeof input === "object" ? input : {};
  const title = normalizeLegalText(value.title);
  const corpus = normalizeLegalText(
    [value.title, value.text, value.description, value.summary, value.body, value.notice, value.formation, value.nature]
      .filter((part) => part !== undefined && part !== null)
      .join(" ")
  );
  return {
    corpus,
    title,
    category: normalizeLegalText(value.category),
    sourceKind: normalizeLegalText(value.sourceKind || value.kind),
    sourceType: normalizeLegalText(value.sourceType),
    sourceName: normalizeLegalText(value.sourceName),
  };
}

function legacyLegalInput(entry) {
  const extra = entry.extra && typeof entry.extra === "object" ? entry.extra : {};
  const extraEvidence = [
    extra.sourceSummary,
    extra.excerpt,
    extra.sourceText,
    extra.notice,
    extra.body,
  ]
    .filter((part) => part !== undefined && part !== null)
    .join(" ");

  return {
    title: entry.title,
    // Historical `summary` is generated editorial text, not source evidence.
    // Reusing it would allow an old heuristic conclusion to validate itself.
    text: extraEvidence,
    category: entry.category,
    sourceType: entry.sourceType,
    sourceKind: entry.sourceKind || extra.sourceKind || (entry.sourceType === "press-rss" ? "press" : ""),
    sourceName: entry.sourceName,
  };
}

function isCurrentLegalRelevance(value) {
  return Boolean(value && typeof value === "object" && value.version === VERSION);
}

function cloneEntry(entry) {
  const extra = entry.extra && typeof entry.extra === "object" ? { ...entry.extra } : entry.extra;
  if (extra?.collectiveAgreement && typeof extra.collectiveAgreement === "object") {
    extra.collectiveAgreement = { ...extra.collectiveAgreement };
  }
  return {
    ...entry,
    ...(extra && typeof extra === "object" ? { extra } : {}),
  };
}

function detectSocialCaseLaw({ corpus, sourceKind, sourceType, sourceName }) {
  return (
    sourceKind === "cass" ||
    (sourceType === "archive" && sourceName.includes("cass")) ||
    /chambre sociale|cour de cassation .* social|formation .* sociale/.test(corpus)
  );
}

function result({ included, score, level, reasons, excludedBy }) {
  return {
    included: Boolean(included),
    score: Number.isFinite(score) ? score : 0,
    level,
    reasons: [...new Set(reasons.filter(Boolean))],
    excludedBy: excludedBy || null,
    version: VERSION,
  };
}
