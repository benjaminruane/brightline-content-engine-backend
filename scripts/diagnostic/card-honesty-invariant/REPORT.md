# B351. A card may not say it cannot find what it is holding

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 796c123 | SHIP VERIFIED  796c123  main  141 files  1641 tests |
| frontend | not touched | -- |

Ids used: B351 (this spec; B349 pieces 1 and 2), B350 (closed by this spec), B352 (filed: editorial source-awareness), B353 (filed: pairing dates and scale).

Cost: USD 0. No model calls. No prompt change.

Browser: skipped. No layout, control, or copy change. No Review. Deterministic assembly only, replayed from `tests/fixtures/real-runs-2026-09-29/`.

---

## Part 0A. Confirm, with quoted lines

B349's Part 0A answers stand as fact. The quotes below are from `HEAD` before this spec, the same writers B349 named.

### A1  TRUE

`gateExcerpt` receives `supportSpans` and discards it with `void supportSpans;`.

Quoted `lib/qc/excerpt-locate.mjs` at `HEAD` (B349 A1):

```
export function gateExcerpt({ passage, sourceLabel, sources, supportSpans } = {}) {
  const text = trimmed(passage);
  const label = trimmed(sourceLabel);
  if (!text || !label) return null;
  void supportSpans;
  const srcText = sourceTextForLabel(sources, label);
  const recovered = recoverExcerptFromSource({ pointer: text, sourceText: srcText });
  if (recovered?.miss || !recovered?.passage) return null;
```

B349: "gateExcerpt recovers the displayed pointer from the named source by **label**. It voids `supportSpans`." Two locators. Display honesty (B325) and span rewrite (R7) were never asked to agree.

### A2  TRUE

Stage 4's confirmed path reads single-pick matches only and never falls back to a stored span. The conflicting and partial paths do.

Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs` at `HEAD`:

```
  if (v === "confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "confirmed");
  } else if (v === "conflicting") {
    primaryExcerpt = firstMatchWithClassification(matches, "conflicting");
  } else if (v === "partially_confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "partially_confirmed");
```

Confirmed path stops there. Conflicting then:

```
    } else if (!firstMatchWithClassification(matches, "conflicting")) {
      const fromSpan = firstConflictingSpanExcerpt(supportSpans, sources, matches);
      if (fromSpan) {
        conflictExcerpt = fromSpan;
        if (!primaryExcerpt) primaryExcerpt = fromSpan;
      }
```

Partial then:

```
    } else if (!primaryExcerpt) {
      const fromSpan = firstSpanExcerpt(supportSpans, sources, matches, "partially_confirmed");
      if (fromSpan) primaryExcerpt = fromSpan;
    }
```

B349: "Stage 4 on a confirmed verdict never reads those spans."

### A3  TRUE

The 300-character trim is `trimExcerptTo300` in `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`. At `HEAD` it can cut mid-word.

Quoted at `HEAD` (B349 A3):

```
function trimExcerptTo300(passage) {
  const text = typeof passage === "string" ? passage : "";
  const t = text.trim();
  if (!t) return null;
  if (t.length <= 300) return t;

  const window = t.slice(0, 300);
  let lastBoundary = -1;
  for (let i = 0; i <= window.length - 2; i++) {
    const pair = window.slice(i, i + 2);
    if (pair === ". " || pair === "! " || pair === "? ") {
      lastBoundary = i;
    }
  }
  if (lastBoundary >= 0) {
    return `${window.slice(0, lastBoundary + 1).trimEnd()}...`;
  }
  return `${window.trimEnd()}...`;
}
```

A period followed by a newline is not `". "`, so the function hard-cuts at 300. S8's recorded pointer ends `Su`.

### A4  TRUE

The Stage 2 writer that keeps `confirmed` on a response whose passage is empty is `normalizeValidResponse` in `lib/qc/pipeline-v4/stage2-match-sources.mjs` (B251).

Quoted at `HEAD`:

```
    if (!validation.accepted) {
      ...
      passage = "";
      passageRejected = true;
    }
```

The classification is not rewritten. Architecture at `HEAD`: "A passage the matcher cannot re-locate is emptied; the classification is kept (B251)." B349: a `confirmed` class with an empty passage is not a confirmation; refuse at the writer (P31).

### A5  Fixture print

Loaded `tests/fixtures/real-runs-2026-09-29/clean-review.json`.

```
S6
  displayVerdict=unverifiable
  excerptNotLocatable=true
  primaryExcerpt=""
  supportSpan[0] start=1624 end=1987 passageLength=363
S7
  displayVerdict=unverifiable
  excerptNotLocatable=true
  primaryExcerpt=""
  supportSpan[0] start=1624 end=2278 passageLength=654
S10
  displayVerdict=unverifiable
  excerptNotLocatable=true
  primaryExcerpt=""
  supportSpan[0] start=null end=null passageLength=0
```

S6 and S7 spans are located and non-empty (`[1624, 1987)` 363 chars; `[1624, 2278)` 654 chars). S10 is empty with null offsets.

---

## Part 0B. AGREE / AMEND / REJECT

**B1  AGREE.** The invariant is enforced in `assembleCard` after spans are rewritten and before the card is returned. A card may not assert anything its stored evidence contradicts, and may not report that it could not find something it is holding.

**B2  AGREE.** If the gated excerpt misses and a rewritten `supportSpan` carries a non-empty locatable passage, that passage becomes `primaryExcerpt`, with its label and offsets. Honesty is re-evaluated only after the fallback. `gateExcerpt` no longer voids `supportSpans`; it tries them before returning null. Stage 4's confirmed path gains the span fallback the other paths already have.

**B3  AGREE.** A `confirmed` classification with an empty passage is refused at `normalizeValidResponse` (`applyEmptyConfirmationRefusal`), recorded, and logged. After the B2 fallback, a supported card with no locatable passage anywhere reads `not reviewed` with `excerpt_not_locatable`, never a silent Confirmed.

**B4  AGREE.** `trimExcerptTo300` never cuts inside a word. Prefer a sentence boundary (`.`, `!`, `?` plus whitespace including newline); else the last whitespace in the 300-character window, then an ellipsis. Where offsets exist, `toExcerpt` slices the source rather than trimming a pointer.

**B5  AGREE.** Where a card's verdict is conflict and the only stated ground is that the source does not mention something, and a stored span on that same card contains that thing as a verbatim slice, the card is not a conflict. Ben's ruling: that sentence was fully backed. Verdict becomes `supported_full` (`supportState` `supported`, `hasConflict` false). Do not keep the red badge and improve the quote. Clean S9: GIC and 2.2% sit in the span. Doctored S9: AGIC is absent, so it stays a conflict.

**B6  AMEND.** The overlap selection runs not only on a confirmed card but also on a partial card when no B345 disputed-figure excerpt wins, so T8 S1 (`supported_partial`) shows the 14% private-equity passage rather than the 13% Group total. Reuses `collectBackstopFigures` from B345. Never show a passage whose figures are a different measure when another stored passage carries the statement's own figures or distinctive phrase. Then shortest, then source order.

**B7  AGREE.** A confirming sentence in assembled commentary may not be introduced by a contrastive. Deterministic, on the assembled text, no prompt change.

**B8  AGREE.** No editorial change, no pairing change, no splitter, no Stage 5 contract, no actor check. Those are B352 and B353.

---

## What shipped

Deterministic only. `lib/qc/card-honesty.mjs` (omission-conflict invariant; contrastive strip). `gateExcerpt` tries locatable spans. `normalizeValidResponse` refuses empty confirmation. `trimExcerptTo300` exported, word-safe, sentence boundary includes newline. Stage 4 confirmed path: `pickBestAnchorExcerpt` then span fallback. Assembly: rewrite spans, omission invariant, connective strip, span fallback, mid-word recovered pointer expanded to covering span then trimmed, empty confirmation → not reviewed. Honesty after fallback.

---

## Fifteen-row table (clean fixture)

Displayed excerpts are from `tests/fixtures/real-runs-2026-09-29/clean-review.json` (before) and the same spans after `trimExcerptTo300` / `pickBestAnchorExcerpt` (after). Whitespace collapsed in the table.

| # | Before verdict | After verdict | Before excerpt | After excerpt |
|---|----------------|---------------|----------------|---------------|
| S0 | conflict | conflict | 3i Group delivered strong performance in the first half of FY2026 • Total return… | same |
| S1 | supported_partial | supported_partial | The total return of 13% represents a very good first half for the Group. | Our Private Equity business delivered a gross investment return of £3,234 million or 14% (September 2024: £2,071 million, 11%). |
| S2 | supported_full | supported_full | Action continued to trade strongly, and several of our other large portfolio com… | same |
| S3 | supported_full | supported_full | Action’s new store expansion programme is on track for another record year with … | same |
| S4 | supported_full | supported_full | Year to date LFL trading remains good despite weakening consumer confidence sinc… | same |
| S5 | supported_full | supported_full | In the nine reporting periods ending on 28 September 2025 (“P9”), Action generat… | same |
| S6 | unverifiable | **supported_full** | (empty) | In October 2025, Action successfully completed two financing transactions. The first raised €1.6 billion of total incremental term loan debt.… |
| S7 | unverifiable | **supported_full** | (empty) | In October 2025, Action successfully completed two financing transactions. The first raised €1.6 billion of total incremental term loan debt.… |
| S8 | supported_full | supported_full | …incremental term loan debt. Su | …incremental term loan debt.… |
| S9 | conflict | **supported_full** | …incremental term loan debt. Su | …incremental term loan debt.… |
| S10 | unverifiable | **not reviewed** | (empty) | (empty) |
| S11 | supported_full | supported_full | Our Infrastructure business generated a gross investment return of £139 million… | the infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month period. |
| S12 | supported_full | supported_full | Our Infrastructure business generated a gross investment return of £139 million… | same |
| S13 | supported_full | supported_full | The first dividend of 36.5 pence per share for FY2026… | same |
| S14 | supported_full | supported_full | We remain cautious in the deployment of capital into new investment… | same |

Verdicts that move: S6, S7, S9, S10 only (T9). Excerpt-only moves on S1, S8, S11 do not change the verdict.

---

## T11. Tests whose behaviour changed

1. `tests/b259-unlocatable-excerpt.test.mjs` D9. Before: empty confirmed + no spans displayed `unverifiable` with `supportState` `supported`. After B3: `not reviewed` / `skipped` / `excerpt_not_locatable`. Not a silent Confirmed. The expectation was updated to B3, not silently inverted. Correct.

2. `tests/author-name-blindness-guard.test.mjs`. First full-suite run failed on the new Title-Case regex in `lib/qc/card-honesty.mjs`. Added `AUTHOR-NAME-BLIND:` — omission tokens are facts the source is alleged to lack; the authoring organisation's name is a checkable token like any other. The guard's job. Not a product-behaviour change. Correct.

No other existing test was rewritten to hide a miss.

---

## What correct writing this could now change

A writer who correctly stated the October financing (S6, S7) or the GIC 2.2% purchase (S9) was being told Unverifiable or Conflict and might have deleted or hedged true sentences; those cards now leave that writing standing.

## What in B349 pieces 1 and 2 was not built

The Stage 5 prompt line from B349 D7 (B7 is assembly-only). Editorial source-awareness, pairing of dates and scale, the splitter, the Stage 5 contract, and the actor check (B8; filed B352 / B353). The claim-span prefilter was not widened (B341).
