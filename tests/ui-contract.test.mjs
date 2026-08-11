import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { escapeHtml } from "../lib/dom-safety.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);

async function text(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("HTML and app expose the accessible local feedback contract", async () => {
  const [html, app] = await Promise.all([text("index.html"), text("app.js")]);

  assert.match(html, /feedback-panel/);
  assert.match(html, /Utile/);
  assert.match(html, /Pas utile/);
  assert.equal((html.match(/aria-live="polite"/g) || []).length, 1);
  assert.match(html, /id="feedback-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.doesNotMatch(html, /id="entry-list"[^>]*aria-live/);
  assert.doesNotMatch(html, /feedback-entry-status[^>]*(?:role="status"|aria-live)/);
  assert.match(html, /reset-feedback/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /recordFeedback/);
  assert.match(app, /rankEntries/);
  assert.match(app, /enrichLegacyEntries/);
  assert.match(app, /dayRequestSequence/);
  assert.match(app, /requestSequence !== state\.dayRequestSequence/);
  assert.match(app, /restoreFeedbackFocus/);
  assert.match(app, /dataset\.entryId/);
  assert.doesNotMatch(app, /entry-list[^\n]*aria-live/);
});

test("query text has a pure escaping contract and is not interpolated into unsafe HTML", async () => {
  const app = await text("app.js");
  const query = '<img src=x onerror="alert(1)">';

  assert.equal(escapeHtml(query), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.doesNotMatch(app, /innerHTML[^\n]*state\.query/);
  assert.match(app, /activeFilters\.append/);
  assert.match(app, /textContent\s*=\s*chip/);
});

test("mobile layout keeps the long archive compact before the news feed", async () => {
  const css = await text("styles.css");
  const mobile = css.slice(css.indexOf("@media (max-width: 680px)"));

  assert.match(mobile, /\.sidebar[\s\S]*?max-height:\s*48vh/);
  assert.match(mobile, /\.sidebar[\s\S]*?overflow:\s*auto/);
  assert.match(mobile, /\.day-list[\s\S]*?overflow-x:\s*auto/);
  assert.match(mobile, /\.day-button[\s\S]*?min-width:/);
});

test("static build copies browser-consumable lib modules", async () => {
  const build = await text("scripts/build-static.mjs");
  assert.match(build, /resolve\(root, "lib"\)/);

  await execFileAsync("node", ["scripts/build-static.mjs"], { cwd: new URL("../", import.meta.url).pathname });
  await Promise.all([
    access(new URL("../dist/lib/legal-relevance.mjs", import.meta.url)),
    access(new URL("../dist/lib/personalization.mjs", import.meta.url)),
  ]);
});
