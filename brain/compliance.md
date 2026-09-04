# Explicit Research — Content Compliance Ruleset

> This is the standard every article is **written to** and **reviewed against**. Both the authoring AI and the review agent use this exact file. If a line hints at what a compound does in a body, it does not publish. When unsure, treat it as a claim and cut it.

## Why this exists (read first)

Regulators act on **deceptive advertising and health/efficacy claims made to consumers** — *not* on the "research use only" label itself. So the entire legal defense is: **claim-free content + RUO framing + third-party COA substantiation + a documented review log.** One efficacy claim in a public article is the exact enforcement trigger. That is why this is strict.

## The one rule

Describe the **compound and the product** — never its **effect, benefit, or use in a living body.** Identity, chemistry, class, physical properties, and catalog facts are fine. What it does to or for anyone is never allowed, however soft or hedged the wording.

## Absolutely banned — any of these blocks the article

**Effect / benefit / outcome language of any kind:**
- Tissue & health: recovery, healing, repair, regeneration, injury, inflammation, wound, scar, gut/GI protection, joint, tendon, ligament
- Body composition: fat loss, weight loss, lean, muscle, bulking, cutting, recomposition
- Hormonal / metabolic: growth hormone, GH, IGF, testosterone, estrogen, insulin, metabolism, appetite
- Aesthetic / lifestyle: anti-aging, skin, hair, tan, energy, sleep, mood, libido, focus, stamina, performance, endurance, wellness
- Medical: treat, cure, prevent, diagnose, therapy, disease, condition, symptom, deficiency, or **any named condition** (cancer, diabetes, ED, hypogonadism, …)

**Soft-claim traps (still banned — an implication is a claim):**
- "supports…", "helps…", "promotes…", "aids…", "boosts…", "enhances…", "improves…", "optimizes…", "may…", "can…", "is known to…"
- "studied for [benefit]", "shown to…", "research suggests…", "clinically…", efficacy citations pointed at an outcome
- dosing, protocols, cycles, stacking, or any administration guidance for use in a body
- before/after, testimonials, user results, "customers report…"

**Banned from prior incidents (do not repeat):**
- Named-disease / drug-treatment copy on SERMs & AIs (e.g. "for breast cancer") — the single highest-risk bucket
- Fabricated facts: invented sale prices, blanket "in stock", "$0 free shipping" stated as fact, "≥99% purity" on items where it's untrue (e.g. bacteriostatic water), and blanket **"Made in USA / [state]"** origin — Explicit uses multiple suppliers, so a blanket origin claim is a false-origin risk

## Allowed — safe to state

- **Identity / chemistry:** compound name, synonyms, class/category, amino-acid sequence, molecular formula, molecular weight, CAS number, PubChem CID, physical appearance (lyophilized powder), reconstitution/solubility described as *chemistry* (never as dosing)
- **Catalog:** sizes/variants, price, a real live discount/coupon, "new / restocked / in stock" **only when actually true**, Shop CTA
- **Quality / authenticity:** independently third-party / lab tested, COA available, HPLC purity **only where it's genuinely true** (≥99% on actives; "research grade" on blends; **never** on bacteriostatic water), medically-supervised production stated **geo-free** (do not assert a specific country/state as blanket origin)
- **Framing:** "for laboratory and research use only", "not for human or animal consumption", RUO disclaimers
- **Neutral scientific context:** what class of molecule it is, where its sequence occurs in nature, and its role **as a subject of research literature** — phrased "studied as a research compound", never "studied for [benefit]"

## Required in every article

- RUO framing present; nothing implying human or animal use
- No dosing or administration guidance
- Correct brand + contact: **Explicit Research**, support **support@explicitresearch.com** (not support@explicitsarms.com)
- Purity / origin stated only where COA-substantiated; no fabricated availability or pricing

## Scope & high-risk buckets

- **SERMs, AIs, and SARMs are EXCLUDED** from the ER research-article library — do not write articles for them here. (See `article-format.md` for the in-scope compound list.)
- **GLP compounds — reta / tirzepatide — were legally pulled.** Never write about, list, or reference them.
- **Blends** (e.g. BPC-157 / TB-500): name the ingredients only. No combined-effect claims, no per-ingredient "studied for…" notes.

## Compliant vs non-compliant (rewrite examples)

| Blocked | Compliant rewrite |
|---|---|
| "BPC-157 is studied for tissue repair and gut healing." | "BPC-157 is a synthetic peptide derived from a sequence identified in gastric juice, and one of the most widely published subjects in peptide research literature." |
| "Supports faster recovery and reduced inflammation." | *(delete — no benefit is permitted)* |
| "TB-500 helps with muscle regeneration and flexibility." | "TB-500 (Thymosin Beta-4) is a naturally occurring peptide found in nearly all cells and appears across a range of research contexts." |
| "Clinically shown to increase GH." | *(delete)* |
| "≥99% pure, made in the USA." *(on bac water / mixed suppliers)* | "Independently third-party tested; COA available." |
| "Run a 4-week cycle at 250mcg/day." | *(delete — no dosing/protocol)* |

## How review works

1. The writer / authoring AI drafts to **this ruleset**.
2. On submit (a Pull Request), the **compliance review agent** checks the diff against this file and **hard-blocks** any banned claim, returning line-by-line "this is a claim — rewrite as identity/catalog only."
3. A **named human on Explicit's side merges** the approved PR — that merge is the recorded compliance sign-off (the audit trail).

Nothing reaches the live site without both. The agent does the heavy lifting; the human confirms and merges.
