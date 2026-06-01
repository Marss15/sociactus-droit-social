import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = join(ROOT, "data");
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_HISTORY_DAYS = 90;
const REQUEST_TIMEOUT_MS = 45000;
const STRICT_DAILY_MODE = process.env.SOCIACTUS_STRICT_DAILY_MODE !== "false";
const CONVENTION_PRIORITY_PATH = join(DATA_DIR, "convention-priorities.json");
const CONVENTION_PRIORITY_URL = process.env.SOCIACTUS_CONVENTION_PRIORITY_URL || "";

const now = new Date();
const runDate = process.env.CURATION_DATE || parisDate(now);
let conventionPriorityMemory = null;

const rssSources = [
  {
    name: "Vie-publique - actualités",
    status: "flux RSS ouvert",
    url: "https://www.vie-publique.fr/actualites-feeds.xml",
    defaultCategory: "actualite",
  },
  {
    name: "Vie-publique - lois",
    status: "flux RSS ouvert",
    url: "https://www.vie-publique.fr/lois-feeds.xml",
    defaultCategory: "projet-loi",
  },
  {
    name: "Service-Public - particuliers",
    status: "flux RSS ouvert",
    url: "https://www.service-public.fr/abonnements/rss/actu-actualites-particuliers.rss",
    defaultCategory: "actualite",
  },
  {
    name: "Service-Public - professionnels",
    status: "flux RSS ouvert",
    url: "https://www.service-public.gouv.fr/abonnements/rss/actu-actu-pro.rss",
    defaultCategory: "actualite",
  },
  {
    name: "Conseil d'État - actualités",
    status: "flux RSS ouvert",
    url: "https://www.conseil-etat.fr/outils/flux-rss/actualites-rss",
    defaultCategory: "jurisprudence",
  },
  {
    name: "Conseil d'État - avis",
    status: "flux RSS ouvert",
    url: "https://www.conseil-etat.fr/outils/flux-rss/avis-rss",
    defaultCategory: "projet-loi",
  },
  {
    name: "Le Monde - économie",
    status: "flux RSS presse",
    url: "https://www.lemonde.fr/economie/rss_full.xml",
    defaultCategory: "presse",
    kind: "press",
  },
  {
    name: "Le Parisien - économie",
    status: "flux RSS presse",
    url: "https://feeds.leparisien.fr/leparisien/rss/economie",
    defaultCategory: "presse",
    kind: "press",
  },
  {
    name: "Le Parisien - politique",
    status: "flux RSS presse",
    url: "https://feeds.leparisien.fr/leparisien/rss/politique",
    defaultCategory: "presse",
    kind: "press",
  },
  {
    name: "Le Figaro - économie",
    status: "flux RSS presse",
    url: "https://www.lefigaro.fr/rss/figaro_economie.xml",
    defaultCategory: "presse",
    kind: "press",
  },
  {
    name: "Le Figaro - social",
    status: "flux RSS presse",
    url: "https://www.lefigaro.fr/rss/figaro_social.xml",
    defaultCategory: "presse",
    kind: "press",
  },
  {
    name: "franceinfo - emploi",
    status: "flux RSS presse",
    url: "https://www.francetvinfo.fr/economie/emploi.rss",
    defaultCategory: "presse",
    kind: "press",
  },
];

const archiveSources = [
  {
    kind: "jorf",
    name: "DILA JORFSIMPLE",
    status: "archive ouverte sans clé",
    indexUrl: "https://echanges.dila.gouv.fr/OPENDATA/JORFSIMPLE/",
    filePattern: /JORFSIMPLE_\d{8}-\d{6}\.tar\.gz/g,
  },
  {
    kind: "cass",
    name: "DILA CASS",
    status: "archive ouverte sans clé",
    indexUrl: "https://echanges.dila.gouv.fr/OPENDATA/CASS/",
    filePattern: /CASS_\d{8}-\d{6}\.tar\.gz/g,
  },
];

const sourceRegister = [...rssSources, ...archiveSources].map(({ name, status, url, indexUrl }) => ({
  name,
  status,
  url: url || indexUrl,
})).concat([
  {
    name: "Les Échos",
    status: "non intégré : les flux RSS testés répondent 403",
    url: "https://www.lesechos.fr/",
  },
]);

const socialTerms = [
  "droit du travail",
  "code du travail",
  "contrat de travail",
  "licenciement",
  "rupture conventionnelle",
  "salari",
  "employeur",
  "cse",
  "syndic",
  "representant du personnel",
  "prud",
  "temps de travail",
  "repos",
  "conge",
  "paie",
  "remuneration",
  "salaire",
  "smic",
  "formation professionnelle",
  "apprentissage",
  "alternance",
  "cpf",
  "france travail",
  "chomage",
  "assurance chomage",
  "accident du travail",
  "maladie professionnelle",
  "sante au travail",
  "teletravail",
  "harcelement",
  "discrimination",
  "dialogue social",
  "convention collective",
  "accord collectif",
  "activite partielle",
  "inspection du travail",
  "branche professionnelle",
  "greve",
  "fonction publique",
  "plan social",
  "pse",
  "conditions de travail",
];

const pressTerms = [
  ["droit du travail", 3],
  ["code du travail", 3],
  ["contrat de travail", 3],
  ["conditions de travail", 3],
  ["accident du travail", 3],
  ["sante au travail", 3],
  ["prud'hom", 3],
  ["prudhom", 3],
  ["conseil de prud'hommes", 3],
  ["cse", 3],
  ["licenciement", 3],
  ["rupture conventionnelle", 3],
  ["assurance chomage", 3],
  ["salari", 2],
  ["employeur", 2],
  ["travailleur", 2],
  ["salaire", 2],
  ["smic", 2],
  ["conge", 2],
  ["conges payes", 2],
  ["chomage", 2],
  ["syndicat", 2],
  ["greve", 2],
  ["apprentissage", 2],
  ["alternance", 2],
  ["fonction publique", 2],
  ["agent public", 2],
  ["marche du travail", 2],
  ["depart volontaire", 2],
  ["plan de departs", 2],
  ["ouvrier", 2],
  ["livreur", 2],
  ["vtc", 2],
  ["jour ferie", 1],
];

const exclusionTerms = [
  "vacance d'un emploi",
  "vacance de l'emploi",
  "avis de vacance",
  "nomination sur l'emploi",
  "portant nomination",
  "ouverture d'un concours",
  "examen professionnel",
  "changement de corps",
  "liste d'aptitude",
  "commissions et organes de controle",
  "comites sociaux d'administration",
  "comite social d'administration",
  "commissions administratives paritaires",
  "commissions consultatives paritaires",
  "election des representants des personnels",
  "corps des controleurs",
  "corps des secretaires administratifs",
  "directeurs d'hopital",
  "produits et prestations remboursables",
  "allogreffon",
  "activite physique adaptee",
  "influence commerciale",
  "professions liberales",
  "declaration mentionnee a l'article l. 613-2 du code de la securite sociale",
  "conventions de mandat conclues par l'etat",
  "brevet professionnel de la jeunesse",
  "assurance recolte",
  "medicament",
  "code rural",
];

const pressExclusionTerms = [
  "en inde",
  "aux etats-unis",
  "au royaume-uni",
  "en chine",
  "en russie",
];

const themeRules = [
  ["Contrat", /contrat|licenciement|rupture|cdd|cdi|periode d'essai/i],
  ["Temps de travail", /temps de travail|repos|conge|teletravail|duree du travail/i],
  ["Paie", /paie|remuneration|salaire|smic|cotisation|urssaf/i],
  ["Dialogue social", /cse|syndic|dialogue social|representant du personnel|accord collectif/i],
  ["Formation", /formation professionnelle|apprentissage|alternance|cpf/i],
  ["Emploi", /emploi|chomage|france travail|demandeur d'emploi|activite partielle/i],
  ["Santé au travail", /sante au travail|accident du travail|maladie professionnelle|harcelement|risques psychosociaux/i],
  ["Sécurité sociale", /securite sociale|retraite|allocations|prestations sociales/i],
  ["Conventions collectives", /convention collective|branche professionnelle|extension d'accord/i],
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  conventionPriorityMemory = await readConventionPriorityMemory();
  const previousIds = await readPreviousEntryIds(runDate);
  const collected = [];
  const errors = [];

  for (const source of rssSources) {
    try {
      const xml = await fetchText(source.url);
      collected.push(...parseRss(xml, source));
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
    }
  }

  for (const source of archiveSources) {
    try {
      collected.push(...(await parseArchiveSource(source)));
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
    }
  }

  const dailyFiltered = STRICT_DAILY_MODE ? collected.filter(isTodayEntry) : collected;
  const rejectedByDate = collected.length - dailyFiltered.length;

  const entries = dedupe(dailyFiltered)
    .filter((entry) => !previousIds.has(entry.id))
    .sort(
      (a, b) =>
        priorityRankWeight(b.priorityRank) - priorityRankWeight(a.priorityRank) ||
        b.priority - a.priority ||
        new Date(b.publishedAt) - new Date(a.publishedAt)
    );
  const journal = {
    generatedAt: now.toISOString(),
    date: runDate,
    stats: buildStats(entries),
    sources: sourceRegister,
    research: {
      mcp:
        "data.gouv.fr fournit un serveur MCP officiel pour explorer datasets et API, mais le site utilise les flux et archives HTTP pour rester statique et gratuit.",
      optionalApis: [
        "API Légifrance via PISTE : gratuite après inscription, utile pour recherche fine dans JORF/LEGI/KALI.",
        "API Judilibre via PISTE : gratuite après inscription, utile pour recherche plein texte dans les décisions de justice.",
      ],
      dailyMode: {
        strict: STRICT_DAILY_MODE,
        date: runDate,
        collected: collected.length,
        rejectedByDate,
      },
      errors,
    },
    entries,
  };

  if (DRY_RUN) {
    console.log(JSON.stringify({ date: runDate, stats: journal.stats, rejectedByDate, errors }, null, 2));
    return;
  }

  await updateConventionPriorityMemory(entries);
  await writeJson(join(DATA_DIR, `${runDate}.json`), journal);
  await updateIndex(journal);
  console.log(`Journal ${runDate}: ${entries.length} entrees (${errors.length} erreurs source).`);
  for (const error of errors) {
    console.warn(error);
  }
}

function isTodayEntry(entry) {
  if (dateOnly(entry.publishedAt || entry.date) === runDate) {
    return true;
  }
  return entry.category === "regle" && dateOnly(entry.application?.date) === runDate;
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetchWithTimeout(url);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Sociactus personal social-law watch/0.1",
        Accept: "application/rss+xml, application/xml, text/xml, text/html, */*",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml, source) {
  return blockTags(xml, "item")
    .map((item) => {
      const title = cleanText(tag(item, "title"));
      const description = cleanText(tag(item, "description") || tag(item, "content:encoded"));
      const url = cleanText(tag(item, "link")) || cleanText(tag(item, "guid"));
      const publishedAt = normalizeDate(
        cleanText(tag(item, "pubDate") || tag(item, "dc:date") || tag(item, "updated"))
      );
      const corpus = `${title} ${description}`;
      const score = source.kind === "press" ? pressScore(corpus) : socialScore(corpus);
      if (score < 2 || isExcluded(corpus) || (source.kind === "press" && isPressExcluded(corpus))) {
        return null;
      }
      const category = source.kind === "press" ? "presse" : classifyCategory(corpus, source.defaultCategory);
      const summary =
        source.kind === "press"
          ? pressSummary(source.name, description || title)
          : summarize(description || title, 310);
      return makeEntry({
        sourceName: source.name,
        sourceType: source.kind === "press" ? "press-rss" : "rss",
        category,
        title,
        url,
        publishedAt,
        summary,
        text: corpus,
        impact: impactFor(category, corpus),
        application: applicationFor(category, description, publishedAt),
      });
    })
    .filter(Boolean);
}

async function parseArchiveSource(source) {
  const index = await fetchText(source.indexUrl);
  const names = [...new Set(index.match(source.filePattern) || [])].sort();
  const latest = names.at(-1);
  if (!latest) {
    throw new Error("aucune archive trouvée");
  }
  const archiveUrl = `${source.indexUrl}${latest}`;
  const buffer = await fetchBuffer(archiveUrl);
  const xmlFiles = readTarGzXml(buffer);

  if (source.kind === "jorf") {
    return xmlFiles.map((file) => parseJorf(file, source, archiveUrl)).filter(Boolean);
  }

  if (source.kind === "cass") {
    return xmlFiles.map((file) => parseCass(file, source, archiveUrl)).filter(Boolean);
  }

  return [];
}

function parseJorf(file, source, archiveUrl) {
  if (!/JORFTEXT/.test(file.name)) {
    return null;
  }
  const id = cleanText(tag(file.xml, "ID"));
  const title = cleanText(tag(file.xml, "TITREFULL") || tag(file.xml, "TITRE"));
  const nature = cleanText(tag(file.xml, "NATURE"));
  const publicationDate = cleanText(tag(file.xml, "DATE_PUBLI")) || runDate;
  const textDate = cleanText(tag(file.xml, "DATE_TEXTE"));
  const nor = cleanText(tag(file.xml, "NOR"));
  const eli = cleanText(tag(file.xml, "ID_ELI"));
  const notice = cleanText(tag(file.xml, "NOTICE"));
  const body = cleanText(
    [tag(file.xml, "NOTICE"), tag(file.xml, "VISAS"), tag(file.xml, "SM"), tag(file.xml, "STRUCT")]
      .filter(Boolean)
      .join(" ")
  );
  const corpus = `${nature} ${title} ${notice} ${body}`;

  if (socialScore(corpus) < 2 || isExcluded(corpus)) {
    return null;
  }

  const summary = summarize(
    notice ||
      `${nature ? `${nature}. ` : ""}${title}. Texte publié au Journal officiel le ${publicationDate}.`,
    360
  );

  return makeEntry({
    sourceName: source.name,
    sourceType: "archive",
    category: "regle",
    title,
    url: eli || `https://www.legifrance.gouv.fr/jorf/id/${id}`,
    publishedAt: publicationDate,
    summary,
    text: corpus,
    impact: /loi|ordonnance|decret/i.test(nature) ? "high" : "medium",
    application: extractApplication(body, publicationDate, nature),
    extra: {
      id,
      nor,
      nature,
      textDate,
      archiveUrl,
    },
  });
}

function parseCass(file, source, archiveUrl) {
  const title = cleanText(tag(file.xml, "TITRE"));
  const formation = cleanText(tag(file.xml, "FORMATION"));
  const date = cleanText(tag(file.xml, "DATE_DEC")) || runDate;
  const solution = cleanText(tag(file.xml, "SOLUTION"));
  const id = cleanText(tag(file.xml, "ID"));
  const ecli = cleanText(tag(file.xml, "ECLI"));
  const summaryText = cleanText(tag(file.xml, "SOMMAIRE") || tag(file.xml, "BLOC_TEXTUEL"));
  const corpus = `${title} ${formation} ${solution} ${summaryText}`;
  const isSocialChamber = /chambre sociale|CHAMBRE_SOCIALE/i.test(`${title} ${formation}`);

  if (!isSocialChamber && (socialScore(corpus) < 3 || isExcluded(corpus))) {
    return null;
  }

  const revirement = /revirement|abandonne|desormais|inflechit|evolution de jurisprudence/i.test(corpus);
  return makeEntry({
    sourceName: source.name,
    sourceType: "archive",
    category: "jurisprudence",
    title,
    url: `https://www.legifrance.gouv.fr/juri/id/${id}`,
    publishedAt: date,
    summary: summarize(summaryText || `${solution}. Décision de la chambre sociale publiée au bulletin.`, 380),
    text: corpus,
    impact: revirement ? "high" : "medium",
    application: {
      date,
      label: `Décision rendue le ${formatFrenchDate(date)}. Portée à qualifier avant mise en pratique.`,
      basis: revirement ? "Indice de revirement détecté dans le texte." : "Arrêt publié au bulletin.",
    },
    extra: {
      id,
      ecli,
      solution,
      formation,
      archiveUrl,
    },
  });
}

function makeEntry({
  sourceName,
  sourceType,
  category,
  title,
  url,
  publishedAt,
  summary,
  text,
  impact,
  application,
  extra = {},
}) {
  const normalizedTitle = title || "Sans titre";
  const normalizedUrl = url || extra.archiveUrl || "";
  const id = hash(`${normalizedUrl}|${normalizedTitle}`);
  const themes = detectThemes(text || normalizedTitle);
  const collectiveAgreement = category === "regle" ? classifyCollectiveAgreement(normalizedTitle) : null;
  const priority = priorityFor(category, impact, themes.length, collectiveAgreement);
  const priorityRank = priorityRankFor({ category, impact, priority, text: text || normalizedTitle, collectiveAgreement });
  const nextExtra = collectiveAgreement ? { ...extra, collectiveAgreement } : extra;
  return {
    id,
    date: runDate,
    firstSeenDate: runDate,
    sourceName,
    sourceType,
    category,
    title: normalizedTitle,
    url: normalizedUrl,
    publishedAt: publishedAt || runDate,
    summary: summary || "Synthèse indisponible. Lire la source officielle.",
    application: application || applicationFor(category, text || "", publishedAt),
    watch: watchFor(category, impact),
    themes,
    impact,
    priority,
    priorityRank: priorityRank.rank,
    priorityLabel: priorityRank.label,
    priorityReason: priorityRank.reason,
    extra: nextExtra,
  };
}

function classifyCategory(text, fallback) {
  const normalized = fold(text);
  if (/decret|arrete|ordonnance|journal officiel|jorf|entre en vigueur|applicable/.test(normalized)) {
    return "regle";
  }
  if (/cour de cassation|chambre sociale|conseil d'etat|jurisprudence|arret/.test(normalized)) {
    return "jurisprudence";
  }
  if (/projet de loi|proposition de loi|assemblee nationale|senat|panorama des lois/.test(normalized)) {
    return "projet-loi";
  }
  return fallback || "actualite";
}

function impactFor(category, text) {
  const normalized = fold(text);
  if (category === "regle") {
    return /loi|ordonnance|decret|entre en vigueur|applicable/.test(normalized) ? "high" : "medium";
  }
  if (category === "jurisprudence") {
    return /revirement|abandonne|desormais|publie au bulletin/.test(normalized) ? "high" : "medium";
  }
  if (category === "projet-loi") {
    return "watch";
  }
  if (category === "presse") {
    return "low";
  }
  return "low";
}

function priorityFor(category, impact, themeCount, collectiveAgreement) {
  const impactScore = { high: 30, medium: 20, watch: 12, low: 6 }[impact] || 0;
  const categoryScore = { regle: 30, jurisprudence: 24, "projet-loi": 14, presse: 10, actualite: 8 }[category] || 0;
  const collectiveScore = { p1: 30, p2: 10, p3: -25 }[collectiveAgreement?.rank] || 0;
  return categoryScore + impactScore + Math.min(themeCount, 4) + collectiveScore;
}

function priorityRankFor({ category, impact, priority, text, collectiveAgreement }) {
  const normalized = fold(text);

  if (category === "regle" && collectiveAgreement) {
    if (collectiveAgreement.rank === "p1") {
      return {
        rank: "p1",
        label: "Priorité 1",
        reason: `Convention collective prioritaire : ${collectiveAgreement.label}.`,
      };
    }
    if (collectiveAgreement.rank === "p2") {
      return {
        rank: "p2",
        label: "Priorité 2",
        reason: `Convention collective suivie : ${collectiveAgreement.label}.`,
      };
    }
    return {
      rank: "p3",
      label: "Priorité 3",
      reason: `Convention collective non prioritaire : ${collectiveAgreement.label}. Rang conservé dans data/convention-priorities.json.`,
    };
  }

  if (category === "regle" && impact === "high" && isEssentialRuleSignal(normalized)) {
    return {
      rank: "p1",
      label: "Priorité 1",
      reason: "Texte applicable ou changement normatif à traiter en premier.",
    };
  }

  if (category === "jurisprudence" && impact === "high") {
    return {
      rank: "p1",
      label: "Priorité 1",
      reason: "Décision ou signal de jurisprudence à fort impact.",
    };
  }

  if (category === "regle" || category === "jurisprudence" || category === "projet-loi") {
    return {
      rank: "p2",
      label: "Priorité 2",
      reason: "Information juridique à lire après les urgences P1.",
    };
  }

  if (
    category === "presse" &&
    /smic|licenciement|rupture conventionnelle|assurance chomage|syndicat|plan de departs|chomage technique|code du travail/.test(
      normalized
    )
  ) {
    return {
      rank: "p2",
      label: "Priorité 2",
      reason: "Signal presse relié à un sujet social à impact pratique.",
    };
  }

  return {
    rank: "p3",
    label: "Priorité 3",
    reason: "Veille de contexte ou lecture de fond.",
  };
}

function isEssentialRuleSignal(normalizedText) {
  if (isInstitutionalTrainingGovernance(normalizedText)) {
    return false;
  }
  return /contrat de travail|employeur|salarie|smic|salaire minimum|cse|accord collectif|temps de travail|duree du travail|repos|conge|conges|conge de naissance|conge supplementaire de naissance|licenciement|rupture conventionnelle|inaptitude|harcelement|discrimination|teletravail|inspection du travail/.test(
    normalizedText
  );
}

function applicationFor(category, text, date) {
  if (category === "presse") {
    return {
      date,
      label: "Article journalistique non normatif : recouper avec une source officielle avant toute application.",
      basis: "Veille presse.",
    };
  }
  if (category === "projet-loi") {
    return {
      date: null,
      label: "Non applicable à ce stade : suivre la navette et les décrets d'application.",
      basis: "Projet ou proposition de loi.",
    };
  }
  if (category === "actualite") {
    const explicit = extractExplicitDate(text);
    return {
      date: explicit,
      label: explicit
        ? `Date citée dans l'actualité : ${formatFrenchDate(explicit)}.`
        : "Vérifier si une source normative est mentionnée avant d'appliquer.",
      basis: "Actualité institutionnelle.",
    };
  }
  if (category === "jurisprudence") {
    return {
      date,
      label: date ? `Décision ou avis du ${formatFrenchDate(date)}.` : "Date à confirmer dans la source.",
      basis: "Jurisprudence ou avis.",
    };
  }
  return {
    date,
      label: date ? `Date de référence : ${formatFrenchDate(date)}.` : "Date à confirmer dans le texte.",
    basis: "Source officielle.",
  };
}

function extractApplication(text, publicationDate, nature) {
  const explicit = extractExplicitDate(text);
  if (explicit) {
    return {
      date: explicit,
      label: `Entrée en vigueur ou date d'effet détectée : ${formatFrenchDate(explicit)}.`,
      basis: "Date explicite repérée dans le texte.",
    };
  }

  if (/loi|ordonnance|decret|arrete/i.test(nature || "")) {
    const defaultDate = addDays(publicationDate, 1);
    return {
      date: defaultDate,
      label: `Par défaut, applicable le ${formatFrenchDate(defaultDate)} sauf disposition contraire du texte.`,
      basis: "Règle générale d'entrée en vigueur après publication.",
    };
  }

  return {
    date: publicationDate,
    label: `Publié le ${formatFrenchDate(publicationDate)}. Applicabilité à vérifier dans le texte.`,
    basis: "Publication au Journal officiel.",
  };
}

function extractExplicitDate(text) {
  const normalized = cleanText(text);
  const patterns = [
    /(?:entre en vigueur|entree en vigueur|applicable|a compter du|prend effet le|date d'effet)\s*:?\s*(\d{1,2})(?:er)?\s+([a-zA-Z\u00c0-\u017f]+)\s+(\d{4})/i,
    /(?:entre en vigueur|entree en vigueur|applicable|a compter du|prend effet le|date d'effet)\s*:?\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      if (Number.isNaN(Number(match[2]))) {
        return isoFromFrenchDate(match[1], match[2], match[3]);
      }
      return isoFromParts(match[3], match[2], match[1]);
    }
  }
  return null;
}

function isoFromFrenchDate(day, monthName, year) {
  const months = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };
  const month = months[fold(monthName)];
  if (!month) {
    return null;
  }
  return isoFromParts(year, month, day);
}

function isoFromParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function watchFor(category, impact) {
  if (category === "regle") {
    return "Vérifier le champ d'application, les textes modifiés et les mesures transitoires avant mise en place.";
  }
  if (category === "jurisprudence") {
    return impact === "high"
      ? "Comparer avec la pratique actuelle : un changement de position peut imposer une mise à jour rapide."
      : "Qualifier la portée exacte de la solution et rechercher les décisions rapprochées.";
  }
  if (category === "projet-loi") {
    return "Surveiller l'étape parlementaire suivante et les décrets d'application éventuels.";
  }
  if (category === "presse") {
    return "Identifier si l'article renvoie à une source officielle, une négociation collective ou une décision publiée.";
  }
  return "Conserver en veille et confirmer par une source normative si une action est envisagée.";
}

function detectThemes(text) {
  const normalized = fold(text);
  const themes = themeRules.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
  return themes.length ? [...new Set(themes)] : ["Droit social"];
}

function socialScore(text) {
  const normalized = fold(text);
  let score = 0;
  for (const term of socialTerms) {
    if (normalized.includes(fold(term))) {
      score += term.length > 10 ? 2 : 1;
    }
  }
  return score;
}

function pressScore(text) {
  const normalized = fold(text);
  return pressTerms.reduce((score, [term, weight]) => {
    return normalized.includes(fold(term)) ? score + weight : score;
  }, 0);
}

function isExcluded(text) {
  const normalized = fold(text);
  return (
    exclusionTerms.some((term) => normalized.includes(fold(term))) ||
    isProtectionSocialOnly(normalized) ||
    isInstitutionalTrainingGovernance(normalized)
  );
}

function isPressExcluded(text) {
  const normalized = fold(text);
  return pressExclusionTerms.some((term) => normalized.includes(fold(term)));
}

function isProtectionSocialOnly(normalizedText) {
  const protectionSocialSignal =
    /securite sociale|assurance maladie|assurance vieillesse|assurance invalidite|prestations complementaires|prestations sociales|allocations|remboursement|prise en charge|cancer|soins|patient|activite physique adaptee|apa|pension de retraite|retraites des fonctionnaires|professions liberales/.test(
      normalizedText
    );
  const laborSignal =
    /contrat de travail|employeur|salarie|paie|bulletin de paie|cotisation patronale|urssaf|accident du travail|maladie professionnelle|sante au travail|inaptitude|licenciement|cse|temps de travail|harcelement|discrimination|conge de naissance|conge supplementaire de naissance|conge parental/.test(
      normalizedText
    );
  return protectionSocialSignal && !laborSignal;
}

function isInstitutionalTrainingGovernance(normalizedText) {
  const trainingGovernanceSignal =
    /france competences|operateurs de competences|opco|commissions paritaires nationales de l'emploi|commissions paritaires de la branche professionnelle|centre de formation d'apprenti|centres de formation d'apprenti/.test(
      normalizedText
    );
  const directLaborSignal =
    /contrat de travail|employeur|salarie|remuneration|temps de travail|licenciement|rupture|cse|harcelement|discrimination/.test(
      normalizedText
    );
  return trainingGovernanceSignal && !directLaborSignal;
}

function classifyCollectiveAgreement(text) {
  const normalized = fold(text);
  if (!/convention collective|accord de branche|accord collectif|extension d'un accord|extension d'accord|branche/.test(normalized)) {
    return null;
  }

  const idcc = extractIdcc(text);
  const key = idcc ? `idcc-${idcc}` : `name-${hash(normalized.slice(0, 220)).slice(0, 12)}`;
  const label = extractCollectiveLabel(text, idcc);
  const fromObserved = conventionPriorityMemory?.observed?.[key];
  const fromRule = findConventionRule(normalized, idcc);
  const rank = normalizeRank(fromObserved?.rank || fromRule?.rank || conventionPriorityMemory?.defaultRank || "p3");

  return {
    key,
    idcc,
    label: fromObserved?.label || fromRule?.label || label,
    rank,
    source: fromObserved ? "memory" : fromRule ? "rule" : "default",
  };
}

function extractIdcc(text) {
  const match = String(text).match(/\((?:n[°ºo]\s*|IDCC\s*)(\d{2,4})\)/i) || String(text).match(/IDCC\s*(\d{2,4})/i);
  return match ? match[1] : null;
}

function extractCollectiveLabel(text, idcc) {
  const cleaned = cleanText(text);
  const match =
    cleaned.match(/convention collective nationale\s+(?:metropolitaine\s+)?(?:des?|du|de la|relative aux?|applicable aux?)?\s*([^()\\.]{8,180})/i) ||
    cleaned.match(/branche\s+([^()\\.]{8,160})/i);
  const label = match ? match[1].replace(/\s+/g, " ").trim() : "Convention collective";
  return idcc ? `${label} (n° ${idcc})` : label;
}

function findConventionRule(normalizedText, idcc) {
  const rules = conventionPriorityMemory?.priorityRules || [];
  return rules.find((rule) => {
    const idccMatches = idcc && (rule.idcc || []).map(String).includes(String(idcc));
    const textMatches = (rule.match || []).some((term) => normalizedText.includes(fold(term)));
    return idccMatches || textMatches;
  });
}

function normalizeRank(rank) {
  return ["p1", "p2", "p3"].includes(rank) ? rank : "p3";
}

function priorityRankWeight(rank) {
  return { p1: 3, p2: 2, p3: 1 }[rank] || 0;
}

function summarize(text, maxLength) {
  const cleaned = cleanText(text);
  if (!cleaned) {
    return "";
  }
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  const slice = cleaned.slice(0, maxLength + 1);
  const sentence = slice.match(/^(.+[.!?])\s+/);
  if (sentence && sentence[1].length > 120) {
    return sentence[1];
  }
  return `${slice.slice(0, slice.lastIndexOf(" ")).trim()}...`;
}

function pressSummary(sourceName, text) {
  const excerpt = summarize(text, 220);
  return excerpt
    ? `Repéré dans ${sourceName}. ${excerpt}`
    : `Repéré dans ${sourceName}. Lire l'article source pour le détail.`;
}

function cleanText(value = "") {
  return decodeHtml(String(value))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    rsquo: "'",
    lsquo: "'",
    laquo: '"',
    raquo: '"',
    deg: "°",
  };
  return value
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function blockTags(xml, name) {
  return [...xml.matchAll(new RegExp(`<${escapeRegex(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(name)}>`, "gi"))].map(
    (match) => match[1]
  );
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${escapeRegex(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(name)}>`, "i"));
  return match ? match[1] : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readTarGzXml(buffer) {
  const tar = gunzipSync(buffer);
  const files = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) {
      break;
    }
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeText, 8) || 0;
    const start = offset + 512;
    const end = start + size;

    if (name.endsWith(".xml") && end <= tar.length) {
      files.push({ name, xml: tar.subarray(start, end).toString("utf8") });
    }

    offset = start + Math.ceil(size / 512) * 512;
  }

  return files;
}

function dedupe(entries) {
  const map = new Map();
  for (const entry of entries) {
    const existing = map.get(entry.id);
    if (!existing || entry.priority > existing.priority) {
      map.set(entry.id, entry);
    }
  }
  return [...map.values()];
}

function buildStats(entries) {
  return {
    total: entries.length,
    regles: entries.filter((entry) => entry.category === "regle").length,
    jurisprudence: entries.filter((entry) => entry.category === "jurisprudence").length,
    projets: entries.filter((entry) => entry.category === "projet-loi").length,
    actualites: entries.filter((entry) => entry.category === "actualite").length,
    presse: entries.filter((entry) => entry.category === "presse").length,
    priorite1: entries.filter((entry) => entry.priorityRank === "p1").length,
    priorite2: entries.filter((entry) => entry.priorityRank === "p2").length,
    priorite3: entries.filter((entry) => entry.priorityRank === "p3").length,
  };
}

async function updateIndex(journal) {
  const indexPath = join(DATA_DIR, "index.json");
  const current = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, "utf8")) : { days: [] };
  const withoutToday = (current.days || []).filter((day) => day.date !== journal.date);
  const days = [
    {
      date: journal.date,
      file: `data/${journal.date}.json`,
      total: journal.stats.total,
      regles: journal.stats.regles,
      jurisprudence: journal.stats.jurisprudence,
      projets: journal.stats.projets,
      presse: journal.stats.presse,
      priorite1: journal.stats.priorite1,
      priorite2: journal.stats.priorite2,
      priorite3: journal.stats.priorite3,
    },
    ...withoutToday,
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_HISTORY_DAYS);

  await writeJson(indexPath, {
    generatedAt: journal.generatedAt,
    latestDate: days[0]?.date || journal.date,
    days,
  });
}

async function readConventionPriorityMemory() {
  const remote = await readRemoteConventionPriorityMemory();
  if (remote) {
    return remote;
  }
  if (!existsSync(CONVENTION_PRIORITY_PATH)) {
    return defaultConventionPriorityMemory();
  }
  try {
    const parsed = JSON.parse(await readFile(CONVENTION_PRIORITY_PATH, "utf8"));
    return {
      ...defaultConventionPriorityMemory(),
      ...parsed,
      priorityRules: parsed.priorityRules || defaultConventionPriorityMemory().priorityRules,
      observed: parsed.observed || {},
    };
  } catch {
    return defaultConventionPriorityMemory();
  }
}

async function readRemoteConventionPriorityMemory() {
  if (!CONVENTION_PRIORITY_URL) {
    return null;
  }
  try {
    const response = await fetchWithTimeout(CONVENTION_PRIORITY_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = await response.json();
    return normalizeConventionPriorityMemory(parsed);
  } catch (error) {
    console.warn(`Préférences conventions distantes indisponibles : ${error.message}`);
    return null;
  }
}

function normalizeConventionPriorityMemory(value) {
  const fallback = defaultConventionPriorityMemory();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  return {
    ...fallback,
    ...value,
    defaultRank: normalizeRank(value.defaultRank || fallback.defaultRank),
    priorityRules: Array.isArray(value.priorityRules) ? value.priorityRules : fallback.priorityRules,
    observed: value.observed && typeof value.observed === "object" ? value.observed : {},
  };
}

async function updateConventionPriorityMemory(entries) {
  const memory = conventionPriorityMemory || defaultConventionPriorityMemory();
  const observed = { ...(memory.observed || {}) };
  for (const entry of entries) {
    const collectiveAgreement = entry.extra?.collectiveAgreement;
    if (!collectiveAgreement?.key) {
      continue;
    }
    const current = observed[collectiveAgreement.key] || {};
    observed[collectiveAgreement.key] = {
      label: current.label || collectiveAgreement.label,
      idcc: current.idcc || collectiveAgreement.idcc,
      rank: normalizeRank(current.rank || collectiveAgreement.rank),
      firstSeen: current.firstSeen || runDate,
      lastSeen: runDate,
      seenCount: Number(current.seenCount || 0) + (current.lastSeen === runDate ? 0 : 1),
    };
  }

  conventionPriorityMemory = {
    schemaVersion: 1,
    defaultRank: normalizeRank(memory.defaultRank || "p3"),
    priorityRules: memory.priorityRules || [],
    observed: Object.fromEntries(Object.entries(observed).sort(([a], [b]) => a.localeCompare(b))),
  };
  await writeJson(CONVENTION_PRIORITY_PATH, conventionPriorityMemory);
}

function defaultConventionPriorityMemory() {
  return {
    schemaVersion: 1,
    defaultRank: "p3",
    priorityRules: [
      {
        label: "Métallurgie",
        rank: "p1",
        idcc: ["3248"],
        match: ["metallurgie"],
      },
      {
        label: "Bâtiment et travaux publics",
        rank: "p1",
        idcc: ["1596", "1597", "1702", "2609", "2614"],
        match: ["ouvriers employes par les entreprises du batiment"],
      },
      {
        label: "Bureaux d'études / Syntec",
        rank: "p1",
        idcc: ["1486"],
        match: ["bureaux d'etudes", "syntec"],
      },
      {
        label: "Hôtels, cafés, restaurants",
        rank: "p1",
        idcc: ["1979"],
        match: ["hotels", "cafes", "restaurants", "hcr"],
      },
      {
        label: "Transports routiers",
        rank: "p2",
        idcc: ["16"],
        match: ["transports routiers"],
      },
      {
        label: "Commerce de détail et de gros",
        rank: "p2",
        match: ["commerce de detail", "commerce de gros"],
      },
      {
        label: "Propreté et sécurité privée",
        rank: "p2",
        idcc: ["3043", "1351"],
        match: ["proprete", "securite privee"],
      },
    ],
    observed: {},
  };
}

async function readPreviousEntryIds(excludeDate) {
  const indexPath = join(DATA_DIR, "index.json");
  if (!existsSync(indexPath)) {
    return new Set();
  }
  try {
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    const ids = new Set();
    for (const day of index.days || []) {
      if (day.date === excludeDate) {
        continue;
      }
      const path = join(DATA_DIR, `${day.date}.json`);
      if (!existsSync(path)) {
        continue;
      }
      const journal = JSON.parse(await readFile(path, "utf8"));
      for (const entry of journal.entries || []) {
        ids.add(entry.id);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeDate(value) {
  if (!value) {
    return runDate;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parisDate(parsed);
  }
  return value.slice(0, 10);
}

function dateOnly(value) {
  if (!value) {
    return "";
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parisDate(parsed);
  }
  return text.slice(0, 10);
}

function parisDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatFrenchDate(value) {
  if (!value) {
    return "date inconnue";
  }
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
