import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const dataBaseUrl = process.env.SOCIACTUS_DATA_BASE_URL || "data";

for (const item of ["index.html", "styles.css", "app.js", ".nojekyll", "data"]) {
  await cp(resolve(root, item), resolve(dist, item), { recursive: true });
}

await writeFile(
  resolve(dist, "config.js"),
  `window.SOCIACTUS_CONFIG = ${JSON.stringify({ dataBaseUrl }, null, 2)};\n`,
  "utf8"
);

console.log(`Static site built in ${dist}`);
