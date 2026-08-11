import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dedupe, parseCass, parseJorf, parseRss } from "../scripts/curate.mjs";

const curatePath = new URL("../scripts/curate.mjs", import.meta.url);

test("curation module exposes an import-safe boundary for fixture tests", async () => {
  const source = await readFile(curatePath, "utf8");
  assert.match(source, /isMainModule/);
});

test("applies legal relevance at the RSS boundary and attaches explainable metadata", () => {
  const xml = `
    <rss><channel>
      <item>
        <title>SMIC : le salaire minimum est revalorisé</title>
        <description><![CDATA[Le salaire minimum interprofessionnel évolue.]]></description>
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
    name: "Service-Public - professionnels",
    kind: "rss",
    defaultCategory: "actualite",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "SMIC : le salaire minimum est revalorisé");
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
  assert.match(accepted.legalRelevance.reasons.join(" "), /salaire minimum/i);
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
