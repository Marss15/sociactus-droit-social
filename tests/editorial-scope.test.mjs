import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { editorialCategory, focusedEntries } from "../lib/editorial-scope.mjs";

const jorf = (title, nature = "DECRET") => ({
  title, nature, sourceKind: "jorf", url: "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000012345678",
});

test("published law and decree require a direct labour subject and official identifier", () => {
  assert.equal(editorialCategory(jorf("Décret relatif au SMIC")), "regle");
  assert.equal(editorialCategory(jorf("Loi relative aux congés payés", "LOI")), "regle");
  assert.equal(editorialCategory(jorf("Arrêté relatif au SMIC", "ARRETE")), null);
  assert.equal(editorialCategory(jorf("Décret portant nomination d'un directeur du travail")), null);
  assert.equal(editorialCategory({ ...jorf("Décret relatif au SMIC"), url: "https://example.test/" }), null);
});

test("drafts are not confused with already enacted laws", () => {
  const base = { sourceKind: "draft", sourceName: "Vie-publique - lois" };
  assert.equal(editorialCategory({ ...base, title: "Projet de loi sur la transparence des rémunérations" }), "projet-loi");
  assert.equal(editorialCategory({ ...base, title: "Loi du 10 août 2026 sur les congés payés" }), null);
  assert.equal(editorialCategory({ ...base, title: "Projet de loi sur les animaux" }), null);
});

test("press needs an employment-law subject in its title and a concrete development", () => {
  const base = { sourceKind: "press", sourceType: "press-rss" };
  assert.equal(editorialCategory({ ...base, title: "Licenciement : un nouvel accord collectif est signé" }), "presse");
  assert.equal(editorialCategory({ ...base, title: "Le chômage inquiète les entreprises" }), null);
  assert.equal(editorialCategory({ ...base, title: "La vie des salariés au bureau" }), null);
  assert.equal(editorialCategory({ ...base, title: "Les congés payés en 1936 : une réforme historique" }), null);
});

test("old editions cannot reintroduce out-of-scope entries", async () => {
  const day = JSON.parse(await readFile(new URL("../data/2026-08-11.json", import.meta.url), "utf8"));
  assert.deepEqual(focusedEntries(day.entries), []);
  assert.equal(day.entries.length > 0, true);
});

test("reader presents only the three requested streams and an honest empty state", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
  ]);
  assert.equal((html.match(/data-filter=/g) || []).length, 4);
  assert.doesNotMatch(html, /data-priority=|feedback-panel|convention-panel|Jurisprudence/);
  assert.match(app, /Aucune actualité de droit social répondant aux critères/);
  assert.match(app, /Dernière édition/);
  assert.match(app, /focusedEntries/);
  assert.doesNotMatch(app, /innerHTML/);
});
