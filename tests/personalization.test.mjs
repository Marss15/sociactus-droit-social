import test from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK_STORAGE_KEY,
  FEEDBACK_VALUES,
  MAX_FEEDBACK_RECORDS,
  emptyFeedbackStore,
  effectivePriority,
  normalizeFeedbackStore,
  preferenceScore,
  preferenceSummary,
  rankEntries,
  readFeedbackStore,
  recordFeedback,
  snapshotEntryFeatures,
  writeFeedbackStore,
} from "../lib/personalization.mjs";

const entry = {
  id: "entry-1",
  category: "regle",
  sourceType: "archive",
  sourceName: "DILA JORFSIMPLE",
  themes: ["Paie"],
  extra: { collectiveAgreement: { key: "idcc-1486" } },
  legalRelevance: { level: "strong" },
};

test("records a useful feedback toggle and removes it when selected again", () => {
  const empty = emptyFeedbackStore();
  const useful = recordFeedback(empty, entry, 1, { timestamp: "2026-08-11T09:00:00.000Z" });
  const neutral = recordFeedback(useful, entry, 1, { timestamp: "2026-08-11T09:01:00.000Z" });

  assert.deepEqual(empty.records, []);
  assert.equal(useful.schemaVersion, 1);
  assert.equal(useful.records.length, 1);
  assert.equal(useful.records[0].value, 1);
  assert.equal(useful.records[0].entryId, "entry-1");
  assert.equal(neutral.records.length, 0);
  assert.equal(JSON.stringify(useful).includes("DILA"), true);
});

test("normalizes corrupt and legacy storage without throwing and writes only stable features", () => {
  const corruptStorage = {
    getItem() {
      return "not-json";
    },
  };
  const legacyStorage = {
    getItem() {
      return JSON.stringify({ schemaVersion: 0, records: [{ entryId: "old", value: 1 }] });
    },
  };
  const storage = {
    value: "",
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.lastKey = key;
      this.value = value;
    },
  };

  assert.deepEqual(readFeedbackStore(corruptStorage), emptyFeedbackStore());
  assert.deepEqual(readFeedbackStore(legacyStorage), emptyFeedbackStore());
  const updated = writeFeedbackStore(storage, recordFeedback(emptyFeedbackStore(), {
    ...entry,
    title: "Titre privé à ne jamais stocker",
    summary: "Corps privé à ne jamais stocker",
  }, FEEDBACK_VALUES.notUseful, { timestamp: "2026-08-11T09:00:00Z" }));
  const serialized = storage.value;

  assert.equal(updated.records.length, 1);
  assert.equal(storage.lastKey, FEEDBACK_STORAGE_KEY);
  assert.equal(serialized.includes("Titre privé"), false);
  assert.equal(serialized.includes("Corps privé"), false);
  assert.deepEqual(Object.keys(updated.records[0]).sort(), [
    "authorityLevel",
    "category",
    "conventionKey",
    "entryId",
    "relevanceLevel",
    "sourceKind",
    "sourceName",
    "themes",
    "timestamp",
    "value",
  ]);
});

test("derives authority from source independently from legal relevance", () => {
  const cass = snapshotEntryFeatures({
    id: "cass",
    sourceType: "archive",
    sourceName: "DILA CASS",
    legalRelevance: { level: "strong" },
  });
  const jorf = snapshotEntryFeatures({
    id: "jorf",
    sourceType: "archive",
    sourceName: "DILA JORFSIMPLE",
    legalRelevance: { level: "excluded" },
  });
  const institutional = snapshotEntryFeatures({
    id: "institutional",
    sourceType: "rss",
    sourceName: "Vie-publique - actualités",
    legalRelevance: { level: "strong" },
  });
  const press = snapshotEntryFeatures({
    id: "press",
    sourceType: "press-rss",
    sourceKind: "press",
    sourceName: "Le Monde - économie",
    legalRelevance: { level: "primary" },
  });

  assert.equal(cass.authorityLevel, "primary");
  assert.equal(jorf.authorityLevel, "primary");
  assert.equal(institutional.authorityLevel, "official");
  assert.equal(press.authorityLevel, "secondary");
  assert.equal(cass.relevanceLevel, "strong");
  assert.equal(jorf.relevanceLevel, "excluded");
  assert.equal(press.relevanceLevel, "primary");
  assert.notEqual(cass.authorityLevel, cass.relevanceLevel);
});

test("caps feedback records and keeps stable normalized feature snapshots", () => {
  const records = Array.from({ length: MAX_FEEDBACK_RECORDS + 20 }, (_, index) => ({
    ...snapshotEntryFeatures({
      id: `entry-${index}`,
      category: "regle",
      sourceType: "archive",
      sourceName: "DILA",
      themes: ["Paie", "Paie"],
    }),
    value: index % 2 ? -1 : 1,
    timestamp: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const normalized = normalizeFeedbackStore({ schemaVersion: 1, records });

  assert.equal(normalized.records.length, MAX_FEEDBACK_RECORDS);
  assert.deepEqual(normalized.records[0].themes, ["Paie"]);
  assert.equal(normalized.records.every((record) => record.value === 1 || record.value === -1), true);
});

test("keeps the newest valid duplicate record regardless of physical order", () => {
  const older = {
    ...snapshotEntryFeatures({ ...entry, id: "duplicate" }),
    value: 1,
    timestamp: "2026-08-11T09:00:00.000Z",
  };
  const newer = {
    ...snapshotEntryFeatures({ ...entry, id: "duplicate" }),
    value: -1,
    timestamp: "2026-08-11T10:00:00.000Z",
  };

  const first = normalizeFeedbackStore({ schemaVersion: 1, records: [newer, older] });
  const second = normalizeFeedbackStore({ schemaVersion: 1, records: [older, newer] });

  assert.equal(first.records[0].value, -1);
  assert.deepEqual(first, second);
});

test("keeps editorial priority primary while bounded feedback reranks equal priorities", () => {
  const highEditorial = { ...entry, id: "high-editorial", priorityRank: "p1", priority: 100, themes: ["Retraite"] };
  const lowEditorial = { ...entry, id: "low-editorial", priorityRank: "p1", priority: 1, themes: ["Paie"] };
  const equalA = { ...entry, id: "equal-a", priorityRank: "p1", priority: 20, themes: ["Paie"] };
  const equalB = { ...entry, id: "equal-b", priorityRank: "p1", priority: 20, themes: ["Retraite"] };
  const store = recordFeedback(emptyFeedbackStore(), lowEditorial, 1, { timestamp: "2026-08-11T09:00:00Z" });

  const bounded = effectivePriority(lowEditorial, preferenceScore(lowEditorial, store)) - lowEditorial.priority;
  assert.equal(bounded <= 3.5, true);
  assert.equal(bounded >= -3.5, true);
  assert.deepEqual(rankEntries([lowEditorial, highEditorial], store).map(({ id }) => id), ["high-editorial", "low-editorial"]);
  assert.deepEqual(rankEntries([equalB, equalA], store).map(({ id }) => id), ["equal-a", "equal-b"]);
});

test("uses bounded regularized affinities and deterministic ranking without hiding disliked entries", () => {
  const liked = { ...entry, id: "liked", priorityRank: "p1", themes: ["Paie", "Contrat"] };
  const disliked = { ...entry, id: "disliked", priorityRank: "p1", themes: ["Retraite"], category: "actualite" };
  const lowerRank = { ...entry, id: "lower-rank", priorityRank: "p2", category: "regle" };
  const store = recordFeedback(emptyFeedbackStore(), liked, 1, { timestamp: "2026-08-11T09:00:00Z" });
  const before = JSON.stringify(store);

  const first = rankEntries([lowerRank, disliked, liked], store, { allRanks: true });
  const second = rankEntries([lowerRank, disliked, liked], store, { allRanks: true });

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map(({ id }) => id), ["liked", "disliked", "lower-rank"]);
  assert.equal(preferenceScore(liked, store) <= 0.35, true);
  assert.equal(preferenceScore(liked, store) >= -0.35, true);
  assert.equal(JSON.stringify(store), before);
  assert.deepEqual(preferenceSummary(store), { count: 1, useful: 1, notUseful: 0, maxRecords: MAX_FEEDBACK_RECORDS });
});

test("persists isolated user profiles and changes only the voting user's recommendations", () => {
  const memoryStorage = () => ({
    values: new Map(),
    getItem(key) {
      return this.values.get(key) ?? null;
    },
    setItem(key, value) {
      this.values.set(key, value);
    },
  });
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  const candidateRetirement = {
    ...entry,
    id: "candidate-retirement",
    priorityRank: "p1",
    priority: 20,
    themes: ["Retraite"],
  };
  const candidateSalary = {
    ...entry,
    id: "candidate-salary",
    priorityRank: "p1",
    priority: 20,
    themes: ["Paie"],
  };
  const candidates = [candidateRetirement, candidateSalary];
  let userA = emptyFeedbackStore();

  for (let index = 0; index < 4; index += 1) {
    userA = recordFeedback(
      userA,
      { ...candidateSalary, id: `salary-training-${index}` },
      FEEDBACK_VALUES.useful,
      { timestamp: `2026-08-11T09:0${index}:00.000Z` }
    );
    userA = recordFeedback(
      userA,
      { ...candidateRetirement, id: `retirement-training-${index}` },
      FEEDBACK_VALUES.notUseful,
      { timestamp: `2026-08-11T09:1${index}:00.000Z` }
    );
  }

  writeFeedbackStore(storageA, userA);
  writeFeedbackStore(storageB, emptyFeedbackStore());
  const reloadedA = readFeedbackStore(storageA);
  const reloadedB = readFeedbackStore(storageB);
  const baseline = rankEntries(candidates, emptyFeedbackStore()).map(({ id }) => id);
  const rankedA = rankEntries(candidates, reloadedA).map(({ id }) => id);
  const rankedB = rankEntries(candidates, reloadedB).map(({ id }) => id);

  assert.deepEqual(baseline, ["candidate-retirement", "candidate-salary"]);
  assert.deepEqual(rankedA, ["candidate-salary", "candidate-retirement"]);
  assert.deepEqual(rankedB, baseline);
  assert.equal(preferenceSummary(reloadedA).count, 8);
  assert.equal(preferenceSummary(reloadedB).count, 0);
  assert.notEqual(storageA.getItem(FEEDBACK_STORAGE_KEY), storageB.getItem(FEEDBACK_STORAGE_KEY));
});

test("keeps P1 ahead of lower ranks even when feedback dislikes the P1 item", () => {
  const p1 = { ...entry, id: "p1", priorityRank: "p1" };
  const p2 = { ...entry, id: "p2", priorityRank: "p2" };
  const store = recordFeedback(emptyFeedbackStore(), p1, -1, { timestamp: "2026-08-11T09:00:00Z" });
  const ranked = rankEntries([p2, p1], store, { allRanks: true });

  assert.deepEqual(ranked.map(({ id }) => id), ["p1", "p2"]);
});
