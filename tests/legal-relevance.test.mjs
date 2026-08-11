import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LEGAL_RELEVANCE_VERSION,
  classifyLegalRelevance,
  enrichLegacyEntries,
} from "../lib/legal-relevance.mjs";

const historicalFixture = JSON.parse(
  await readFile(new URL("../data/2026-08-11.json", import.meta.url), "utf8")
);

test("includes SMIC and exposes deterministic legal evidence", () => {
  const result = classifyLegalRelevance({
    title: "Revalorisation du SMIC au 1er août",
    text: "Le salaire minimum interprofessionnel de croissance est revalorisé.",
    category: "regle",
    sourceType: "archive",
    sourceName: "DILA JORFSIMPLE",
  });

  assert.equal(result.included, true);
  assert.equal(result.level, "strong");
  assert.match(result.reasons.join(" "), /SMIC|salaire minimum/i);
  assert.equal(result.excludedBy, null);
  assert.equal(result.version, "legal-relevance-v2");
});

test("recognizes labour-law framework and concrete family-leave rules", () => {
  const framework = classifyLegalRelevance("Modification du code du travail");
  const leave = classifyLegalRelevance("Congé supplémentaire de naissance");

  assert.equal(framework.included, true);
  assert.equal(leave.included, true);
});

test("lets direct social-law evidence override administrative noise in the title", () => {
  const cases = [
    "Décret portant nomination et modifiant le code du travail relatif au licenciement des salariés",
    "Arrêté portant extension d'un accord collectif relatif aux commissions paritaires nationales de l'emploi de la branche",
    "Accord collectif sur le contrat d'apprentissage dans les centres de formation d'apprentis",
  ];

  for (const title of cases) {
    const result = classifyLegalRelevance({ title, category: "regle", sourceType: "archive", sourceKind: "jorf" });
    assert.equal(result.included, true, title);
    assert.equal(result.excludedBy, null, title);
  }
});

test("recalls concrete social-law families without admitting generic context terms", () => {
  const positives = [
    "Plan de départs volontaires et obligations de reclassement",
    "Chômage technique et activité partielle dans l'entreprise",
    "Intéressement, participation et épargne salariale",
    "Participation des salariés aux résultats de l'entreprise",
    "Sécurité et conditions de travail : exposition professionnelle à l'amiante",
    "Évolution des salaires et des cotisations sociales",
    "Protection sociale et assurance maladie des salariés",
    "Pension et réforme du régime de retraite des salariés",
    "Réforme de la retraite complémentaire prévue par un accord collectif",
    "Formation professionnelle et obligations d'emploi des travailleurs handicapés",
  ];
  const negatives = [
    "Les perspectives de l'emploi",
    "Le quotidien d'un travailleur indépendant",
    "La transformation professionnelle des territoires",
  ];

  for (const title of positives) {
    assert.equal(classifyLegalRelevance({ title, category: "actualite", sourceType: "rss" }).included, true, title);
  }
  for (const title of negatives) {
    const result = classifyLegalRelevance({ title, category: "actualite", sourceType: "rss" });
    assert.equal(result.included, false, title);
    assert.equal(result.excludedBy, "weak-signal-only", title);
  }
});

test("keeps general social protection contextual unless employment evidence is present", () => {
  const excluded = [
    "Assurance maladie : remboursement des soins dentaires",
    "Protection sociale générale",
    "Réforme des retraites",
  ];

  for (const title of excluded) {
    const result = classifyLegalRelevance(title);
    assert.equal(result.included, false, title);
    assert.equal(result.level, "excluded", title);
  }

  assert.equal(
    classifyLegalRelevance("Réforme des retraites applicable aux salariés et aux employeurs").included,
    true
  );
});

test("uses the normalized title for administrative exclusions, not incidental body references", () => {
  const result = classifyLegalRelevance({
    title: "Règles relatives au licenciement des salariés",
    text: "Le texte rappelle les formalités d'un acte portant nomination dans une administration.",
    category: "regle",
    sourceType: "archive",
    sourceKind: "jorf",
  });

  assert.equal(result.included, true);
  assert.equal(result.excludedBy, null);
});

test("enriches the legacy latest edition from original evidence only without mutating input", () => {
  const before = JSON.stringify(historicalFixture.entries);
  const enriched = enrichLegacyEntries(historicalFixture.entries);
  const falsePositivePatterns = [
    /admission .* retraite/i,
    /organisation du minist/i,
    /procureure financ/i,
    /avis de recrutement .*travailleur handic/i,
    /qualification professionnelle .*expertises? en assurance/i,
  ];

  assert.equal(JSON.stringify(historicalFixture.entries), before);
  assert.equal(enriched.length, 2);
  assert.equal(
    enriched.some((entry) => falsePositivePatterns.some((pattern) => pattern.test(entry.title))),
    false
  );
  assert.equal(
    enriched.every((entry) => entry.legalRelevance?.version === LEGAL_RELEVANCE_VERSION),
    true
  );
  assert.equal(
    enriched.some((entry) => /dialogue social entre les plateformes/i.test(entry.title)),
    true
  );
  assert.equal(
    enriched.some((entry) => /conditions de travail des pompiers/i.test(entry.title)),
    true
  );
  assert.equal(
    enriched.some((entry) => /bilan du macronisme face au chômage|chiffres qui inquiètent/i.test(entry.title)),
    false
  );
  for (const entry of enriched) {
    const originalEvidence = classifyLegalRelevance({
      title: entry.title,
      text: entry.extra?.sourceSummary || "",
      category: entry.category,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
    });
    assert.equal(originalEvidence.included, true, entry.title);
  }
  assert.equal(
    enriched.every((entry) => entry.legalRelevance.reasons.length > 0),
    true
  );
});

test("legacy enrichment uses a closed list of original source-evidence fields", () => {
  const evidence = "Accord collectif relatif au licenciement des salariés";
  const base = {
    id: "legacy-evidence",
    title: "Actualité institutionnelle",
    category: "actualite",
    sourceType: "rss",
    sourceName: "Institution",
  };
  const allowedFields = ["sourceSummary", "excerpt", "sourceText", "body", "notice"];
  const forbiddenFields = ["summary", "description", "text", "nature", "formation"];

  for (const field of allowedFields) {
    const entries = enrichLegacyEntries([{ ...base, id: `allowed-${field}`, extra: { [field]: evidence } }]);
    assert.equal(entries.length, 1, `allowed source field missing: ${field}`);
  }
  for (const field of forbiddenFields) {
    const entries = enrichLegacyEntries([{ ...base, id: `forbidden-${field}`, extra: { [field]: evidence } }]);
    assert.equal(entries.length, 0, `non-source field admitted: ${field}`);
  }
});

test("keeps existing v2 relevance authoritative instead of reclassifying it", () => {
  const authoritative = {
    id: "authoritative",
    title: "Modification du code du travail",
    legalRelevance: {
      version: LEGAL_RELEVANCE_VERSION,
      included: false,
      score: 0,
      level: "excluded",
      reasons: ["source decision"],
      excludedBy: "source-rule",
    },
  };

  assert.deepEqual(enrichLegacyEntries([authoritative]), []);
  assert.equal(authoritative.legalRelevance.reasons[0], "source decision");
});

test("keeps the specified social-law fixture matrix and rejects known JORF noise", () => {
  const positives = [
    "Licenciement économique et obligations de reclassement",
    "Élection du CSE et négociation collective dans l'entreprise",
    "Durée du travail, repos hebdomadaire et congés payés",
    "Prévention du harcèlement et discrimination au travail",
    "Accident du travail et santé au travail",
    "Contrat d'apprentissage : nouvelles obligations de l'employeur",
    "Assurance chômage et règles d'indemnisation",
    "Extension d'une convention collective de branche",
    "Arrêt de la chambre sociale relatif à la rupture du contrat de travail",
    "Accord de dialogue social entre les plateformes et les travailleurs indépendants",
  ];

  for (const title of positives) {
    const result = classifyLegalRelevance({ title, category: "regle", sourceType: "archive" });
    assert.equal(result.included, true, title);
    assert.notEqual(result.excludedBy, "weak-signal-only", title);
  }

  const negatives = [
    "Arrêté du 5 août 2026 portant admission à la retraite (administrateurs de l'Etat)",
    "Arrêté du 3 août 2026 modifiant divers arrêtés intéressant l'organisation du ministère de la défense",
    "Décret du 10 août 2026 portant fin de délégation et délégation dans les fonctions de procureure financière (chambres régionales des comptes)",
    "Avis de recrutement d'un travailleur handicapé par la voie contractuelle dans le corps des adjoints techniques du ministère de la justice",
    "Arrêté relatif à la qualification professionnelle des personnes morales chargées de réaliser des expertises en assurance",
  ];

  for (const title of negatives) {
    const result = classifyLegalRelevance({ title, category: "regle", sourceType: "archive" });
    assert.equal(result.included, false, title);
    assert.ok(result.excludedBy, title);
  }
});

test("never includes a weak context signal without direct labour-law evidence", () => {
  const result = classifyLegalRelevance({
    title: "Les perspectives de l'emploi et des agents publics",
    text: "Une présentation générale du marché du travail.",
    category: "actualite",
    sourceType: "rss",
  });

  assert.equal(result.included, false);
  assert.equal(result.excludedBy, "weak-signal-only");
  assert.equal(result.level, "excluded");
});

test("keeps press evidence secondary and still rejects a press weak signal alone", () => {
  const included = classifyLegalRelevance({
    title: "Les conditions de travail des salariés évoluent",
    category: "presse",
    sourceType: "press-rss",
    sourceKind: "press",
  });
  const excluded = classifyLegalRelevance({
    title: "Le marché de l'emploi en débat",
    category: "presse",
    sourceType: "press-rss",
    sourceKind: "press",
  });

  assert.equal(included.included, true);
  assert.equal(included.level, "secondary");
  assert.equal(excluded.included, false);
  assert.equal(excluded.excludedBy, "weak-signal-only");
});

test("recognizes a CASS chambre sociale item as primary case law", () => {
  const result = classifyLegalRelevance({
    title: "Arrêt du 11 août 2026",
    text: "Solution publiée dans une décision.",
    category: "jurisprudence",
    sourceType: "archive",
    sourceName: "DILA CASS",
  });

  assert.equal(result.included, true);
  assert.equal(result.level, "primary");
  assert.match(result.reasons.join(" "), /chambre sociale/i);
});

test("is deterministic and does not mutate the entry-shaped input", () => {
  const input = Object.freeze({
    title: "SMIC et salaire minimum",
    text: "La rémunération minimale est revalorisée.",
    category: "regle",
    themes: Object.freeze(["Paie"]),
  });
  const before = JSON.stringify(input);

  const first = classifyLegalRelevance(input);
  const second = classifyLegalRelevance(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
});

test("rejects the five identified 2026-08-11 false-positive families without weakening core positives", () => {
  const falsePositivePatterns = [
    /admission .* retraite/i,
    /organisation du minist/i,
    /procureure financ/i,
    /avis de recrutement .*travailleur handic/i,
    /qualification professionnelle .*expertises? en assurance/i,
  ];
  const matchedTitles = falsePositivePatterns
    .map((pattern) => {
      const matchingEntries = historicalFixture.entries.filter((entry) => pattern.test(entry.title));
      assert.equal(matchingEntries.length > 0, true, `fixture family missing: ${pattern}`);
      return matchingEntries.map((entry) => entry.title);
    })
    .flat();

  assert.equal(
    matchedTitles.every((title) => classifyLegalRelevance(title, { sourceKind: "jorf" }).included === false),
    true
  );

  const corePositiveTitles = [
    "Revalorisation du SMIC et du salaire minimum",
    "Rupture conventionnelle et licenciement économique",
    "Élections du CSE et négociation collective avec les organisations syndicales",
    "Durée du travail et congés payés",
    "Harcèlement et discrimination au travail",
    "Accident du travail et santé au travail",
    "Contrat d'apprentissage",
    "Assurance chômage et allocation d'aide au retour à l'emploi",
    "Convention collective applicable",
    "Cour de cassation, chambre sociale, arrêt du 10 août 2026",
    "Dialogue social collectif des travailleurs de plateforme",
  ];
  assert.equal(
    corePositiveTitles.every((title) => classifyLegalRelevance(title).included),
    true
  );
});
