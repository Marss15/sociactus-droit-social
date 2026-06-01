const OWNER = "Marss15";
const REPO = "sociactus-droit-social";
const BRANCH = "master";

export default async (_request, context) => {
  const file = context.params.file;
  if (!/^(index|\d{4}-\d{2}-\d{2})\.json$/.test(file)) {
    return json({ error: "Fichier de données non autorisé." }, 400);
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/${file}?ref=${BRANCH}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sociactus-netlify-data-proxy",
    },
  });

  if (!response.ok) {
    return json({ error: `Donnée introuvable: ${file}` }, response.status);
  }

  const payload = await response.json();
  const content = decodeBase64(payload.content || "");
  return new Response(content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const config = {
  path: "/api/data/:file",
  method: ["GET"],
};

function decodeBase64(value) {
  const normalized = String(value).replace(/\s/g, "");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
