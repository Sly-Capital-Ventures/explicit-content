# Review status Worker

Read-only Cloudflare Worker that lets the in-editor panel see a PR's compliance/SEO verdict without any GitHub credential in the browser.

`GET /status?branch=cms/<collection>/<slug>` →
```json
{ "found": true, "branch": "cms/articles/bpc-157", "pr": 12, "prState": "open",
  "checkStatus": "completed", "checkConclusion": "failure",
  "review": { "status": "fail", "generated_at": "…", "files": [ … ] } }
```
`{ "found": false }` when the entry has no PR yet (never saved). `review` is `null` until CI has posted.

## The read-only PAT
Create a **fine-grained personal access token** scoped to **only** `Sly-Capital-Ventures/explicit-content`:
- **Repository access:** Only select repositories → `explicit-content`
- **Permissions (all read-only):** Contents: Read · Pull requests: Read · Checks: Read · Metadata: Read (auto)
- If reading PR comments 403s, also add **Issues: Read** (PR conversation comments live on the issues API).

No write scope. No other repo. If it leaks, it can only read this one content repo's PRs.

## Deploy
```bash
cd worker
wrangler secret put GITHUB_TOKEN     # paste the fine-grained PAT
wrangler deploy
```
Note the deployed URL (e.g. `https://explicit-content-review.<subdomain>.workers.dev`) and set it as `WORKER_URL` in `admin/review-panel.js`. Optionally bind a custom route/subdomain.

`ALLOWED_ORIGIN` (in `wrangler.toml`) is the CMS origin allowed to call it — keep it `https://seo.explicitsarms.com`.

## Smoke test
```bash
curl "https://<deployed>/status?branch=cms/articles/bpc-157"
```
Expect `found:false` for a branch with no PR, or the verdict once a PR exists.
