const state = {
  index: null,
  day: null,
  filter: "all",
  priorityFilter: "p1",
  query: "",
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

const els = {
  runStatus: document.querySelector("#run-status"),
  dayList: document.querySelector("#day-list"),
  sourceList: document.querySelector("#source-list"),
  journalTitle: document.querySelector("#journal-title"),
  metrics: document.querySelector("#metrics"),
  search: document.querySelector("#search-input"),
  entryList: document.querySelector("#entry-list"),
  template: document.querySelector("#entry-template"),
  segments: document.querySelectorAll(".segment"),
  categorySegments: document.querySelectorAll("[data-filter]"),
  prioritySegments: document.querySelectorAll("[data-priority]"),
};

boot();

async function boot() {
  try {
    const index = await fetchDataJson("index.json");
    state.index = index;
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
      els.categorySegments.forEach((segment) => segment.classList.remove("active"));
      button.classList.add("active");
      renderEntries();
    });
  });

  els.prioritySegments.forEach((button) => {
    button.addEventListener("click", () => {
      state.priorityFilter = button.dataset.priority;
      els.prioritySegments.forEach((segment) => segment.classList.remove("active"));
      button.classList.add("active");
      renderEntries();
    });
  });
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
  document.querySelectorAll(".day-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.date === date);
  });
  renderDay(day);
}

function renderDay(day) {
  els.journalTitle.textContent = `Journal du ${formatDate(day.date)}`;
  renderMetrics(day.stats);
  renderSources(day.sources);
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

  const entries = (state.day.entries || []).filter((entry) => {
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
