#!/usr/bin/env node
/**
 * Local visual preview — see an article EXACTLY as it'll look published, before it's merged.
 *
 * The article template pulls its CSS / nav / logo / footer with RELATIVE paths (../css, ../images, …),
 * so a bare dist/ file renders unstyled. This renders the article (via the SAME renderer as build.mjs —
 * no drift) into a throwaway preview file inside your LOCAL SARMS site, where those assets actually live,
 * then serves that site on localhost so it looks pixel-for-pixel like production.
 *
 * Usage:
 *   node scripts/preview.mjs content/articles/bpc-157.md
 *   node scripts/preview.mjs path/to/any-draft.md
 *   (SARMS_SITE=... to point at a different local SARMS checkout; PREVIEW_PORT=... to change the port)
 *
 * The preview file (articles/<slug>.__preview__.html) is deleted when you stop the server (Ctrl+C).
 * Zero dependencies. Run from the explicit-content repo root.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, readdirSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { renderArticle, parseFrontmatter } from "./build.mjs";

const SARMS = process.env.SARMS_SITE || "C:/Users/Max/Desktop/ExplicitSRMS";
const PORT = Number(process.env.PREVIEW_PORT) || 8787;

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

function fail(msg) { console.error(msg); process.exit(1); }

const src = process.argv[2];
if (!src) fail("usage: node scripts/preview.mjs <path-to-article.md>");
if (!existsSync(src)) fail(`no such file: ${src}`);
if (!existsSync(SARMS)) fail(`SARMS site not found at ${SARMS} — set SARMS_SITE to your local ExplicitSRMS checkout.`);
const artDir = join(SARMS, "articles");
if (!existsSync(artDir)) fail(`no articles/ dir in the SARMS site at ${artDir}`);

// Render (same logic as the real build) ------------------------------------------------
const { meta, body } = parseFrontmatter(readFileSync(src, "utf8"));
if (!meta.slug || !meta.title) fail(`${src} is missing 'slug' or 'title' frontmatter — can't preview.`);
const html = renderArticle(meta, body);

// Sweep any stale preview files, then write this one (distinct name so it can NEVER clobber a real article).
for (const f of readdirSync(artDir)) { if (f.endsWith(".__preview__.html")) { try { unlinkSync(join(artDir, f)); } catch {} } }
const previewName = `${meta.slug}.__preview__.html`;
const previewFile = join(artDir, previewName);
writeFileSync(previewFile, html, "utf8");

function cleanup() { try { unlinkSync(previewFile); } catch {} }
process.on("SIGINT", () => { cleanup(); console.log("\npreview stopped, temp file removed."); process.exit(0); });
process.on("exit", cleanup);

// Serve the SARMS site so ../css, ../images, ../js all resolve like production ----------
const server = createServer((req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const full = normalize(join(SARMS, p));
    if (!full.startsWith(normalize(SARMS))) { res.writeHead(403).end("forbidden"); return; } // no traversal
    if (!existsSync(full) || statSync(full).isDirectory()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": mime[extname(full).toLowerCase()] || "application/octet-stream" });
    res.end(readFileSync(full));
  } catch (e) { res.writeHead(500).end(String(e.message || e)); }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/articles/${previewName}`;
  console.log(`\n  Previewing:  ${meta.title}`);
  console.log(`  Slug:        ${meta.slug}   (temp file: articles/${previewName})`);
  console.log(`  Open:        ${url}\n`);
  console.log("  Serving your local SARMS site — styling/nav/logo are the real thing.");
  console.log("  Press Ctrl+C to stop (the temp preview file is removed on exit).\n");
  // Best-effort auto-open.
  const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref(); } catch {}
});
