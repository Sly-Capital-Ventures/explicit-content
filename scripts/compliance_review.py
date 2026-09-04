#!/usr/bin/env python3
"""Compliance review agent.

Runs in CI on every pull request that touches content/. For each changed
article it reads brain/compliance.md (the ruleset) and asks Claude whether the
article makes any health/efficacy claim or otherwise breaks the rules, then
writes a plain-English report the content writer can act on immediately.

Design choices that matter:
- The ruleset + catalog are read from the PR's BASE commit, never the PR head,
  so a pull request cannot weaken its own gate by editing compliance.md.
- Anything the agent can't cleanly evaluate is treated as FAIL (fail-safe:
  a human reviews rather than letting unreviewed content through).
"""

import os
import re
import sys
import json
import subprocess
import pathlib

import anthropic

MODEL = "claude-opus-5"

REVIEWER_SYSTEM = """You are the compliance reviewer for Explicit, a research-compound
supplier. You gate SEO articles before they can be published.

Your single job: catch any language that describes what a compound DOES to a body
— any health, efficacy, benefit, therapeutic, dosing, or outcome claim, however
soft or implied — plus a few hard scope rules. The authoritative ruleset and the
product catalog are given to you in the user message. They are the law; apply them
exactly, and do not invent rules they don't contain.

What you are checking each article for:
1. Health / efficacy / benefit / outcome claims (explicit OR implied) — the core violation.
2. Dosing, protocols, "how to use", or research-as-instruction.
3. Out-of-scope compounds (SARMs / SERMs / AIs / GLP) written up as if in scope.
4. Fabricated or unverifiable specifics presented as fact.
5. Missing required elements the rules mandate (e.g. the research-use disclaimer).

Do NOT flag neutral, factual identity or catalog statements — molecular data,
what class of molecule it is, where a sequence occurs, third-party testing, COA
availability, sizes, prices, stock. Those are allowed and encouraged. Flag a
claim, not a fact.

Write findings for a NON-TECHNICAL human writer. For each problem: quote the exact
phrase, say plainly why it fails, and give a compliant rewrite (or say "remove").

Respond with ONLY a JSON object, no prose and no markdown fences, in exactly this shape:
{
  "status": "pass" | "fail",
  "summary": "one plain-English sentence",
  "findings": [
    {"quote": "<exact text from the article>",
     "problem": "<what rule it breaks, plain English>",
     "fix": "<a compliant rewrite, or the word remove>"}
  ]
}
status is "fail" if there is one or more finding, "pass" only if findings is empty."""


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
    """Pull the JSON verdict out of the model text. Fail-safe on any trouble."""
    txt = raw.strip()
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt, flags=re.IGNORECASE).strip()
    start, end = txt.find("{"), txt.rfind("}")
    if start != -1 and end != -1:
        txt = txt[start:end + 1]
    data = json.loads(txt)
    status = str(data.get("status", "")).lower()
    findings = data.get("findings", []) or []
    if status not in ("pass", "fail"):
        status = "fail" if findings else "pass"
    return {"status": status, "summary": data.get("summary", ""), "findings": findings}


def review_file(client, rules: str, catalog: str, path: str) -> dict:
    article = pathlib.Path(path).read_text(encoding="utf-8")
    user = (
        "COMPLIANCE RULES (authoritative):\n" + rules +
        "\n\nPRODUCT CATALOG (the only products that exist):\n" + catalog +
        f"\n\nARTICLE TO REVIEW — {path}\n----- BEGIN -----\n" + article +
        "\n----- END -----\nReturn the JSON verdict."
    )
    resp = client.messages.create(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=[{
            "type": "text",
            "text": REVIEWER_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in resp.content if b.type == "text")
    verdict = parse_verdict(raw)
    verdict["path"] = path
    return verdict


def render_report(results: list[dict]) -> str:
    any_fail = any(r["status"] == "fail" for r in results)
    lines = ["## Compliance review", ""]
    if not results:
        lines.append("_No article changes to review._")
        return "\n".join(lines)
    lines.append(
        "🔴 **Changes needed before this can be published.**" if any_fail
        else "🟢 **Passed the no-claims check.** An Explicit reviewer still merges it."
    )
    lines.append("")
    for r in results:
        icon = "🔴" if r["status"] == "fail" else "🟢"
        lines.append(f"### {icon} `{r['path']}`")
        if r.get("summary"):
            lines.append(f"_{r['summary']}_")
        if r["status"] == "pass":
            lines.append("\nNo claims found.")
        for i, f in enumerate(r.get("findings", []), 1):
            lines.append(f"\n**{i}. Flagged:** \"{f.get('quote','').strip()}\"")
            lines.append(f"- **Why:** {f.get('problem','').strip()}")
            lines.append(f"- **Fix:** {f.get('fix','').strip()}")
        lines.append("")
    lines.append("---")
    lines.append("_Automated pre-check against `brain/compliance.md`. "
                 "Fix the flags above and push again — this updates automatically._")
    return "\n".join(lines)


def write_out(report: str, status: str) -> None:
    pathlib.Path("compliance-report.md").write_text(report, encoding="utf-8")
    pathlib.Path("compliance-status.txt").write_text(status + "\n", encoding="utf-8")


def main() -> int:
    base = os.environ["BASE_SHA"]
    head = os.environ["HEAD_SHA"]
    try:
        rules = git_show(base, "brain/compliance.md")
        catalog = git_show(base, "brain/product-catalog.md")
    except subprocess.CalledProcessError:
        write_out("## Compliance review\n\nCould not read the ruleset from the base "
                  "branch. A human must review this PR.", "FAIL")
        return 0

    files = changed_content_files(base, head)
    if not files:
        write_out(render_report([]), "PASS")
        return 0

    client = anthropic.Anthropic()
    results = []
    for path in files:
        try:
            results.append(review_file(client, rules, catalog, path))
        except Exception as e:  # noqa: BLE001 — any failure = fail-safe to human review
            results.append({
                "path": path, "status": "fail",
                "summary": f"The compliance agent could not evaluate this file ({e}); "
                           "a human must review it.",
                "findings": [],
            })

    status = "FAIL" if any(r["status"] == "fail" for r in results) else "PASS"
    write_out(render_report(results), status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
