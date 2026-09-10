// Read-only status relay for the in-editor compliance/SEO panel.
//
// GET /status?branch=cms/<collection>/<slug>
//   -> { found, branch, pr, prState, checkStatus, checkConclusion, review }
//   review is the REVIEW_JSON verdict the CI reviewer embedded in the PR comment, or null.
//
// The panel (admin/review-panel.js) computes the branch from the editor URL and calls this.
// The Worker holds a read-only fine-grained PAT (Worker secret GITHUB_TOKEN) so no GitHub
// credential ever reaches the browser. CORS is locked to ALLOWED_ORIGIN (the CMS origin).

const GH = "https://api.github.com";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://seo.explicitsarms.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

async function gh(env, path) {
  const r = await fetch(GH + path, {
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "explicit-content-review-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`GitHub ${r.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

// Same extraction the CI reviewer's tests exercise: pull the hidden verdict out of a PR comment.
function extractReviewJson(body) {
  const m = body && body.match(/<!-- REVIEW_JSON ([\s\S]*?) -->/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return json({ ok: true, service: "explicit-content review status" }, 200, env);
    }
    if (url.pathname !== "/status" || request.method !== "GET") {
      return json({ error: "not found" }, 404, env);
    }

    const branch = url.searchParams.get("branch") || "";
    // Only ever look up editorial-workflow branches; refuse anything else.
    if (!/^cms\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(branch)) {
      return json({ error: "bad or missing branch" }, 400, env);
    }
    if (!env.GITHUB_TOKEN) {
      return json({ error: "worker missing GITHUB_TOKEN secret" }, 500, env);
    }

    const repo = env.REPO;
    const owner = repo.split("/")[0];
    try {
      const prs = await gh(
        env,
        `/repos/${repo}/pulls?head=${encodeURIComponent(owner + ":" + branch)}&state=all&per_page=1`,
      );
      if (!prs.length) return json({ found: false, branch }, 200, env);

      const pr = prs[0];
      const sha = pr.head && pr.head.sha;

      // The compliance check run on the PR head commit (name contains "complian").
      let checkStatus = null, checkConclusion = null;
      try {
        const cr = await gh(env, `/repos/${repo}/commits/${sha}/check-runs`);
        const run = (cr.check_runs || []).find((c) => /complian/i.test(c.name || ""));
        if (run) { checkStatus = run.status; checkConclusion = run.conclusion; }
      } catch (_) { /* check may not have started; leave null */ }

      // The reviewer's verdict, embedded in the newest PR comment that carries it.
      let review = null;
      try {
        const comments = await gh(env, `/repos/${repo}/issues/${pr.number}/comments?per_page=100`);
        for (let i = comments.length - 1; i >= 0; i--) {
          const rj = extractReviewJson(comments[i].body || "");
          if (rj) { review = rj; break; }
        }
      } catch (_) { /* comment may not exist yet */ }

      return json(
        { found: true, branch, pr: pr.number, prState: pr.state, checkStatus, checkConclusion, review },
        200, env,
      );
    } catch (e) {
      return json({ error: String((e && e.message) || e), branch }, 502, env);
    }
  },
};
