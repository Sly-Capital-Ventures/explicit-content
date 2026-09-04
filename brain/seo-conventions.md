# SEO Conventions

How to make articles rank without tripping the compliance line. All of this sits *under* `compliance.md` — an SEO tactic never justifies a claim.

## Titles & meta
- **`meta_title`** ~60 chars. Pattern: `<Compound> | Research Peptide | Explicit`. Lead with the compound (the term people search).
- **`meta_description`** ~155 chars. Identity + catalog facts that earn the click — *"BPC-157, a widely researched synthetic peptide. Third-party tested, COA available. Lyophilized vials in 5/10/20mg."* Never a benefit.
- **H1 = the `title`** = the compound name, clean. One H1 per article.

## Slugs & URLs
- `slug`: lowercase, hyphenated, the compound name (`bpc-157`, `tb-500`, `ghk-cu`). Keep it stable once published — don't rename live slugs.
- Article URL on the site: `https://explicitsarms.com/articles/<slug>` (final path set by the build).

## Keywords
- Use the focus keyword naturally in the H1, `meta_title`, `meta_description`, and the first sentence. Then write for a human.
- **No keyword stuffing, no doorway pages, no "[compound] for [benefit]" phrases** — that last one is both a claim and a spam signal.

## Internal linking (the cross-reference strategy)
- Link each SARMS article to the matching **Explicit Research** article for the same compound, and to the real product page(s). This is how the two sites reinforce each other instead of duplicating.
- Link related in-scope compounds to each other where genuinely relevant.

## Structured data (hands-off)
- The site **auto-injects** claim-safe Product/Article schema from the product data. **Do not write schema, JSON-LD, or `additionalProperty` in articles** — the old SEO pack put efficacy claims there and it's exactly what we removed. Leave schema to the build.

## Images
- `alt` text = the compound name / plain description. Never a benefit in alt text (it's indexed).
- Prefer PNG/JPG; keep files reasonably sized.

## RSS
- Published articles are added to `feed.xml` automatically by the build (outbound syndication for Google/aggregators). No manual step.

## Duplicate content
- One article per compound per site. **Never copy an article across explicitresearch.com and explicitsarms.com** — cross-link instead. Duplication across the domains is the exact problem this whole split exists to fix.
