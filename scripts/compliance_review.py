#!/usr/bin/env python3
"""Pre-publish review agent — compliance (blocking) + SEO (advisory), one pass.

Runs in CI on every pull request that touches content/. For each changed article it reads
brain/compliance.md (the blocking ruleset) AND brain/seo-conventions.md (advisory), then asks
Claude, in a single call, to flag (a) any health/efficacy claim or scope break — which BLOCKS
publication — and (b) on-page SEO improvements — which are recommendations only and never block.

It writes:
- compliance-report.md  — a plain-English report for the PR comment, ending with a hidden
                          machine-readable `<!-- REVIEW_JSON {…} -->` blob the in-editor panel parses.
- compliance-status.txt — PASS / FAIL. FAIL (which fails the check and blocks merge) iff there is
                          at least one COMPLIANCE finding. SEO-only never fails.

Design choices that matter:
- The rulesets + catalog are read from the PR's BASE commit, never the PR head, so a pull request
  cannot weaken its own gate by editing them.
- Anything the agent can't cleanly evaluate is treated as a compliance FAIL (fail-safe: a human
  reviews rather than letting unreviewed content through).
"""

import os
import re
import sys
import json
import shutil
import datetime
import subprocess
import pathlib


def _claude_cmd():
    """Build the claude-CLI argv portably. The prompt is fed on STDIN (not argv) because it's far larger
    than Windows' ~8 KB command-line limit. Linux/CI: bare `claude` on PATH. Windows: the npm shim is
    `claude.cmd`, which CreateProcess can't exec directly, so run it through `cmd /c`. Override the
    binary with the CLAUDE_BIN env var if needed."""
    args = ["-p", "--output-format", "json", "--model", CLAUDE_MODEL, "--dangerously-skip-permissions"]
    override = os.environ.get("CLAUDE_BIN")
    if override:
        binary = override
    elif os.name == "nt":
        binary = shutil.which("claude.cmd") or shutil.which("claude") or "claude.cmd"
    else:
        binary = shutil.which("claude") or "claude"
    if os.name == "nt" and str(binary).lower().endswith(".cmd"):
        return ["cmd", "/c", binary] + args
    return [binary] + args

# Runs through the Claude Code CLI on the owner's Max subscription (auth via the
# CLAUDE_CODE_OAUTH_TOKEN secret) — no API key, no per-use credits.
CLAUDE_MODEL = "opus"  # Claude Code model alias

REVIEWER_SYSTEM = """You are the pre-publish reviewer for Explicit Sarms, a research-compound
supplier. You gate SEO articles before they can be published on explicitsarms.com.

You apply TWO rulesets, both given in the user message. They are the law — apply them exactly and
do not invent rules they don't contain:

A) COMPLIANCE (brain/compliance.md) — the BLOCKING lens. Catch any language that describes what a
compound DOES to or for a body: any health, efficacy, benefit, therapeutic, dosing, or outcome
claim, however soft or implied — plus the hard scope rules (out-of-scope compounds written up as
in scope, named medical conditions, fabricated availability/pricing/origin, wrong brand/domain,
missing RUO framing). These are violations that MUST block publication.

B) SEO (brain/seo-conventions.md) — the ADVISORY lens. On-page optimization only: meta_title
(~60 chars, compound-led), meta_description (~155 chars, identity/catalog facts, never a benefit),
a single H1 that is the compound, the focus keyword used naturally, internal cross-links to the
matching Explicit Research article and the product page, no keyword stuffing, no hand-written
schema / JSON-LD (the build injects it), alt text = plain description. These are recommendations to
help the article rank — they are NEVER a claim and NEVER a reason to block.

IMPORTANT: a "[compound] for [benefit]" phrase is BOTH an SEO spam signal AND a compliance claim —
tag it "compliance" (the stricter lens always wins). When in doubt whether something is a claim,
tag it "compliance".

Do NOT flag neutral factual identity/catalog statements — molecular data, what class of molecule it
is, where a sequence occurs, third-party testing, COA availability, sizes, prices, stock. Those are
allowed and encouraged. Flag a claim, not a fact.

Write findings for a NON-TECHNICAL writer. For each: quote the exact phrase, say plainly why it
fails, and give a compliant/better rewrite (or the word "remove").

Respond with ONLY a JSON object, no prose and no markdown fences, in exactly this shape:
{
  "summary": "one plain-English sentence",
  "findings": [
    {"type": "compliance" | "seo",
     "quote": "<exact text from the article>",
     "problem": "<what rule it breaks, plain English>",
     "fix": "<a compliant/better rewrite, or the word remove>"}
  ]
}
Do NOT include a status field — it is computed from the findings (any "compliance" finding = fail;
SEO-only = pass). findings may be empty."""


def git_show(ref: str, path: str) -> str:
    return subprocess.check_output(["git", "show", f"{ref}:{path}"], text=True)


def changed_content_files(base: str, head: str) -> list[str]:
    out = subprocess.check_output(
        ["git", "diff", "--name-only", "--diff-filter=d", f"{base}...{head}"],
        text=True,
    )
    return [
        f for f in out.splitlines()
        if f.startswith("content/") and f.endswith(".md")
    ]


def parse_verdict(raw: str) -> dict:
    """Pull the JSON verdict out of the model text. Normalize each finding's type and compute
    status from the COMPLIANCE findings only (SEO never fails). Fail-safe on any trouble."""
    txt = raw.strip()
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt, flags=re.IGNORECASE).strip()
    start, end = txt.find("{"), txt.rfind("}")
    if start != -1 and end != -1:
        txt = txt[start:end + 1]
    data = json.loads(txt)
    norm = []
    for f in (data.get("findings", []) or []):
        t = str(f.get("type", "compliance")).lower()
        if t not in ("compliance", "seo"):
            t = "compliance"  # unknown/ambiguous = treat as blocking (fail-safe)
        norm.append({
            "type": t,
            "quote": f.get("quote", ""),
            "problem": f.get("problem", ""),
            "fix": f.get("fix", ""),
        })
    status = "fail" if any(f["type"] == "compliance" for f in norm) else "pass"
    return {"status": status, "summary": data.get("summary", ""), "findings": norm}


def review_file(rules: str, seo: str, catalog: str, path: str) -> dict:
    article = pathlib.Path(path).read_text(encoding="utf-8")
    prompt = (
        REVIEWER_SYSTEM +
        "\n\nRULESET A — COMPLIANCE (authoritative, BLOCKING):\n" + rules +
        "\n\nRULESET B — SEO CONVENTIONS (advisory, non-blocking):\n" + seo +
        "\n\nPRODUCT CATALOG (the only products that exist):\n" + catalog +
        f"\n\nARTICLE TO REVIEW — {path}\n----- BEGIN -----\n" + article +
        "\n----- END -----\nReturn ONLY the JSON verdict."
    )
    proc = subprocess.run(
        _claude_cmd(),
        input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=600,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"claude cli exited {proc.returncode}: {proc.stderr.strip()[:400]}"
        )
    outer = json.loads(proc.stdout)
    raw = outer.get("result", "") if isinstance(outer, dict) else str(outer)
    verdict = parse_verdict(raw)
    verdict["path"] = path
    return verdict


def render_report(results: list[dict]) -> str:
    lines = ["## Compliance & SEO review", ""]
    if not results:
        lines.append("_No article changes to review._")
        return "\n".join(lines)
    any_block = any(r.get("status") == "fail" for r in results)
    any_seo = any(f["type"] == "seo" for r in results for f in r.get("findings", []))
    lines.append(
        "🔴 **Compliance: changes required before this can be published.**" if any_block
        else "🟢 **Compliance: passed the no-claims check.** A human still merges it."
    )
    if any_seo:
        lines.append("🟡 **SEO: recommendations below — optional, they don't block publishing.**")
    lines.append("")
    for r in results:
        comp = [f for f in r.get("findings", []) if f["type"] == "compliance"]
        seo = [f for f in r.get("findings", []) if f["type"] == "seo"]
        blocked = r.get("status") == "fail"
        lines.append(f"### {'🔴' if blocked else '🟢'} `{r['path']}`")
        if r.get("summary"):
            lines.append(f"_{r['summary']}_")
        if comp:
            lines.append("\n**Compliance — must fix:**")
            for i, f in enumerate(comp, 1):
                lines.append(f"\n**{i}. Flagged:** \"{f['quote'].strip()}\"")
                lines.append(f"- **Why:** {f['problem'].strip()}")
                lines.append(f"- **Fix:** {f['fix'].strip()}")
        elif blocked:
            # agent error / could-not-evaluate — fail-safe to a human
            lines.append("\n**Compliance — a human must review this file** (see summary above).")
        else:
            lines.append("\nNo compliance issues.")
        if seo:
            lines.append("\n**SEO — recommended (optional):**")
            for i, f in enumerate(seo, 1):
                lines.append(f"\n**{i}. Suggestion:** \"{f['quote'].strip()}\"")
                lines.append(f"- **Why:** {f['problem'].strip()}")
                lines.append(f"- **Better:** {f['fix'].strip()}")
        lines.append("")
    lines.append("---")
    lines.append("_Automated pre-check against `brain/compliance.md` (blocking) + "
                 "`brain/seo-conventions.md` (advisory). Fix the compliance flags and push again — "
                 "this updates automatically._")
    return "\n".join(lines)


def build_review_json(results: list[dict]) -> dict:
    """The machine-readable verdict the in-editor panel parses out of the PR comment."""
    files = [{
        "path": r.get("path", ""),
        "status": r.get("status", "fail"),
        "summary": r.get("summary", ""),
        "findings": r.get("findings", []),
    } for r in results]
    status = "fail" if any(f["status"] == "fail" for f in files) else "pass"
    return {
        "status": status,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "files": files,
    }


def embed_json(report_md: str, review: dict) -> str:
    """Append the verdict as a hidden HTML comment (invisible in the rendered PR comment)."""
    blob = json.dumps(review, ensure_ascii=False).replace("--", "\\u002d\\u002d")
    return report_md + "\n\n<!-- REVIEW_JSON " + blob + " -->\n"


def write_out(report: str, status: str) -> None:
    pathlib.Path("compliance-report.md").write_text(report, encoding="utf-8")
    pathlib.Path("compliance-status.txt").write_text(status + "\n", encoding="utf-8")


def main() -> int:
    base = os.environ["BASE_SHA"]
    head = os.environ["HEAD_SHA"]
    try:
        rules = git_show(base, "brain/compliance.md")
        seo = git_show(base, "brain/seo-conventions.md")
        catalog = git_show(base, "brain/product-catalog.md")
    except subprocess.CalledProcessError:
        report = embed_json(
            "## Compliance & SEO review\n\nCould not read the rulesets from the base branch. "
            "A human must review this PR.",
            {"status": "fail", "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
             "files": []},
        )
        write_out(report, "FAIL")
        return 0

    files = changed_content_files(base, head)
    if not files:
        write_out(embed_json(render_report([]), build_review_json([])), "PASS")
        return 0

    results = []
    for path in files:
        try:
            results.append(review_file(rules, seo, catalog, path))
        except Exception as e:  # noqa: BLE001 — any failure = fail-safe to human review
            results.append({
                "path": path, "status": "fail",
                "summary": f"The review agent could not evaluate this file ({e}); "
                           "a human must review it.",
                "findings": [],
            })

    status = "FAIL" if any(r["status"] == "fail" for r in results) else "PASS"
    write_out(embed_json(render_report(results), build_review_json(results)), status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
