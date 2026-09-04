#!/usr/bin/env node
/**
 * Build step: render content/articles/*.md into static HTML that matches the
 * explicitsarms.com article template, and generate feed.xml.
 *
 * Output goes to dist/ — this NEVER writes into the live site. Deploying dist/
 * into the SARMS repo is a separate, deliberate step.
 *
 * Zero dependencies: the article format is constrained (see brain/article-format.md),
 * so a small, predictable Markdown subset renderer is used on purpose.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://explicitsarms.com";
const ARTICLES_SRC = join(ROOT, "content", "articles");
const TEMPLATE = readFileSync(join(ROOT, "scripts", "templates", "article.html"), "utf8");
const OUT = join(ROOT, "dist");
const OUT_ARTICLES = join(OUT, "articles");

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

function inline(text) {
  let s = esc(text);
  // [label](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const ext = /^https?:\/\//i.test(url);
    const attrs = ext ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${url}"${attrs}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

function renderTable(rows) {
  // rows: array of arrays of cell strings (header, separator, ...data)
  const data = rows.filter((r, i) => i !== 1); // drop the |---| separator row
  const header = data[0] || [];
  const body = data.slice(1);
  const twoCol = body.every((r) => r.length === 2);
  if (twoCol) {
    const trs = body
      .map(
        (r) =>
          `    <div class="tech-row"><span>${inline(r[0])}</span><span>${inline(r[1])}</span></div>`
      )
      .join("\n");
    return `  <div class="tech-table">\n${trs}\n  </div>`;
  }
  const th = header.map((c) => `<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e5e5e5">${inline(c)}</th>`).join("");
  const trs = body
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="padding:8px 12px;border-bottom:1px solid #eee">${inline(c)}</td>`).join("")}</tr>`
    )
    .join("");
  return `  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0 22px"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlank = (l) => l.trim() === "";
  while (i < lines.length) {
    let line = lines[i].replace(/\s+$/, "");
    if (isBlank(line)) { i++; continue; }

    // table
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(
          lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
        );
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }
    // headings
    if (/^###\s+/.test(line)) { out.push(`  <h3>${inline(line.replace(/^###\s+/, ""))}</h3>`); i++; continue; }
    if (/^##\s+/.test(line)) { out.push(`  <h2>${inline(line.replace(/^##\s+/, ""))}</h2>`); i++; continue; }
    if (/^#\s+/.test(line)) { out.push(`  <h2>${inline(line.replace(/^#\s+/, ""))}</h2>`); i++; continue; }
    // horizontal rule / separator — skip
    if (/^-{3,}$/.test(line.trim())) { i++; continue; }
    // unordered list
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(`    <li>${inline(lines[i].replace(/^-\s+/, ""))}</li>`);
        i++;
      }
      out.push(`  <ul>\n${items.join("\n")}\n  </ul>`);
      continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`    <li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`  <ol>\n${items.join("\n")}\n  </ol>`);
      continue;
    }
    // paragraph (gather consecutive plain lines)
    const para = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^-\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`  <p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n\n");
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2] };
}

function buildSchema(meta, canonical) {
  const date = meta.date || new Date().toISOString().slice(0, 10);
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: meta.title,
      description: meta.meta_description || "",
      url: canonical,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      datePublished: date,
      dateModified: date,
      author: { "@type": "Organization", name: "Explicit Research", url: SITE },
      publisher: {
        "@type": "Organization",
        name: "Explicit Research",
        logo: { "@type": "ImageObject", url: `${SITE}/images/logos/srms-logo-white.webp` },
      },
    },
    null,
    2
  );
}

function renderArticle(meta, bodyMd) {
  const canonical = `${SITE}/articles/${meta.slug}.html`;
  const titleTag = meta.meta_title || `${meta.title} – Explicit Research`;
  return TEMPLATE
    .replace("{{TITLE}}", esc(titleTag))
    .replace("{{DESC}}", escAttr(meta.meta_description || ""))
    .replace("{{CANONICAL}}", canonical)
    .replace("{{SCHEMA}}", buildSchema(meta, canonical))
    .replace("{{TAG}}", esc(meta.category || "Peptides"))
    .replace("{{H1}}", esc(meta.title))
    .replace("{{BODY}}", renderMarkdown(bodyMd));
}

function rfc822(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toUTCString();
}

function buildFeed(items) {
  const now = new Date().toUTCString();
  const entries = items
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${SITE}/articles/${a.slug}.html</link>
      <guid isPermaLink="true">${SITE}/articles/${a.slug}.html</guid>
      <pubDate>${rfc822(a.date)}</pubDate>
      <description>${esc(a.meta_description || "")}</description>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Explicit Research — Research Articles</title>
    <link>${SITE}/articles.html</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Claim-free research reference articles from Explicit Research.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
${entries}
  </channel>
</rss>
`;
}

// ---------- index (articles.html) ----------
// The card markup mirrors the live explicitsarms.com/articles.html exactly.
// Insertion is NON-DESTRUCTIVE: the build only ever rewrites the region between
// these two marker comments, so hand-authored/legacy cards outside them survive.
// One-time cutover: place these markers inside <div class="articles-grid">.
const MARK_START = "<!-- AUTO-ARTICLES:START -->";
const MARK_END = "<!-- AUTO-ARTICLES:END -->";
// Path to the live SARMS articles.html used as the index shell (read-only here).
const INDEX_SHELL =
  process.env.SARMS_ARTICLES_HTML ||
  "C:/Users/Max/Desktop/ExplicitSRMS/articles.html";

function renderCard(meta) {
  const slug = meta.slug;
  const img = meta.image || `images/structures/${slug}.png?v=1`;
  const tag = meta.category || "Peptides";
  const cardTitle = meta.card_title || meta.title;
  const excerpt = meta.excerpt || meta.meta_description || "";
  const term = encodeURIComponent(meta.title);
  return `      <article class="article-card">
        <a href="articles/${slug}.html" class="article-card-img">
          <img src="${escAttr(img)}" alt="${escAttr(meta.title)} molecular structure" loading="lazy" style="filter:invert(1);object-fit:contain;">
        </a>
        <div class="article-card-body">
          <div class="article-tag">${esc(tag)}</div>
          <h2 class="article-title"><a href="articles/${slug}.html">${esc(cardTitle)}</a></h2>
          <p class="article-excerpt">${esc(excerpt)}</p>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <a href="articles/${slug}.html" class="article-cta">Read Overview →</a>
            <a href="https://pubmed.ncbi.nlm.nih.gov/?term=${term}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:var(--gray-mid);letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid currentColor;">PubMed Studies ↗</a>
          </div>
        </div>
      </article>`;
}

function buildIndex(items) {
  let shell;
  try {
    shell = readFileSync(INDEX_SHELL, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  } catch {
    console.warn(`! index shell not found at ${INDEX_SHELL} — skipping articles.html`);
    return false;
  }
  const startIdx = shell.indexOf(MARK_START);
  const endIdx = shell.indexOf(MARK_END, startIdx);
  const cards = items.map(renderCard).join("\n\n");
  writeFileSync(join(OUT, "_index-cards.html"), cards, "utf8");
  if (startIdx === -1 || endIdx === -1) {
    console.warn(
      "! index markers not found in the shell (AUTO-ARTICLES:START/END) — wrote cards to dist/_index-cards.html only.\n" +
      "  Add the two markers inside <div class=\"articles-grid\"> once, then re-run to generate articles.html."
    );
    return false;
  }
  const head = shell.slice(0, startIdx + MARK_START.length);
  const tail = shell.slice(endIdx);
  writeFileSync(join(OUT, "articles.html"), `${head}\n\n${cards}\n\n      ${tail}`, "utf8");
  return true;
}

// ---------- run ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT_ARTICLES, { recursive: true });

const files = readdirSync(ARTICLES_SRC).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
const built = [];
for (const f of files) {
  const raw = readFileSync(join(ARTICLES_SRC, f), "utf8");
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.slug || !meta.title) {
    console.warn(`! skipping ${f} — missing slug or title`);
    continue;
  }
  writeFileSync(join(OUT_ARTICLES, `${meta.slug}.html`), renderArticle(meta, body), "utf8");
  built.push(meta);
  console.log(`✓ articles/${meta.slug}.html`);
}

built.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
writeFileSync(join(OUT, "feed.xml"), buildFeed(built), "utf8");
console.log(`✓ feed.xml (${built.length} item${built.length === 1 ? "" : "s"})`);
if (buildIndex(built)) console.log("✓ articles.html (index regenerated)");
console.log(`\nBuilt ${built.length} article(s) into dist/`);
