import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dateFromArticleUrl, dedupe, isWithinOfficialNewsWindow, parseAtom, parseCass, parseJorf, parseOfficialNews, parseRss } from "../scripts/curate.mjs";

const curatePath = new URL("../scripts/curate.mjs", import.meta.url);

test("uses an article URL date when a feed republishes an older story", () => {
  assert.equal(dateFromArticleUrl("https://example.test/sujet-24-09-2026-abc.php"), "2026-09-24");
  assert.equal(dateFromArticleUrl("https://example.test/sujet-99-99-2026.php"), null);
});

test("selects dated legal developments from the specialist employment-law Atom feed", () => {
  const xml = `<feed>
    <entry><title>Conventions collectives : les grilles de salaires au 1er octobre 2026</title><link href="https://www.editions-tissot.fr/actualite/droit-du-travail/grilles"/><updated>2026-09-28T09:54:00+02:00</updated><content type="html"><p>De nouvelles grilles de salaires entrent en vigueur pour plusieurs branches.</p></content></entry>
    <entry><title>Arrêt maladie : pouvez-vous contacter votre salarié ?</title><link href="https://www.editions-tissot.fr/actualite/droit-du-travail/conseil"/><updated>2026-09-28T09:30:00+02:00</updated><content type="html"><p>Un conseil général pour les employeurs.</p></content></entry>
    <entry><title>Projet de loi sur les congés payés</title><link href="https://www.editions-tissot.fr/actualite/droit-du-travail/sans-date"/><content type="html"><p>Texte envisagé.</p></content></entry>
  </feed>`;
  const entries = parseAtom(xml, { name: "Éditions Tissot - droit du travail", kind: "press" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].publishedAt, "2026-09-28");
  assert.equal(entries[0].category, "presse");
  assert.match(entries[0].summary, /grilles de salaires/);
});

test("captures a dated official employment-law announcement without presenting it as published law", () => {
  const html = `
    <div class="fr-grid-row fr-grid-row--gutters fr-mb-3w">
      <p class="fr-text--lg fr-mb-1v">23 septembre 2026</p>
      <h2 class="fr-mb-0">Prime carburant : jusqu’à 1 000 € exonérés en 2026 !</h2>
      <p class="fr-mt-2w">Le plafond d'exonération de la prime carburant des salariés passe à 1 000 €.</p>
      <p class="fr-mt-2w">L'employeur peut aider les salariés pour leurs trajets domicile-travail.</p>
      <p class="fr-mt-2w">Les textes réglementaires destinés à modifier le régime social de la prime carburant ne sont pas encore publiés.</p>
      <a href="/actualite/prime-carburant-1000" title="Lire l&#x27;actualité">Lire l&#x27;actualité</a></div></div>
    <div class="fr-grid-row fr-grid-row--gutters fr-mb-3w">
      <p class="fr-text--lg fr-mb-1v">23 septembre 2026</p>
      <h2 class="fr-mb-0">Aides au carburant pour les taxis</h2>
      <a href="/actualite/taxis" title="Lire l&#x27;actualité">Lire l&#x27;actualité</a></div></div>`;
  const entries = parseOfficialNews(html, { kind: "official-news", name: "Code du travail numérique - actualités", url: "https://code.travail.gouv.fr/actualite" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].publishedAt, "2026-09-23");
  assert.equal(entries[0].category, "projet-loi");
  assert.equal(entries[0].extra.status, "announced");
  assert.match(entries[0].extra.legalStatus, /non publiés/);
  assert.equal(isWithinOfficialNewsWindow(entries[0], "2026-09-28"), true);
  assert.equal(isWithinOfficialNewsWindow(entries[0], "2026-10-02"), false);
});

test("curation module exposes an import-safe boundary for fixture tests", async () => {
  const source = await readFile(curatePath, "utf8");
  assert.match(source, /isMainModule/);
});

test("retains only an identifiable social-law draft from the laws feed", () => {
  const xml = `
    <rss><channel>
      <item>
        <title>Projet de loi sur la transparence des rémunérations</title>
        <description><![CDATA[Le texte prévoit des obligations pour les employeurs.]]></description>
        <link>https://example.test/smic</link>
        <pubDate>2026-08-11</pubDate>
      </item>
      <item>
        <title>Les perspectives de l'emploi et des agents publics</title>
        <description>Une présentation générale du marché du travail.</description>
        <link>https://example.test/emploi</link>
        <pubDate>2026-08-11</pubDate>
      </item>
    </channel></rss>`;

  const entries = parseRss(xml, {
    name: "Vie-publique - lois",
    kind: "draft",
    defaultCategory: "projet-loi",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Projet de loi sur la transparence des rémunérations");
  assert.equal(entries[0].category, "projet-loi");
  assert.equal(entries[0].legalRelevance.included, true);
  assert.equal(entries[0].legalRelevance.version, "legal-relevance-v2");
  assert.match(entries[0].priorityReason, /Preuve juridique/i);
});

test("applies legal relevance at the JORF and CASS archive boundaries", () => {
  const source = { name: "DILA JORFSIMPLE", kind: "jorf" };
  const rejected = parseJorf(
    {
      name: "JORFTEXT000054659203.xml",
      xml: `
        <ROOT>
          <ID>JORFTEXT000054659203</ID>
          <TITREFULL>Avis de recrutement d'un travailleur handicapé par la voie contractuelle dans le corps des adjoints techniques du ministère de la justice</TITREFULL>
          <NATURE>AVIS</NATURE>
          <DATE_PUBLI>2026-08-11</DATE_PUBLI>
          <NOTICE>Publics concernés : candidats.</NOTICE>
        </ROOT>`,
    },
    source,
    "https://example.test/archive.tar.gz"
  );
  const accepted = parseJorf(
    {
      name: "JORFTEXT000054659999.xml",
      xml: `
        <ROOT>
          <ID>JORFTEXT000054659999</ID>
          <TITREFULL>Décret relatif à la revalorisation du SMIC</TITREFULL>
          <NATURE>DECRET</NATURE>
          <DATE_PUBLI>2026-08-11</DATE_PUBLI>
          <NOTICE>Le salaire minimum interprofessionnel de croissance est revalorisé.</NOTICE>
        </ROOT>`,
    },
    source,
    "https://example.test/archive.tar.gz"
  );
  const cass = parseCass(
    {
      name: "decision.xml",
      xml: `
        <ROOT>
          <ID>JURI0001</ID>
          <ECLI>ECLI:FR:CCASS:2026:S00001</ECLI>
          <TITRE>Arrêt relatif à la rupture du contrat</TITRE>
          <FORMATION>CHAMBRE_SOCIALE</FORMATION>
          <DATE_DEC>2026-08-11</DATE_DEC>
          <SOLUTION>La Cour précise la règle applicable.</SOLUTION>
          <SOMMAIRE>La chambre sociale statue sur le contrat de travail.</SOMMAIRE>
        </ROOT>`,
    },
    { name: "DILA CASS", kind: "cass" },
    "https://example.test/cass.tar.gz",
    "2026-08-11"
  );

  assert.equal(rejected, null);
  assert.equal(accepted.legalRelevance.included, true);
  assert.equal(accepted.application.date, null);
  assert.match(accepted.application.label, /à vérifier/);
  assert.match(accepted.legalRelevance.reasons.join(" "), /salaire minimum/i);
  const dated = parseJorf(
    {
      name: "JORFTEXT000054659998.xml",
      xml: `<ROOT><ID>JORFTEXT000054659998</ID><TITREFULL>Décret relatif au SMIC</TITREFULL><NATURE>DECRET</NATURE><DATE_PUBLI>2026-08-11</DATE_PUBLI><NOTICE>Entrée en vigueur : le décret entre en vigueur le 1er septembre 2026. Le salaire minimum est revalorisé.</NOTICE></ROOT>`,
    },
    source,
    "https://example.test/archive.tar.gz"
  );
  assert.equal(dated.application.date, "2026-09-01");
  assert.equal(dated.application.basis, "Date explicite repérée dans la notice.");
  assert.equal(cass.legalRelevance.level, "primary");
  assert.match(cass.legalRelevance.reasons.join(" "), /chambre sociale/i);
});

test("deduplicates same-day RSS titles but keeps distinct official identifiers", () => {
  const rssBase = {
    sourceType: "rss",
    category: "actualite",
    title: "SMIC et salaire minimum",
    priority: 20,
  };
  const rssEntries = [
    { ...rssBase, id: "rss-1", sourceName: "Service-Public - particuliers" },
    { ...rssBase, id: "rss-2", sourceName: "Service-Public - professionnels" },
  ];
  const officialEntries = [
    { sourceType: "archive", title: "Même titre officiel", id: "official-1", extra: { id: "JORF-1" }, priority: 10 },
    { sourceType: "archive", title: "Même titre officiel", id: "official-2", extra: { id: "JORF-2" }, priority: 10 },
    { sourceType: "archive", title: "Même titre officiel", id: "official-1b", extra: { id: "JORF-1" }, priority: 20 },
  ];

  const result = dedupe([...rssEntries, ...officialEntries]);

  assert.equal(result.filter((entry) => entry.sourceType === "rss").length, 1);
  assert.equal(result.filter((entry) => entry.sourceType === "archive").length, 2);
  assert.deepEqual(
    result.filter((entry) => entry.sourceType === "archive").map((entry) => entry.extra.id).sort(),
    ["JORF-1", "JORF-2"]
  );
});
