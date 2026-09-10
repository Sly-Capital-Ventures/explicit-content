#!/usr/bin/env python3
"""Pure-logic tests for the reviewer (no `claude` call). Run: python scripts/test_review_logic.py

Covers the parts the in-editor panel depends on: compliance-drives-status, SEO-is-advisory,
unknown-type fail-safe, and the REVIEW_JSON round-trip exactly as the Worker will extract it."""
import re
import sys
import json
import pathlib

try:  # emoji in report/test names; Windows consoles default to cp1252 and would crash
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import compliance_review as cr  # noqa: E402

fails = []
def check(name, cond):
    print(("  ok  " if cond else "  FAIL") + "  " + name)
    if not cond:
        fails.append(name)

# The exact extraction the Worker/panel uses on the PR-comment body.
def extract_review_json(comment_body: str) -> dict:
    m = re.search(r"<!-- REVIEW_JSON (.*?) -->", comment_body, re.DOTALL)
    return json.loads(m.group(1)) if m else None

print("parse_verdict:")
# 1) a compliance finding -> fail
v = cr.parse_verdict(json.dumps({"summary": "s", "findings": [
    {"type": "compliance", "quote": "supports recovery", "problem": "benefit claim", "fix": "remove"}]}))
check("compliance finding => status fail", v["status"] == "fail")
check("finding type preserved", v["findings"][0]["type"] == "compliance")

# 2) SEO-only -> pass (advisory never blocks)
v = cr.parse_verdict(json.dumps({"summary": "s", "findings": [
    {"type": "seo", "quote": "meta too long", "problem": "over 60 chars", "fix": "shorten"}]}))
check("seo-only => status pass", v["status"] == "pass")

# 3) unknown/missing type -> coerced to compliance (fail-safe) -> fail
v = cr.parse_verdict(json.dumps({"summary": "s", "findings": [
    {"quote": "x", "problem": "y", "fix": "z"}]}))
check("missing type => coerced compliance", v["findings"][0]["type"] == "compliance")
check("missing type => status fail", v["status"] == "fail")

# 4) empty findings -> pass
v = cr.parse_verdict(json.dumps({"summary": "clean", "findings": []}))
check("no findings => pass", v["status"] == "pass")

# 5) tolerates ```json fences
v = cr.parse_verdict("```json\n" + json.dumps({"summary": "s", "findings": []}) + "\n```")
check("strips code fences", v["status"] == "pass")

print("build_review_json + overall status:")
mixed = [
    {"path": "content/articles/a.md", "status": "fail", "summary": "has a claim",
     "findings": [{"type": "compliance", "quote": "boosts GH", "problem": "claim", "fix": "remove"},
                  {"type": "seo", "quote": "title", "problem": "long", "fix": "trim"}]},
    {"path": "content/articles/b.md", "status": "pass", "summary": "clean",
     "findings": [{"type": "seo", "quote": "no cross-link", "problem": "add internal link", "fix": "link ER article"}]},
]
review = cr.build_review_json(mixed)
check("overall fail when any file fails", review["status"] == "fail")
check("has generated_at", bool(review.get("generated_at")))
check("preserves both files", len(review["files"]) == 2)

print("embed_json round-trip (Worker extraction):")
report = cr.render_report(mixed)
comment_body = cr.embed_json(report, review)
extracted = extract_review_json(comment_body)
check("REVIEW_JSON extractable from comment", extracted is not None)
check("round-trips equal", extracted == review)
check("hidden blob not visible in rendered text (starts with heading)", report.lstrip().startswith("## Compliance & SEO review"))
# a value containing '--' must survive the HTML-comment escaping
r2 = cr.build_review_json([{"path": "p", "status": "pass", "summary": "well--tested dash", "findings": []}])
c2 = cr.embed_json("x", r2)
check("no premature '-->' from a value containing --", c2.count("-->") == 1)
check("'--' value survives round-trip", extract_review_json(c2)["files"][0]["summary"] == "well--tested dash")

print("render_report presentation:")
check("blocking header when compliance present", "🔴 **Compliance: changes required" in report)
check("advisory SEO header shown", "🟡 **SEO:" in report)
check("compliance file marked 🔴", "🔴 `content/articles/a.md`" in report)
check("seo-only file marked 🟢", "🟢 `content/articles/b.md`" in report)
check("compliance section labelled must fix", "Compliance — must fix" in report)
check("seo section labelled recommended", "SEO — recommended (optional)" in report)

seo_only = cr.render_report([{"path": "content/articles/c.md", "status": "pass", "summary": "clean",
    "findings": [{"type": "seo", "quote": "q", "problem": "p", "fix": "f"}]}])
check("seo-only report is green/pass at top", "🟢 **Compliance: passed" in seo_only)

print()
if fails:
    print(f"{len(fails)} FAILED: {fails}")
    sys.exit(1)
print("ALL PASSED")
