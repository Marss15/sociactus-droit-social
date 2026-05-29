const state = {
  index: null,
  day: null,
  filter: "all",
  priorityFilter: "p1",
  query: "",
  conventionPriorities: null,
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
};

boot();

async function boot() {
  try {
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
    button.innerHTML = `<span>${formatDate(day.date)}</span><small>${day.total} entrees</small>`;
    button.addEventListener("click", () => loadDay(day.date));
    els.dayList.append(button);
  }
}

async function loadDay(date) {
  const day = await fetchDataJson(`${date}.json`);
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

  els.metrics.innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderConventionPanel() {
  const priorities = state.conventionPriorities;
  const observed = mergeObservedConventions(priorities);
  const entries = Object.entries(observed).sort(([, a], [, b]) => {
    const byRank = rankWeight(b.rank) - rankWeight(a.rank);
    return byRank || String(a.label).localeCompare(String(b.label));
  });

  els.conventionList.innerHTML = "";
  if (!entries.length) {
    els.conventionList.innerHTML = `<div class="empty-compact">Aucune convention détectée dans le journal.</div>`;
    return;
  }

  for (const [key, item] of entries) {
    const row = document.createElement("label");
    row.className = "convention-row";
    row.innerHTML = `
      <span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${item.idcc ? `IDCC ${escapeHtml(item.idcc)}` : "Sans IDCC"} · vu ${Number(item.seenCount || 0)} fois</small>
      </span>
      <select data-convention-key="${escapeHtml(key)}" aria-label="Priorité ${escapeHtml(item.label)}">
        <option value="p1"${item.rank === "p1" ? " selected" : ""}>P1</option>
        <option value="p2"${item.rank === "p2" ? " selected" : ""}>P2</option>
        <option value="p3"${item.rank === "p3" ? " selected" : ""}>P3</option>
      </select>
    `;
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

  const entries = filteredEntries();

  renderFilterStatus(entries.length);

  els.entryList.innerHTML = "";

  if (!entries.length) {
    renderEmpty("Aucune entrée ne correspond aux filtres actifs.");
    return;
  }

  for (const entry of entries) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".entry-meta").innerHTML = [
      `<span class="badge ${entry.category}">${categoryLabels[entry.category] || entry.category}</span>`,
      `<span>${entry.sourceName}</span>`,
      `<span>${formatDate(entry.publishedAt || entry.date)}</span>`,
    ].join("");
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
    node.querySelector(".themes").innerHTML = (entry.themes || [])
      .map((theme) => `<span class="theme">${theme}</span>`)
      .join("");
    const link = node.querySelector(".source-link");
    link.href = entry.url;
    link.textContent =
      entry.category === "presse"
        ? "Lire l'article"
        : entry.sourceName.includes("Archive")
          ? "Archive officielle"
          : "Source officielle";
    els.entryList.append(node);
  }
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

  els.activeFilters.innerHTML = chips.map((chip) => `<span class="filter-chip">${chip}</span>`).join("");
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
  els.entryList.innerHTML = `<div class="empty-state">${message}</div>`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
