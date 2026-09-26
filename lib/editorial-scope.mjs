import { normalizeLegalText } from "./legal-relevance.mjs";

// An entry needs a subject tied to an employment relationship, not a passing
// mention of work in a general politics or economic story.
const LABOUR_SUBJECT = /\b(?:droit du travail|code du travail|contrat de travail|licenciement|rupture conventionnelle|cdd|cdi|prud hommes|conges payes|temps de travail|duree du travail|teletravail|smic|salaire minimum|salaires? des salaries|remuneration des salaries|egalite des remunerations|transparence des remunerations|egalite salariale|bulletin de paie|cse|comite social et economique|syndicat|syndical|negociation collective|accord collectif|convention collective|dialogue social|greve|sante au travail|securite au travail|accident du travail|maladie professionnelle|harcelement au travail|discrimination au travail|egalite professionnelle|apprentissage|activite partielle|assurance chomage|indemnisation du chomage|cotisations? patronales?|inspection du travail|reclassement|formation professionnelle des salaries)\b/;
const LEGAL_DEVELOPMENT = /\b(?:loi|projet|proposition|decret|reforme|regle|obligation|accord|negociation|convention|decision|arret|jugement|jurisprudence|entree en vigueur|applicable|modification|revalorisation|adoption|vote|transposition)\b/;
const EXCLUDED_TITLE = /\b(?:portant nomination|admission a la retraite|ouverture d un concours|avis de recrutement|delegation dans les fonctions|organisation du ministere|securite sociale generale|remboursement des soins|pension de retraite|fonction publique|fonctionnaires|agents publics|en 19\d{2})\b/;
const DRAFT_STAGE = /\b(?:projet de loi|proposition de loi|projet de decret|avant projet|texte en discussion|examen parlementaire|premiere lecture|deuxieme lecture|lecture au senat|lecture a l assemblee|depose au parlement)\b/;

export function editorialCategory(entry = {}) {
  const title = normalizeLegalText(entry.title);
  const sourceEvidence = normalizeLegalText(entry.sourceEvidence || entry.extra?.sourceSummary || "");
  const evidence = `${title} ${sourceEvidence}`;
  if (!title || !LABOUR_SUBJECT.test(title) || EXCLUDED_TITLE.test(title)) return null;

  if (entry.sourceKind === "jorf" || (entry.sourceType === "archive" && /jorf/i.test(entry.sourceName || ""))) {
    const nature = normalizeLegalText(entry.nature || entry.extra?.nature);
    return /^(loi|decret)$/.test(nature) && /^https:\/\/www\.legifrance\.gouv\.fr\/jorf\/id\/JORFTEXT\d+/.test(entry.url || "")
      ? "regle" : null;
  }
  if (entry.sourceKind === "press" || entry.sourceType === "press-rss") {
    return LEGAL_DEVELOPMENT.test(title) ? "presse" : null;
  }
  if (entry.sourceName?.startsWith("Vie-publique - lois") || entry.sourceKind === "draft") {
    return DRAFT_STAGE.test(title) || (DRAFT_STAGE.test(evidence) && !/^loi du/.test(title)) ? "projet-loi" : null;
  }
  return null;
}

export function focusedEntries(entries = []) {
  return entries.flatMap((entry) => {
    const category = editorialCategory(entry);
    return category ? [{ ...entry, category }] : [];
  });
}
