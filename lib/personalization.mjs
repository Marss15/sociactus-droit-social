export const PERSONALIZATION_SCHEMA_VERSION = 1;
export const FEEDBACK_STORAGE_KEY = "sociactus-feedback-v1";
export const MAX_FEEDBACK_RECORDS = 250;
export const FEEDBACK_VALUES = Object.freeze({ useful: 1, notUseful: -1, neutral: null });
export const PERSONALIZATION_PRIORITY_SCALE = 10;

const REGULARIZATION = 3;
const SCORE_LIMIT = 0.35;
const FEATURE_WEIGHTS = Object.freeze({
  category: 0.2,
  themes: 0.18,
  sourceKind: 0.12,
  sourceName: 0.1,
  convention: 0.14,
  authorityLevel: 0.13,
  relevanceLevel: 0.13,
});

export function emptyFeedbackStore() {
  return {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    records: [],
  };
}

export function normalizeFeedbackStore(value) {
  const parsed = parseStoreValue(value);
  if (!parsed || parsed.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION || !Array.isArray(parsed.records)) {
    return emptyFeedbackStore();
  }

  const byEntryId = new Map();
  for (const record of parsed.records) {
    const normalized = normalizeRecord(record);
    const current = normalized ? byEntryId.get(normalized.entryId) : null;
    if (normalized && (!current || isPreferredRecord(normalized, current))) {
      byEntryId.set(normalized.entryId, normalized);
    }
  }

  const records = [...byEntryId.values()]
    .sort(compareRecords)
    .slice(0, MAX_FEEDBACK_RECORDS);
  return {
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    records,
  };
}

export function readFeedbackStore(storage, key = FEEDBACK_STORAGE_KEY) {
  const target = resolveStorage(storage);
  if (!target || typeof target.getItem !== "function") {
    return emptyFeedbackStore();
  }
  try {
    return normalizeFeedbackStore(target.getItem(key));
  } catch {
    return emptyFeedbackStore();
  }
}

export function writeFeedbackStore(storage, store, key = FEEDBACK_STORAGE_KEY) {
  const normalized = normalizeFeedbackStore(store);
  const target = resolveStorage(storage);
  if (target && typeof target.setItem === "function") {
    try {
      target.setItem(key, JSON.stringify(normalized));
    } catch {
      // Local preference persistence is best effort and must never break the UI.
    }
  }
  return normalized;
}

export function recordFeedback(store, entry, value, options = {}) {
  const normalizedStore = normalizeFeedbackStore(store);
  const entryId = normalizeScalar(entry?.id);
  if (!entryId) {
    return normalizedStore;
  }

  const normalizedValue = normalizeFeedbackValue(value);
  const existing = normalizedStore.records.find((record) => record.entryId === entryId);
  const records = normalizedStore.records.filter((record) => record.entryId !== entryId);

  if (normalizedValue === null || existing?.value === normalizedValue) {
    return normalizeFeedbackStore({
      schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
      records,
    });
  }

  records.push({
    ...snapshotEntryFeatures(entry),
    value: normalizedValue,
    timestamp: resolveTimestamp(options),
  });
  return normalizeFeedbackStore({
    schemaVersion: PERSONALIZATION_SCHEMA_VERSION,
    records,
  });
}

export function feedbackValueFor(store, entryId) {
  const id = normalizeScalar(entryId);
  if (!id) {
    return null;
  }
  return normalizeFeedbackStore(store).records.find((record) => record.entryId === id)?.value ?? null;
}

export function snapshotEntryFeatures(entry = {}) {
  const authorityLevel =
    deriveAuthorityLevel(entry) || normalizeScalar(entry.authorityLevel || "unknown") || "unknown";
  const relevanceLevel = normalizeScalar(entry.relevanceLevel || entry.legalRelevance?.level || "unknown") || "unknown";
  return {
    entryId: normalizeScalar(entry.id) || "",
    category: normalizeScalar(entry.category) || "unknown",
    sourceKind: normalizeScalar(entry.sourceKind || entry.sourceType || entry.extra?.sourceKind) || "unknown",
    sourceName: normalizeScalar(entry.sourceName) || "unknown",
    themes: normalizeList(entry.themes),
    conventionKey:
      normalizeScalar(entry.conventionKey || entry.extra?.collectiveAgreement?.key) || "none",
    authorityLevel,
    relevanceLevel,
  };
}

export function buildAffinities(store) {
  const maps = createAffinityMaps();
  for (const record of normalizeFeedbackStore(store).records) {
    const dimensions = snapshotDimensions(record);
    for (const [dimension, values] of Object.entries(dimensions)) {
      for (const value of values) {
        const key = featureKey(dimension, value);
        const current = maps[dimension].get(key) || { sum: 0, count: 0 };
        current.sum += record.value;
        current.count += 1;
        maps[dimension].set(key, current);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(maps).map(([dimension, values]) => [
      dimension,
      Object.fromEntries(
        [...values.entries()].map(([key, { sum, count }]) => [
          key,
          clamp(sum / (count + REGULARIZATION), -1, 1),
        ])
      ),
    ])
  );
}

export function preferenceScore(entry, storeOrAffinities = emptyFeedbackStore()) {
  const affinities = looksLikeAffinityMap(storeOrAffinities)
    ? storeOrAffinities
    : buildAffinities(storeOrAffinities);
  const dimensions = snapshotDimensions(snapshotEntryFeatures(entry));
  let score = 0;

  for (const [dimension, values] of Object.entries(dimensions)) {
    const weight = FEATURE_WEIGHTS[dimension] || 0;
    if (!values.length || !weight) {
      continue;
    }
    const matches = values
      .map((value) => affinities[dimension]?.[featureKey(dimension, value)] || 0)
      .filter((value) => Number.isFinite(value));
    if (!matches.length) {
      continue;
    }
    const dimensionScore = matches.reduce((total, value) => total + value, 0) / matches.length;
    score += dimensionScore * weight;
  }

  return clamp(score, -SCORE_LIMIT, SCORE_LIMIT);
}

export function effectivePriority(entry, score = 0) {
  const basePriority = Number(entry?.priority);
  return (Number.isFinite(basePriority) ? basePriority : 0) +
    clamp(Number(score), -SCORE_LIMIT, SCORE_LIMIT) * PERSONALIZATION_PRIORITY_SCALE;
}

export function rankEntries(entries = [], store = emptyFeedbackStore(), options = {}) {
  const affinities = buildAffinities(store);
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const score = preferenceScore(entry, affinities);
      return {
        entry,
        index,
        score,
        effectivePriority: effectivePriority(entry, score),
      };
    })
    .sort((left, right) => {
      const rankDifference = priorityWeight(right.entry?.priorityRank) - priorityWeight(left.entry?.priorityRank);
      if (rankDifference) {
        return rankDifference;
      }
      const priorityDifference = right.effectivePriority - left.effectivePriority;
      if (priorityDifference) {
        return priorityDifference;
      }
      const scoreDifference = right.score - left.score;
      if (Math.abs(scoreDifference) > Number.EPSILON) {
        return scoreDifference;
      }
      const idDifference = String(left.entry?.id || "").localeCompare(String(right.entry?.id || ""));
      return idDifference || left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function preferenceSummary(store) {
  const records = normalizeFeedbackStore(store).records;
  return {
    count: records.length,
    useful: records.filter((record) => record.value === FEEDBACK_VALUES.useful).length,
    notUseful: records.filter((record) => record.value === FEEDBACK_VALUES.notUseful).length,
    maxRecords: MAX_FEEDBACK_RECORDS,
  };
}

function parseStoreValue(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? value : null;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const entryId = normalizeScalar(record.entryId);
  const value = normalizeFeedbackValue(record.value);
  const timestamp = normalizeTimestamp(record.timestamp);
  if (!entryId || value === null || !timestamp) {
    return null;
  }

  const features = snapshotEntryFeatures(record);
  return {
    ...features,
    entryId,
    value,
    timestamp,
  };
}

function snapshotDimensions(features) {
  return {
    category: features.category && features.category !== "unknown" ? [features.category] : [],
    themes: normalizeList(features.themes),
    sourceKind: features.sourceKind && features.sourceKind !== "unknown" ? [features.sourceKind] : [],
    sourceName: features.sourceName && features.sourceName !== "unknown" ? [features.sourceName] : [],
    convention: features.conventionKey && features.conventionKey !== "none" ? [features.conventionKey] : [],
    authorityLevel: features.authorityLevel && features.authorityLevel !== "unknown" ? [features.authorityLevel] : [],
    relevanceLevel: features.relevanceLevel && features.relevanceLevel !== "unknown" ? [features.relevanceLevel] : [],
  };
}

function createAffinityMaps() {
  return {
    category: new Map(),
    themes: new Map(),
    sourceKind: new Map(),
    sourceName: new Map(),
    convention: new Map(),
    authorityLevel: new Map(),
    relevanceLevel: new Map(),
  };
}

function featureKey(dimension, value) {
  return `${dimension}:${String(value)}`;
}

function looksLikeAffinityMap(value) {
  return Boolean(value && typeof value === "object" && value.category && value.themes);
}

function normalizeFeedbackValue(value) {
  return value === 1 || value === -1 ? value : null;
}

function deriveAuthorityLevel(entry) {
  const sourceType = normalizeScalar(entry.sourceType).toLowerCase();
  const sourceKind = normalizeScalar(entry.sourceKind || entry.kind || entry.extra?.sourceKind).toLowerCase();
  const sourceName = normalizeScalar(entry.sourceName).toLowerCase();
  const category = normalizeScalar(entry.category).toLowerCase();

  if (sourceType === "press-rss" || sourceKind === "press" || category === "presse") {
    return "secondary";
  }
  if (
    sourceType === "archive" &&
    (sourceKind === "cass" || sourceKind === "jorf" || sourceName.includes("cass") || sourceName.includes("jorf"))
  ) {
    return "primary";
  }
  if (sourceType === "rss" || sourceKind === "rss" || sourceKind === "official" || sourceKind === "institutional") {
    return "official";
  }
  return null;
}

function normalizeScalar(value, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => normalizeScalar(item, 80)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeTimestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isPreferredRecord(candidate, current) {
  const timestampDifference = candidate.timestamp.localeCompare(current.timestamp);
  if (timestampDifference) {
    return timestampDifference > 0;
  }
  return JSON.stringify(candidate).localeCompare(JSON.stringify(current)) > 0;
}

function resolveTimestamp(options) {
  const candidate =
    typeof options === "string" || typeof options === "number"
      ? options
      : options?.timestamp ?? options?.now ?? new Date().toISOString();
  return normalizeTimestamp(candidate) || new Date(0).toISOString();
}

function compareRecords(left, right) {
  return right.timestamp.localeCompare(left.timestamp) || left.entryId.localeCompare(right.entryId);
}

function resolveStorage(storage) {
  if (storage !== undefined && storage !== null) {
    return storage;
  }
  try {
    return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function priorityWeight(rank) {
  return { p1: 3, p2: 2, p3: 1 }[rank] || 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));
}
