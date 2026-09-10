# In-editor compliance + SEO review

Surface the CI compliance/SEO verdict **inside the Sveltia editor** (seo.explicitsarms.com) so Craig's team fixes flags in place instead of opening GitHub. The brain stays in GitHub Actions (runs `claude` on Max's subscription — no credits, no server).

## Flow
Writer edits → **Save** (Sveltia opens/updates a PR on branch `cms/<collection>/<slug>`) → CI runs the reviewer → the in-editor **"Compliance & SEO" panel** reads the PR's verdict via a tiny read-only Cloudflare Worker and renders it inline → writer fixes → Save → 🟢 → a human merges (the recorded sign-off).

## Policy (decided 2026-09-10)
- **One reviewer, two lenses:** compliance (`brain/compliance.md`) **and** SEO (`brain/seo-conventions.md`) in a single `claude` call.
- **Compliance = BLOCK** (legal risk). Any compliance finding → CI check fails → branch protection blocks the merge. This is the real gate; unchanged/reliable.
- **SEO = RECOMMENDATION ONLY.** Shown as advisory 🟡, never fails the check, never blocks a merge.
- **Keep the GitHub PR comment** (for whoever merges) in addition to the panel (for the writer).

## Pieces
1. **CI reviewer + SEO lens** — `scripts/compliance_review.py` (+ `review_local.py`): also load `seo-conventions.md`; each finding tagged `type: "compliance" | "seo"`; `status = fail` iff any **compliance** finding; embed a machine-readable `REVIEW_JSON` blob in the PR comment for the panel to parse.
2. **Status Worker** — `worker/` Cloudflare Worker: `GET /status?branch=cms/articles/<slug>` → `{found, pr, checkStatus, checkConclusion, review}` using a **read-only fine-grained PAT** (repo `explicit-content` only). CORS locked to `https://seo.explicitsarms.com`.
3. **Editor panel** — `admin/review-panel.js`: registers a `compliance_check` field type; computes the branch from the editor URL; polls the Worker; renders 🔴 compliance (blocking) + 🟡 SEO (advisory) with quote → why → fix. Added to both collections in `config.yml`; Sveltia version pinned in `admin/index.html`.

## Shared contract
`REVIEW_JSON` (embedded in the PR comment as `<!-- REVIEW_JSON {…} -->`):
```json
{ "status": "pass|fail", "generated_at": "<iso>",
  "files": [ { "path": "content/articles/x.md", "status": "pass|fail", "summary": "…",
    "findings": [ { "type": "compliance|seo", "quote": "…", "problem": "…", "fix": "…" } ] } ] }
```
Worker response: `{ "found": bool, "branch": "…", "pr": <n|null>, "checkStatus": "…", "checkConclusion": "…|null", "review": <REVIEW_JSON|null> }`.

## Deploy / validate (Max — needs the live CMS + `claude`)
- Add the read-only fine-grained PAT (repo `explicit-content`: Contents read, Pull requests read, Checks read; add Issues read if comments 403) as the Worker secret `GITHUB_TOKEN`; `wrangler deploy` the worker; set the panel's `WORKER_URL`.
- Merge; branch-protect `main` to require the `Compliance Review` check.
- Smoke test: draft an article with a claim → Save → panel shows 🔴 in-editor; fix → Save → 🟢.
