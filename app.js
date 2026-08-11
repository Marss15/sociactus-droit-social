import {
  FEEDBACK_VALUES,
  emptyFeedbackStore,
  feedbackValueFor,
  preferenceSummary,
  rankEntries,
  readFeedbackStore,
  recordFeedback,
  writeFeedbackStore,
} from "./lib/personalization.mjs";
import { enrichLegacyEntries } from "./lib/legal-relevance.mjs";

const state = {
  index: null,
  day: null,
  filter: "all",
  priorityFilter: "p1",
  query: "",
  conventionPriorities: null,
  feedbackStore: emptyFeedbackStore(),
  feedbackStatus: "",
  dayRequestSequence: 0,
};

const config = window.SOCIACTUS_CONFIG || {};
const dataBaseUrl = normalizeBaseUrl(config.dataBaseUrl || "data");
const fallbackDataBaseUrl = dataBaseUrl === "data" ? null : "data";

const categoryLabels = {
  regle: "Règle applicable",
  jurisprudence: "Jurisprudence",
  "projet-loi": "Projet de loi",
  actualite: "Actualité",
  presse: "Presse",
};

const impactLabels = {
  high: "À traiter",
  medium: "Important",
  watch: "À suivre",
  low: "Veille",
};

const priorityLabels = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

const priorityFilterLabels = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
  all: "Tous rangs",
};

const filterLabels = {
  all: "Tout",
  regle: "Règles",
  jurisprudence: "Jurisprudence",
  "projet-loi": "Projets",
  actualite: "Actualités",
  presse: "Presse",
};

const els = {
  runStatus: document.querySelector("#run-status"),
  dayList: document.querySelector("#day-list"),
  sourceList: document.querySelector("#source-list"),
  journalTitle: document.querySelector("#journal-title"),
  metrics: document.querySelector("#metrics"),
  search: document.querySelector("#search-input"),
  resultCount: document.querySelector("#result-count"),
  activeFilters: document.querySelector("#active-filters"),
  resetFilters: document.querySelector("#reset-filters"),
  entryList: document.querySelector("#entry-list"),
  template: document.querySelector("#entry-template"),
  segments: document.querySelectorAll(".segment"),
  categorySegments: document.querySelectorAll("[data-filter]"),
  prioritySegments: document.querySelectorAll("[data-priority]"),
  conventionStatus: document.querySelector("#convention-status"),
  conventionList: document.querySelector("#convention-list"),
  adminToken: document.querySelector("#admin-token"),
  saveConventions: document.querySelector("#save-conventions"),
  feedbackSummary: document.querySelector("#feedback-summary"),
  resetFeedback: document.querySelector("#reset-feedback"),
  feedbackStatus: document.querySelector("#feedback-status"),
};

boot();

async function boot() {
  try {
    state.feedbackStore = readFeedbackStore();
    renderFeedbackSummary();
    const index = await fetchDataJson("index.json");
    state.index = index;
    await loadConventionPriorities();
    renderIndex(index);
    if (index.latestDate) {
      await loadDay(index.latestDate);
    } else {
      renderEmpty("Aucune édition n'a encore été générée.");
    }
  } catch (error) {
    console.error(error);
    els.runStatus.textContent = "Impossible de charger les données de veille.";
    renderEmpty("Lancez `npm run curate` pour générer le premier journal.");
  }

  els.search.addEventListener("input", (event) => {
    state.query = event.currentTarget.value.trim().toLowerCase();
    renderEntries();
  });

  els.categorySegments.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      setPressedGroup(els.categorySegments, button);
      renderEntries();
    });
  });

  els.prioritySegments.forEach((button) => {
    button.addEventListener("click", () => {
      state.priorityFilter = button.dataset.priority;
      setPressedGroup(els.prioritySegments, button);
      renderEntries();
    });
  });

  els.resetFilters.addEventListener("click", () => {
    state.filter = "all";
    state.priorityFilter = "p1";
    state.query = "";
    els.search.value = "";
    setPressedGroup(els.categorySegments, document.querySelector('[data-filter="all"]'));
    setPressedGroup(els.prioritySegments, document.querySelector('[data-priority="p1"]'));
    renderEntries();
  });

  els.adminToken.value = localStorage.getItem("sociactus-admin-token") || "";
  els.adminToken.addEventListener("input", () => {
    localStorage.setItem("sociactus-admin-token", els.adminToken.value.trim());
  });
  els.saveConventions.addEventListener("click", saveConventionPriorities);
  els.resetFeedback.addEventListener("click", resetFeedback);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchDataJson(fileName) {
  try {
    return await fetchJson(dataUrl(dataBaseUrl, fileName));
  } catch (error) {
    if (!fallbackDataBaseUrl) {
      throw error;
    }
    console.warn(`Source distante indisponible, tentative locale pour ${fileName}.`, error);
    return fetchJson(dataUrl(fallbackDataBaseUrl, fileName));
  }
}

async function loadConventionPriorities() {
  try {
    state.conventionPriorities = await fetchJson("/api/convention-priorities");
    els.conventionStatus.textContent = "Priorités chargées depuis Netlify.";
  } catch (error) {
    console.warn("Préférences conventions indisponibles, utilisation des données du journal.", error);
    state.conventionPriorities = { schemaVersion: 1, defaultRank: "p3", priorityRules: [], observed: {} };
    els.conventionStatus.textContent = "Mode local : préférences distantes indisponibles.";
  }
}

function dataUrl(baseUrl, fileName) {
  return `${baseUrl}/${fileName}`;
}

function normalizeBaseUrl(value) {
  return String(value || "data").replace(/\/+$/, "");
}

function renderIndex(index) {
  els.runStatus.textContent = index.generatedAt
    ? `Dernière curation : ${formatDateTime(index.generatedAt)}`
    : "Journal prêt";

  els.dayList.innerHTML = "";
  for (const day of index.days || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.dataset.date = day.date;
    const dateLabel = document.createElement("span");
    dateLabel.textContent = formatDate(day.date);
    const totalLabel = document.createElement("small");
    totalLabel.textContent = `${Number(day.total) || 0} entrees`;
    button.append(dateLabel, totalLabel);
    button.addEventListener("click", () => loadDay(day.date));
    els.dayList.append(button);
  }
}

async function loadDay(date) {
  const requestSequence = ++state.dayRequestSequence;
  let rawDay;
  try {
    rawDay = await fetchDataJson(`${date}.json`);
  } catch (error) {
    if (requestSequence !== state.dayRequestSequence) {
      return;
    }
    throw error;
  }
  if (requestSequence !== state.dayRequestSequence) {
    return;
  }
  const day = {
    ...rawDay,
    entries: enrichLegacyEntries(rawDay.entries || []),
  };
  state.day = day;
  applyConventionPriorities();
  document.querySelectorAll(".day-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.date === date);
  });
  renderDay(day);
}

function renderDay(day) {
  els.journalTitle.textContent = `Journal du ${formatDate(day.date)}`;
  renderMetrics(computeStats(day.entries || []));
  renderSources(day.sources);
  renderConventionPanel();
  renderEntries();
}

function renderMetrics(stats = {}) {
  const metrics = [
    ["P1", stats.priorite1 || 0],
    ["P2", stats.priorite2 || 0],
    ["P3", stats.priorite3 || 0],
    ["Total", stats.total || 0],
    ["Presse", stats.presse || 0],
  ];

  els.metrics.replaceChildren();
  for (const [label, value] of metrics) {
    const metric = document.createElement("div");
    metric.className = "metric";
    const valueNode = document.createElement("strong");
    valueNode.textContent = String(value);
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    metric.append(valueNode, labelNode);
    els.metrics.append(metric);
  }
}

function renderConventionPanel() {
  const priorities = state.conventionPriorities;
  const observed = mergeObservedConventions(priorities);
  const entries = Object.entries(observed).sort(([, a], [, b]) => {
    const byRank = rankWeight(b.rank) - rankWeight(a.rank);
    return byRank || String(a.label).localeCompare(String(b.label));
  });

  els.conventionList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-compact";
    empty.textContent = "Aucune convention détectée dans le journal.";
    els.conventionList.append(empty);
    return;
  }

  for (const [key, item] of entries) {
    const row = document.createElement("label");
    row.className = "convention-row";

    const text = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = item.label || "Convention sans libellé";
    const small = document.createElement("small");
    small.textContent = `${item.idcc ? `IDCC ${item.idcc}` : "Sans IDCC"} · vu ${Number(item.seenCount || 0) || 0} fois`;
    text.append(strong, small);

    const select = document.createElement("select");
    select.dataset.conventionKey = String(key);
    select.setAttribute("aria-label", `Priorité ${item.label || "de la convention"}`);
    for (const rank of ["p1", "p2", "p3"]) {
      const option = document.createElement("option");
      option.value = rank;
      option.textContent = rank.toUpperCase();
      option.selected = item.rank === rank;
      select.append(option);
    }

    row.append(text, select);
    els.conventionList.append(row);
  }
}

async function saveConventionPriorities() {
  const token = els.adminToken.value.trim();
  if (!token) {
    els.conventionStatus.textContent = "Jeton admin requis pour enregistrer.";
    els.adminToken.focus();
    return;
  }

  const priorities = {
    ...(state.conventionPriorities || {}),
    schemaVersion: 1,
    observed: mergeObservedConventions(state.conventionPriorities),
  };

  els.conventionList.querySelectorAll("[data-convention-key]").forEach((select) => {
    const item = priorities.observed[select.dataset.conventionKey];
    if (item) {
      item.rank = select.value;
    }
  });

  els.saveConventions.disabled = true;
  els.conventionStatus.textContent = "Enregistrement...";
  try {
    const response = await fetch("/api/convention-priorities", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(priorities),
    });
    const saved = await response.json();
    if (!response.ok) {
      throw new Error(saved.error || `HTTP ${response.status}`);
    }
    state.conventionPriorities = saved;
    applyConventionPriorities();
    renderDay(state.day);
    els.conventionStatus.textContent = "Priorités enregistrées. La prochaine curation automatique les utilisera.";
  } catch (error) {
    console.error(error);
    els.conventionStatus.textContent = `Enregistrement impossible : ${error.message}`;
  } finally {
    els.saveConventions.disabled = false;
  }
}

function mergeObservedConventions(priorities = {}) {
  const observed = { ...(priorities?.observed || {}) };
  for (const entry of state.day?.entries || []) {
    const collectiveAgreement = entry.extra?.collectiveAgreement;
    if (!collectiveAgreement?.key) {
      continue;
    }
    const current = observed[collectiveAgreement.key] || {};
    observed[collectiveAgreement.key] = {
      label: current.label || collectiveAgreement.label,
      idcc: current.idcc || collectiveAgreement.idcc,
      rank: current.rank || collectiveAgreement.rank || priorities.defaultRank || "p3",
      firstSeen: current.firstSeen || entry.firstSeenDate || entry.date,
      lastSeen: entry.date,
      seenCount: Number(current.seenCount || 0) || 1,
    };
  }
  return observed;
}

function applyConventionPriorities() {
  if (!state.day || !state.conventionPriorities) {
    return;
  }
  const observed = mergeObservedConventions(state.conventionPriorities);
  for (const entry of state.day.entries || []) {
    const collectiveAgreement = entry.extra?.collectiveAgreement;
    if (!collectiveAgreement?.key) {
      continue;
    }
    const item = observed[collectiveAgreement.key];
    const rank = item?.rank || collectiveAgreement.rank || "p3";
    collectiveAgreement.rank = rank;
    collectiveAgreement.label = item?.label || collectiveAgreement.label;
    entry.priorityRank = rank;
    entry.priorityLabel = priorityLabels[rank] || "P3";
    entry.priorityReason =
      rank === "p1"
        ? `Convention collective prioritaire : ${collectiveAgreement.label}.`
        : rank === "p2"
          ? `Convention collective suivie : ${collectiveAgreement.label}.`
          : `Convention collective non prioritaire : ${collectiveAgreement.label}.`;
  }
}

function renderSources(sources = []) {
  els.sourceList.innerHTML = "";
  for (const source of sources) {
    const item = document.createElement("li");
    item.textContent = `${source.name} - ${source.status}`;
    els.sourceList.append(item);
  }
}

function renderEntries() {
  if (!state.day) {
    return;
  }

  const entries = rankEntries(filteredEntries(), state.feedbackStore, {
    allRanks: state.priorityFilter === "all",
  });

  renderFilterStatus(entries.length);

  els.entryList.innerHTML = "";

  if (!entries.length) {
    renderEmpty("Aucune entrée ne correspond aux filtres actifs.");
    return;
  }

  for (const entry of entries) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const entryId = String(entry.id || "");
    node.dataset.entryId = entryId;

    const meta = node.querySelector(".entry-meta");
    meta.replaceChildren();
    const categoryBadge = document.createElement("span");
    categoryBadge.className = `badge ${Object.hasOwn(categoryLabels, entry.category) ? entry.category : "unknown"}`;
    categoryBadge.textContent = categoryLabels[entry.category] || String(entry.category || "Information");
    const source = document.createElement("span");
    source.textContent = String(entry.sourceName || "Source inconnue");
    const published = document.createElement("span");
    published.textContent = formatDate(entry.publishedAt || entry.date);
    meta.append(categoryBadge, source, published);

    node.querySelector("h3").textContent = entry.title;
    node.querySelector(".impact").className = `impact ${entry.impact || "low"}`;
    node.querySelector(".impact").textContent = impactLabels[entry.impact] || "Veille";
    node.querySelector(".priority-badge").className = `priority-badge ${entry.priorityRank || "p3"}`;
    node.querySelector(".priority-badge").textContent = priorityLabels[entry.priorityRank] || "P3";
    node.querySelector(".priority-badge").title = entry.priorityReason || "";
    node.querySelector(".summary").textContent = entry.summary;
    node.querySelector(".priority-reason").textContent = entry.priorityReason || "";
    node.querySelector(".application").textContent = entry.application?.label || "Date à confirmer dans la source.";
    node.querySelector(".watch").textContent = entry.watch || "Vérifier la source avant toute décision.";
    const legalEvidence = node.querySelector(".legal-evidence-block");
    const legalReasons = entry.legalRelevance?.reasons || [];
    if (legalReasons.length) {
      node.querySelector(".legal-evidence").textContent = legalReasons.slice(0, 2).join(" ");
    } else {
      legalEvidence.hidden = true;
    }

    const themes = node.querySelector(".themes");
    themes.replaceChildren();
    for (const theme of entry.themes || []) {
      const themeNode = document.createElement("span");
      themeNode.className = "theme";
      themeNode.textContent = theme;
      themes.append(themeNode);
    }

    const feedbackGroup = node.querySelector(".feedback-controls");
    feedbackGroup.dataset.entryId = entryId;
    feedbackGroup.setAttribute("aria-label", `Évaluer cette entrée : ${entry.title}`);
    const currentFeedback = feedbackValueFor(state.feedbackStore, entry.id);
    feedbackGroup.querySelectorAll("[data-feedback]").forEach((button) => {
      const value = Number(button.dataset.feedback);
      button.dataset.entryId = entryId;
      button.value = String(value);
      const selected = currentFeedback === value;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("selected", selected);
      button.addEventListener("click", () => handleFeedback(entry, value));
    });
    const entryStatus = node.querySelector(".feedback-entry-status");
    entryStatus.textContent = feedbackLabel(currentFeedback);
    const link = node.querySelector(".source-link");
    link.href = safeExternalUrl(entry.url);
    link.textContent =
      entry.category === "presse"
        ? "Lire l'article"
        : String(entry.sourceName || "").includes("Archive")
          ? "Archive officielle"
          : "Source officielle";
    els.entryList.append(node);
  }
}

function handleFeedback(entry, value) {
  const entryId = String(entry.id || "");
  state.feedbackStore = writeFeedbackStore(
    null,
    recordFeedback(state.feedbackStore, entry, value, { timestamp: new Date().toISOString() })
  );
  const current = feedbackValueFor(state.feedbackStore, entry.id);
  state.feedbackStatus = current === null ? "Avis retiré. Le classement a été recalculé." : `${feedbackLabel(current)} Le classement a été recalculé.`;
  renderFeedbackSummary();
  renderEntries();
  restoreFeedbackFocus(entryId, value);
}

function restoreFeedbackFocus(entryId, value) {
  const expectedId = String(entryId || "");
  const expectedValue = String(value);
  const button = [...els.entryList.querySelectorAll(".feedback-button")].find(
    (candidate) => candidate.dataset.entryId === expectedId && candidate.value === expectedValue
  );
  button?.focus({ preventScroll: true });
}

function resetFeedback() {
  state.feedbackStore = writeFeedbackStore(null, emptyFeedbackStore());
  state.feedbackStatus = "Avis locaux réinitialisés. Le classement revient à l'ordre éditorial.";
  renderFeedbackSummary();
  renderEntries();
  els.resetFeedback.focus();
}

function renderFeedbackSummary() {
  if (!els.feedbackSummary || !els.feedbackStatus) {
    return;
  }
  const summary = preferenceSummary(state.feedbackStore);
  els.feedbackSummary.textContent = summary.count
    ? `${summary.count} avis local${summary.count > 1 ? "aux" : ""} (${summary.useful} utile${summary.useful > 1 ? "s" : ""}, ${summary.notUseful} pas utile).`
    : "Aucun avis enregistré. Vos clics restent sur cet appareil.";
  els.feedbackStatus.textContent = state.feedbackStatus;
}

function feedbackLabel(value) {
  if (value === FEEDBACK_VALUES.useful) {
    return "Avis utile enregistré. Cliquez encore pour annuler.";
  }
  if (value === FEEDBACK_VALUES.notUseful) {
    return "Avis pas utile enregistré. Cliquez encore pour annuler.";
  }
  return "";
}

function computeStats(entries = []) {
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

function filteredEntries() {
  return (state.day.entries || []).filter((entry) => {
    const matchesFilter = state.filter === "all" || entry.category === state.filter;
    const matchesPriority =
      state.priorityFilter === "all" || (entry.priorityRank || "p3") === state.priorityFilter;
    const haystack = [
      entry.title,
      entry.summary,
      entry.watch,
      entry.priorityLabel,
      entry.priorityReason,
      entry.application?.label,
      ...(entry.themes || []),
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !state.query || haystack.includes(state.query);
    return matchesFilter && matchesPriority && matchesQuery;
  });
}

function renderFilterStatus(count) {
  els.resultCount.textContent = `${count} ${count > 1 ? "résultats" : "résultat"}`;
  const chips = [
    priorityFilterLabels[state.priorityFilter] || "P1",
    filterLabels[state.filter] || "Tout",
    state.query ? `Recherche: ${state.query}` : null,
  ].filter(Boolean);

  els.activeFilters.replaceChildren();
  for (const chip of chips) {
    const chipNode = document.createElement("span");
    chipNode.className = "filter-chip";
    chipNode.textContent = chip;
    els.activeFilters.append(chipNode);
  }
  const isDefault = state.priorityFilter === "p1" && state.filter === "all" && !state.query;
  els.resetFilters.disabled = isDefault;
}

function setPressedGroup(group, activeButton) {
  group.forEach((segment) => {
    const isActive = segment === activeButton;
    segment.classList.toggle("active", isActive);
    segment.setAttribute("aria-pressed", String(isActive));
  });
}

function renderEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  els.entryList.replaceChildren(empty);
}

function safeExternalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "#";
  }
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

function formatDate(value) {
  if (!value) {
    return "Date inconnue";
  }
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function rankWeight(rank) {
  return { p1: 3, p2: 2, p3: 1 }[rank] || 0;
}
