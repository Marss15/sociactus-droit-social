import { getStore } from "@netlify/blobs";

const STORE_NAME = "sociactus-admin";
const STORE_KEY = "convention-priorities";

export default async (request) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (request.method === "GET") {
    const priorities = await readPriorities(store);
    return json(priorities);
  }

  if (request.method === "PUT") {
    const token = Netlify.env.get("SOCIACTUS_ADMIN_TOKEN");
    if (!token) {
      return json({ error: "SOCIACTUS_ADMIN_TOKEN n'est pas configuré sur Netlify." }, 503);
    }
    if (token && request.headers.get("authorization") !== `Bearer ${token}`) {
      return json({ error: "Jeton admin invalide." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON invalide." }, 400);
    }

    const priorities = sanitizePriorities(body);
    await store.setJSON(STORE_KEY, priorities, {
      metadata: { updatedAt: new Date().toISOString() },
    });
    return json(priorities);
  }

  return json({ error: "Méthode non autorisée." }, 405);
};

export const config = {
  path: "/api/convention-priorities",
  method: ["GET", "PUT"],
};

async function readPriorities(store) {
  const stored = await store.get(STORE_KEY, { type: "json" });
  if (stored) {
    return sanitizePriorities(stored);
  }
  return defaultPriorities();
}

function sanitizePriorities(value) {
  const fallback = defaultPriorities();
  const rules = Array.isArray(value?.priorityRules) ? value.priorityRules : fallback.priorityRules;
  const observed = value?.observed && typeof value.observed === "object" ? value.observed : {};

  return {
    schemaVersion: 1,
    defaultRank: normalizeRank(value?.defaultRank || fallback.defaultRank),
    priorityRules: rules.map(sanitizeRule).filter(Boolean),
    observed: Object.fromEntries(
      Object.entries(observed)
        .map(([key, item]) => [String(key), sanitizeObserved(item)])
        .filter(([, item]) => item)
        .sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

function sanitizeRule(rule) {
  if (!rule || typeof rule !== "object") {
    return null;
  }
  const label = cleanString(rule.label);
  if (!label) {
    return null;
  }
  return {
    label,
    rank: normalizeRank(rule.rank),
    idcc: arrayOfStrings(rule.idcc),
    match: arrayOfStrings(rule.match),
  };
}

function sanitizeObserved(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const label = cleanString(item.label);
  if (!label) {
    return null;
  }
  return {
    label,
    idcc: cleanString(item.idcc),
    rank: normalizeRank(item.rank),
    firstSeen: cleanString(item.firstSeen),
    lastSeen: cleanString(item.lastSeen),
    seenCount: Math.max(0, Number(item.seenCount || 0)),
  };
}

function normalizeRank(rank) {
  return ["p1", "p2", "p3"].includes(rank) ? rank : "p3";
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

function cleanString(value) {
  return String(value || "").trim().slice(0, 220);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function defaultPriorities() {
  return {
    schemaVersion: 1,
    defaultRank: "p3",
    priorityRules: [
      { label: "Métallurgie", rank: "p1", idcc: ["3248"], match: ["metallurgie"] },
      {
        label: "Bâtiment et travaux publics",
        rank: "p1",
        idcc: ["1596", "1597", "1702", "2609", "2614"],
        match: ["ouvriers employes par les entreprises du batiment"],
      },
      { label: "Bureaux d'études / Syntec", rank: "p1", idcc: ["1486"], match: ["bureaux d'etudes", "syntec"] },
      { label: "Hôtels, cafés, restaurants", rank: "p1", idcc: ["1979"], match: ["hotels", "cafes", "restaurants", "hcr"] },
      { label: "Transports routiers", rank: "p2", idcc: ["16"], match: ["transports routiers"] },
      { label: "Commerce de détail et de gros", rank: "p2", idcc: [], match: ["commerce de detail", "commerce de gros"] },
      { label: "Propreté et sécurité privée", rank: "p2", idcc: ["3043", "1351"], match: ["proprete", "securite privee"] },
    ],
    observed: {},
  };
}
