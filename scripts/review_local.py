#!/usr/bin/env python3
"""Local compliance test — review a draft article against the CURRENT brain, with NO pull request.

Runs the exact same reviewer + prompt as CI (scripts/compliance_review.py), reading the ruleset and
catalog from the WORKING TREE (so it reflects whatever brain/ says right now). A pass here == a pass in
CI. Use it to test drafts (yours or a partner's) before they ever open a PR.

Usage:
    python3 scripts/review_local.py content/articles/some-draft.md
    python3 scripts/review_local.py path/to/anything.md

Requirements: the `claude` CLI must be installed and signed in on this machine (it runs on your Claude
subscription, same as CI's token — no API key, no credits). Run from the repo root.

Exit codes: 0 = pass, 2 = fail (claim/scope violation), 1 = usage/other error.
"""
import sys
import pathlib

# Reuse the CI reviewer verbatim (same REVIEWER_SYSTEM prompt, same claude -p call, same JSON parsing,
# same report rendering) so local and CI verdicts can't drift.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import compliance_review as cr  # noqa: E402


def main() -> int:
    # The report contains emoji (🔴/🟢); Windows consoles default to cp1252 and would crash on them.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print("usage: python3 scripts/review_local.py <path-to-article.md>")
        return 1
    path = sys.argv[1]
    if not pathlib.Path(path).is_file():
        print(f"no such file: {path}")
        return 1

    root = pathlib.Path(__file__).resolve().parent.parent
    try:
        rules = (root / "brain" / "compliance.md").read_text(encoding="utf-8")
        seo = (root / "brain" / "seo-conventions.md").read_text(encoding="utf-8")
        catalog = (root / "brain" / "product-catalog.md").read_text(encoding="utf-8")
    except OSError as e:
        print(f"could not read the ruleset from brain/ (run from the repo root): {e}")
        return 1

    print(f"Reviewing {path} against the current working-tree brain/ (compliance + SEO) ...\n")
    try:
        verdict = cr.review_file(rules, seo, catalog, path)
    except Exception as e:  # noqa: BLE001 — surface any claude-cli / parse failure plainly
        print(f"reviewer could not run: {e}")
        print("(is the `claude` CLI installed and signed in? this runs `claude -p` locally.)")
        return 1

    print(cr.render_report([verdict]))
    status = verdict.get("status", "fail")
    print(f"\nSTATUS: {status.upper()}")
    return 0 if status == "pass" else 2


if __name__ == "__main__":
    sys.exit(main())
