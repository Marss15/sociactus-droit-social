import { focusedEntries } from "./lib/editorial-scope.mjs";

const base = String(window.SOCIACTUS_CONFIG?.dataBaseUrl || "data").replace(/\/+$/, "");
const state = { entries: [], filter: "all", query: "", request: 0 };
const els = Object.fromEntries(["run-status", "day-list", "journal-title", "journal-intro", "result-count", "entry-list", "search-input"].map((id) => [id, document.getElementById(id)]));

async function getJson(file) {
  let lastError;
  for (const source of base === "data" ? ["data"] : [base, "data"]) {
    try {
      const response = await fetch(`${source}/${file}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

function dateLabel(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function todayParis() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function render() {
  const entries = state.entries.filter((entry) =>
    (state.filter === "all" || entry.category === state.filter) &&
    (!state.query || `${entry.title} ${entry.extra?.sourceSummary || ""}`.toLocaleLowerCase("fr").includes(state.query))
  );
  els["result-count"].textContent = `${entries.length} ${entries.length === 1 ? "information" : "informations"}`;
  els["entry-list"].replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.filter !== "all" || state.query
      ? "Aucune information ne correspond à ce filtre pour cette édition."
      : "Aucune actualité de droit social répondant aux critères pour cette date.";
    els["entry-list"].append(empty);
    return;
  }
  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "entry-card";
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    const badge = document.createElement("span");
    badge.className = `badge ${entry.category}`;
    badge.textContent = { regle: "Loi ou décret publié", "projet-loi": "Texte envisagé", presse: "Presse" }[entry.category];
    const source = document.createElement("span");
    source.textContent = entry.sourceName || "Source";
    const date = document.createElement("time");
    date.textContent = dateLabel(entry.publishedAt || entry.date);
    meta.append(badge, source, date);
    const heading = document.createElement("h3");
    heading.textContent = entry.title;
    card.append(meta, heading);
    const excerpt = entry.extra?.sourceSummary || entry.summary;
    if (excerpt) {
      const description = document.createElement("p");
      description.className = "entry-excerpt";
      description.textContent = excerpt;
      card.append(description);
    }
    try {
      const url = new URL(entry.url);
      if (["https:", "http:"].includes(url.protocol)) {
        const link = document.createElement("a");
        link.className = "source-link";
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = entry.category === "presse" ? "Lire l’article ↗" : "Consulter le texte ↗";
        card.append(link);
      }
    } catch { /* No usable source URL. */ }
    els["entry-list"].append(card);
  }
}

async function loadDay(date) {
  const request = ++state.request;
  try {
    const day = await getJson(`${date}.json`);
    if (request !== state.request) return;
    const order = { regle: 0, "projet-loi": 1, presse: 2 };
    state.entries = focusedEntries(day.entries || []).sort((a, b) =>
      order[a.category] - order[b.category] || String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""))
    );
    els["journal-title"].textContent = `Veille du ${dateLabel(date)}`;
    const introduction = date === todayParis()
      ? "Lois et décrets publiés, textes envisagés et presse concernant le droit du travail en France."
      : "Édition archivée. Aucun contenu plus récent n’a été chargé dans Sociactus.";
    els["journal-intro"].textContent = day.research?.errors?.length
      ? `${introduction} Certaines sources n’ont pas répondu : cette édition peut être incomplète.`
      : introduction;
    els["day-list"].querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.date === date));
    render();
  } catch (error) {
    if (request !== state.request) return;
    console.error(error);
    els["entry-list"].textContent = "Cette édition n’a pas pu être chargée.";
  }
}

async function boot() {
  els["search-input"].addEventListener("input", () => {
    state.query = els["search-input"].value.trim().toLocaleLowerCase("fr");
    render();
  });
  const filters = document.querySelectorAll("[data-filter]");
  filters.forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    render();
  }));
  try {
    const index = await getJson("index.json");
    els["run-status"].textContent = index.latestDate ? `Dernière édition : ${dateLabel(index.latestDate)}` : "Aucune édition disponible";
    for (const day of index.days || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.date = day.date;
      button.textContent = dateLabel(day.date);
      button.addEventListener("click", () => loadDay(day.date));
      els["day-list"].append(button);
    }
    if (index.latestDate) await loadDay(index.latestDate);
    else els["entry-list"].textContent = "Aucune édition disponible.";
  } catch (error) {
    console.error(error);
    els["run-status"].textContent = "Veille indisponible";
    els["entry-list"].textContent = "Les données n’ont pas pu être chargées.";
  }
}

boot();
