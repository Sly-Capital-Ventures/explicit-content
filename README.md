# Explicit Content Studio

Git-backed content + on-page SEO for **explicitsarms.com**, with a hard compliance gate. Content-only repo — no store/checkout/payment code lives here.

## What this is
- Craig's team writes in a **WordPress-style editor** at **https://seo.explicitsarms.com** (Sveltia CMS — free, open-source).
- Every save becomes a **Pull Request**. Writers draft and submit freely; **nothing goes live until an Explicit reviewer merges.**
- A **compliance review agent** checks every PR against `brain/compliance.md` and hard-blocks any health/efficacy claim before a human ever reviews it.

## The flow
1. Writer opens **seo.explicitsarms.com** → logs in with GitHub → drafts an **Article** or edits **On-Page SEO**.
2. Hits **Submit for Review** → a PR opens automatically (they never touch git).
3. The **compliance agent** runs on the PR: passes clean content, or blocks with line-by-line "this is a claim, rewrite as identity/catalog only."
4. An **Explicit reviewer merges** the clean PR — that merge is the recorded compliance sign-off.
5. Build renders it onto explicitsarms.com and regenerates **`feed.xml`** (RSS for Google/aggregators).

## Site split (why this targets sarms)
Google treats the three sites separately. **explicitresearch.com keeps its existing article library** untouched; **new SEO content goes on explicitsarms.com** (both new **Articles** and **On-Page SEO**). No duplicating content across domains — the sites cross-reference instead. explicitsrms.com is the WP/Woo backend only (not a content target).

## Structure
- `/admin` — the CMS (`config.yml` + `index.html`), hosted at **seo.explicitsarms.com**
- `/content/articles` — new articles (markdown)
- `/content/pages` — on-page SEO entries (meta title/description, H1, intro — keyed by URL)
- `/content/uploads` — images
- `/brain` — the shared knowledge base the authoring AI **and** the review agent both use:
  - `compliance.md` — the no-claims ruleset (**the keystone**) ✅
  - `product-catalog.md` — real product names/sizes so the AI never invents *(pending)*
  - `brand-voice.md`, `article-format.md`, `seo-conventions.md` *(pending)*

## Rules that never bend
- **No health/efficacy/benefit claims** — ever. RUO framing always. See `brain/compliance.md`.
- **SARM/SERM compound topics** and **GLP (reta/tirz)** are excluded unless Max + counsel sign off — the sarms *domain* does not lower the content risk.
- Support email in content: **support@explicitresearch.com**.

## Deploy checklist
- [ ] Create repo `Sly-Capital-Ventures/explicit-content`, push this.
- [ ] Branch protection on `main`: require a PR + review; restrict merge to the Explicit team.
- [ ] Host `/admin` at **seo.explicitsarms.com** (static — OVH vhost or Cloudflare Pages).
- [ ] GitHub OAuth App + a small auth relay (Cloudflare Worker) so "log in with GitHub" works.
- [ ] Compliance review agent as a PR check (GitHub Action running against `brain/compliance.md`).
- [ ] Build step → renders content to explicitsarms.com + regenerates `feed.xml`.
