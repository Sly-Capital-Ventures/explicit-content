#!/usr/bin/env node
/**
 * DELIBERATE publish step: render the CMS articles and copy them into the live SARMS storefront repo.
 * This is the piece build.mjs intentionally does NOT do (build.mjs only writes dist/). Run it when an
 * article has been reviewed + merged and you want it live on explicitsarms.com.
 *
 *   node scripts/publish-to-sarms.mjs
 *
 * Then, in the SARMS repo (default C:/Users/Max/Desktop/ExplicitSRMS):
 *   git add articles/ articles.html feed.xml && git commit -m "articles: publish from CMS" && git push
 *   deploy-sarms
 *
 * It:
 *   1. runs build.mjs (renders content/articles/*.md -> dist/, regenerates dist/articles.html from the
 *      LIVE SARMS articles.html shell — cards injected between the AUTO-ARTICLES markers, 31 existing
 *      cards preserved — and writes dist/feed.xml),
 *   2. copies dist/articles/*.html -> SARMS/articles/,
 *   3. copies dist/articles.html -> SARMS/articles.html and dist/feed.xml -> SARMS/feed.xml.
 *
 * Nothing is committed or deployed here — that stays a deliberate, reviewable step.
 * Override the SARMS repo path with SARMS_REPO=... (build.mjs reads the same shell via SARMS_ARTICLES_HTML).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SARMS = process.env.SARMS_REPO || "C:/Users/Max/Desktop/ExplicitSRMS";
const DIST = join(ROOT, "dist");

if (!existsSync(SARMS)) {
  console.error(`SARMS repo not found at ${SARMS} — set SARMS_REPO=... to point at it.`);
  process.exit(1);
}

// 1) build (reads the live SARMS articles.html as the index shell so the 31 existing cards survive)
console.log("Building articles -> dist/ ...\n");
execFileSync("node", [join(ROOT, "scripts", "build.mjs")], {
  stdio: "inherit",
  env: { ...process.env, SARMS_ARTICLES_HTML: join(SARMS, "articles.html") },
});

// 2) copy rendered article pages
const artSrc = join(DIST, "articles");
const artDst = join(SARMS, "articles");
if (!existsSync(artDst)) mkdirSync(artDst, { recursive: true });
let n = 0;
if (existsSync(artSrc)) {
  for (const f of readdirSync(artSrc).filter((f) => f.endsWith(".html"))) {
    copyFileSync(join(artSrc, f), join(artDst, f));
    console.log(`  -> articles/${f}`);
    n++;
  }
}

// 3) index + feed
if (existsSync(join(DIST, "articles.html"))) {
  copyFileSync(join(DIST, "articles.html"), join(SARMS, "articles.html"));
  console.log("  -> articles.html (index)");
} else {
  console.warn(
    "  ! dist/articles.html was not generated — the AUTO-ARTICLES:START/END markers are missing from\n" +
    "    SARMS/articles.html. Add them once inside <div class=\"articles-grid\">, then re-run."
  );
}
if (existsSync(join(DIST, "feed.xml"))) {
  copyFileSync(join(DIST, "feed.xml"), join(SARMS, "feed.xml"));
  console.log("  -> feed.xml");
}

console.log(
  `\nCopied ${n} article page(s) into ${SARMS}.\n` +
  "Next (deliberate): commit on the SARMS 'srms' branch and deploy:\n" +
  "  git add articles/ articles.html feed.xml && git commit -m \"articles: publish from CMS\" && git push\n" +
  "  deploy-sarms\n" +
  "NOTE: if SARMS bumps js/products.js's ?v=, bump it in scripts/templates/article.html too so article\n" +
  "pages load the current catalog (they embed the cart/search)."
);
