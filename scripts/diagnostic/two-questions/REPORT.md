# B349. The product knows more than it says, and it judges a sentence as one claim

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | e7dcbac | SHIP VERIFIED  e7dcbac  main  139 files  1630 tests |
| frontend | not touched | -- |

Ids used: B349 (this diagnostic), B350 (filed: first piece, card-honesty invariant).

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change. No Review. The 29 September payloads are not in this repo (P33). Probe sentences are reconstructed from the spec's verbatim fragments and labelled RECONSTRUCTED.

---

## Part 0A. Confirm or correct

### A1  TRUE

For E1 and E2, `excerptNotLocatable` is set in `assembleCard` after Stage 4 has already chosen a `primaryExcerpt` from `sourceMatches` only. The honesty gate then demotes a `supported_full` card to Unverifiable. A located `supportSpan` on the same statement is never offered to that gate.

Quoted `lib/qc/pipeline-v3/stage7-assemble-card.mjs`:

```
    const gatedPrimary = gateExcerpt({
      passage: rawPrimaryPassage,
      sourceLabel: primaryExcerpt?.sourceLabel,
      sources: assemblyContext?.sources,
      supportSpans,
    });
    ...
    const excerptNotLocatable =
      passageRejected || (rawPrimaryPassage.trim().length > 0 && gatedPrimary == null);
```

```
function applyExcerptHonestyToDisplay({ displayVerdict, hasRealExcerpt, excerptNotLocatable }) {
  if (displayVerdict !== "supported_full") {
    return { displayVerdict, evidenceNotReviewedReason: null };
  }
  ...
  return {
    displayVerdict: "unverifiable",
    evidenceNotReviewedReason: NOT_REVIEWED_REASONS.EXCERPT_NOT_LOCATABLE,
  };
}
```

The two locators do not share a path.

`gateExcerpt` recovers the displayed pointer from the named source by **label**. It voids `supportSpans`.

Quoted `lib/qc/excerpt-locate.mjs`:

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

`rewriteSpanFromSource` rewrites stored spans from **offsets** on `sourceRefId`. Assembly maps every span through it and keeps the result on the card.

Quoted `lib/qc/excerpt-locate.mjs`:

```
export function rewriteSpanFromSource(span, sources) {
  if (!span || typeof span !== "object") return span;
  const src = sourceTextAt(sources, span.sourceRefId);
  const start = Number(span.start);
  const end = Number(span.end);
  if (src && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= src.length) {
    return { ...span, passage: src.slice(start, end), start, end };
  }
```

Quoted `lib/qc/pipeline-v3/stage7-assemble-card.mjs`:

```
    const outSupportSpans = supportSpans.map((span) => rewriteSpanFromSource(span, assemblyContext?.sources));
```

Stage 4 on a confirmed verdict never reads those spans.

Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`:

```
  if (v === "confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "confirmed");
```

`firstMatchWithClassification` skips empty passages. If the Stage 2 single-pick pointer is empty, rejected (B251), or unrecoverable by label, the card reports it could not find a quote while `rewriteSpanFromSource` is holding one at `[1624-1987]` / `[1624-2278]`.

There are two locators because display honesty (B325) was bolted onto the Stage 4 object, and span rewrite (R7) was bolted onto the stored span list. They were never asked to agree.

Probe (`node scripts/diagnostic/two-questions/probe.mjs`):

```
=== A1 two locators ===
rewriteSpanFromSource.passageChars=360
gateExcerpt.passage="In October 2025, Action successfully completed two financing transactions.\nThe first raised €1.6 billion of total\ninc
gateExcerpt voids supportSpans (excerpt-locate.mjs). Confirmed Stage 4 never reads supportSpans.
```

### A2  TRUE, with the writer named

The stored passage is empty because `rewriteSpanFromSource` is given a confirmation span with no pointer and no offsets. Offsets do not land, recovery of an empty pointer misses, and the function writes empty string plus null offsets. That is the function's miss branch, not a display trim.

Quoted `lib/qc/excerpt-locate.mjs`:

```
  const recovered = recoverExcerptFromSource({ pointer: span.passage, sourceText: src });
  if (recovered?.miss || !recovered?.passage) {
    return { ...span, passage: "", start: null, end: null };
  }
```

Quoted `lib/qc/excerpt-from-source.mjs`:

```
  if (!needle || !source) {
    return { miss: true, reason: !needle ? "empty_pointer" : "empty_source" };
  }
```

How the span arrived empty: B251. Stage 2 keeps the classification and empties a passage that fails `validatePassageAgainstSource`.

Quoted `lib/qc/pipeline-v4/stage2-match-sources.mjs`:

```
    if (!validation.accepted) {
      ...
      passage = "";
      passageRejected = true;
    }
```

Quoted `docs/ARCHITECTURE.md`:

```
A passage the matcher cannot re-locate is emptied; the classification is kept (B251).
```

Probe:

```
=== A2 empty confirmation span ===
emptyPointerRewrite={"passage":"","start":null,"end":null}
```

What should happen when Stage 2 returns a confirmation with no passage: refuse at the writer (P31). A `confirmed` classification with an empty passage is not a confirmation. Do not keep the class and show Unverifiable later. Log, and emit `not_reviewed` or `no_support` with the existing `excerpt_not_locatable` reason. B251 can stay for `partially_confirmed` and `conflicting` (the matcher ran; the quote was lost). It must not keep `confirmed`.

E3 is therefore a different failure from E1 and E2: E1/E2 hold a located span and will not show it; E3 holds nothing and still classified confirmation.

### A3  TRUE

Stage 4 `trimExcerptTo300` truncates. Cap is 300 characters. It prefers the last `". "`, `"! "`, or `"? "` inside the first 300 characters; otherwise it hard-cuts at 300 and appends `"..."`. A period followed by a newline is not a boundary, so a source line-break after `"total"` does not end the sentence, and the cut lands mid-word.

Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`:

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

The truncated string is what Stage 4 stores as `primaryExcerpt.passage`. Assembly then gates that stored pointer. Truncation is at selection, not at display. Stage 2's own cap is 400 characters (`trimPassageToLimit`) and uses `lastIndexOf(".")`, a different rule, so a 400-character Stage 2 pointer can still be cut mid-word at 300 in Stage 4.

Probe (E5-shaped passage, period then newline, 373 source characters):

```
=== A3 Stage 4 trim on an E5-shaped passage (period then newline, not period-space) ===
sourceChars=373
primaryExcerptChars=303
primaryExcerpt="In October 2025, Action successfully completed two financing transactions.\nThe first raised €1.6 billion of total\nincremental term loan debt.\nSubsequently the company applied proceeds to a pro-rata redemption of shares held by minority investors alongside a further package of documented terms that e..."
endsWith="ms that e..."
```

The live cards ended at `"Su"` because the stored pointer was a different 300-character window of the same paragraph. The mechanism is the same: no `". "` in the window, hard cut, mid-word. In S8 the fragment stops before the share redemption the card is about.

### A4  TRUE

There is no "best passage" rule on a confirmed card. `selectExcerpts` takes the first `sourceMatches` row whose classification is `confirmed`, in source-upload index order, skipping empty passages. `supportSpans` are ignored on that path. Widened or later matches never get a vote for the quote.

Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`:

```
 * First match with given classification in source upload order; skips empty passages.
function firstMatchWithClassification(matches, cls) {
  const sorted = [...(Array.isArray(matches) ? matches : [])].sort(
    (a, b) => Number(a.sourceIndex) - Number(b.sourceIndex)
  );
  for (const m of sorted) {
    if (normalizeClassification(m.classification) !== cls) continue;
    const excerpt = toExcerpt(m);
    if (excerpt) return excerpt;
  }
  return null;
}
```

```
  if (v === "confirmed") {
    primaryExcerpt = firstMatchWithClassification(matches, "confirmed");
```

S11: the £139 million / 9% passage is the first confirmed match, so it is shown. The Chief Executive line about outperforming expected returns can sit in `supportSpans` and is not consulted.

S1: the 13% Group sentence is the first confirmed match, so it is shown. The 14% Private Equity sentence, if stored later or only as a span, is not shown.

Probe:

```
=== A4 first confirmed match wins (source order), spans ignored on confirmed ===
S1-shaped primary="The total return of 13% represents a very good first half for the Group."
S11-shaped primary="3iN generated £139 million of income and a 9% total return."
```

This is the same "knows more than it says" shape as E1/E2, on a card that happened to stay Confirmed.

### A5  TRUE

Neither editorial rule sees matched source text at the point the concern is raised. B178 removed the source from the editorial payload on purpose. `overreach_unsupported_causal` (S12's "driven primarily") states that it cannot see sources. `marketing_language_excess` (the home of evaluative / hyperbole language, S3 "record year") inherits `EVALUATIVE_LANGUAGE_INSTRUCTION`, which tests the remaining clause after deletion, not the source.

Quoted `lib/qc/editorial-compliance-reviewer.mjs`:

```
  // B178 removed sourceExcerpt / evidenceBlock from the prompt deliberately.
  void evidenceBlock;
  void sourceExcerpt;
```

Quoted `lib/rulebook/editorialRules.js` `overreach_unsupported_causal`:

```
Judge this from the CURRENT STATEMENT and the surrounding draft only. Whether a source supports the claim is an Evidence matter and is not assessed here. ... You cannot see the source documents.
```

Quoted `lib/qc/evaluative-language.mjs`:

```
Apply one test. After the evaluative word is removed, does the remaining clause still tell a reader something?
```

Framing fidelity does the check that these two do not. It collects matched passages, including `supportSpans`, and sends them to the judge.

Quoted `lib/qc/framing-fidelity.mjs`:

```
export function collectFramingEvidence(entry) {
  ...
  const supportPassages = Array.isArray(entry?.supportSpans)
    ? entry.supportSpans
        .map((s) => (typeof s?.passage === "string" ? s.passage : ""))
        .filter(Boolean)
    : [];
  ...
  return {
    passages: dedupePassages([primaryPassage, ...supportPassages]),
    evidenceSummary,
  };
}
```

That is why framing can spare a phrase the source uses, and why these two editorial rules cannot.

### A6  TRUE

`findCandidatePairs` skips date tokens. A scale word is not a comparable token of its own. It is folded into `kindKey` for money (`money:million:GBP` vs `money:billion:GBP`), so million and billion never pair. `sameQuantity` is false across scale. A bare `"million"` produces no token at all.

Quoted `lib/revise-actions/conflict-engagement.mjs`:

```
  for (const draft of draftTokens) {
    if (draft.kind === "date") continue;
```

```
function kindKey(token) {
  const base = token.scale ? `${token.kind}:${token.scale}` : token.kind;
  if (token.kind === "money") {
    return token.currency ? `${base}:${token.currency}` : `${base}:bare`;
  }
  return base;
}

export function sameQuantity(a, b) {
  return kindKey(a) === kindKey(b) && a.value === b.value;
}
```

```
export function compatibleTokens(draft, source, excerpt) {
  if (kindKey(draft) !== kindKey(source)) return false;
```

Probe:

```
=== A6 findCandidatePairs dates and units ===
S0 date tokens in draft: [ { raw: '30 June 2025', kind: 'date', value: 30 } ]
S0 pairs vs September source: []
unit draft money tokens: [ { raw: '£3,291 billion', kind: 'money', scale: 'billion', value: 3291 } ]
unit source money tokens: [ { raw: '£3,291 million', kind: 'money', scale: 'million', value: 3291 } ]
sameQuantity million vs billion: false
unit pairs: []
standalone 'million' tokens: []
```

### A7  TRUE. Both B339 / B342 findings still hold on this draft.

B339 / B342: the compound prefilter admits almost no sentences of this kind, and `rollupClaimVerdicts` can only raise a verdict, never lower one, and that raise is compiled off.

Quoted `lib/qc/claim-spans.mjs`:

```
export const ADDITIVE_BOUNDARIES = [
  ", and ",
  ", with ",
  ", while ",
  ", including ",
  "; ",
  " as well as ",
];
```

```
export function isCompoundCandidate(sentenceText) {
  const t = asText(sentenceText);
  if (!t.trim()) return false;
  const anchors = extractVerifiableAnchors(t);
  if (anchors.length < 2) return false;
  const hasBoundary = ADDITIVE_BOUNDARIES.some((b) => t.includes(b));
  if (!hasBoundary) return false;
  if (relationalConnectivesIn(t).length > 0) return false;
  return true;
}
```

```
 * Verdict is always V_today. claimUpgrade is always false.
```

```
  const upgrade = false;
  ...
  return {
    verdict: vToday,
    claimUpgrade: false,
```

There is no branch that lowers `vToday`. Commit `68940c3`.

Probe on the fifteen reconstructed Run A sentences (payloads not in repo; labelled RECONSTRUCTED). Ben marked eight as multi-claim (S0, S1, S2, S4, S5, S7, S9, S11). The prefilter admitted two: S7 (`", and "`) and S9 (`", with "`). S5's plain `" and "` is not an additive boundary. S0's `"or"` is not. S12's `"driven by"` is a relational connective and would be refused even if a boundary were present. S1, S2, S4, S11 have no listed boundary.

```
=== A7 isCompoundCandidate on reconstructed Run A (payloads not in repo) ===
S0  compound=false  benMulti=true  boundaries=[]  connectives=[]
S1  compound=false  benMulti=true  boundaries=[]  connectives=[]
S2  compound=false  benMulti=true  boundaries=[]  connectives=[]
S3  compound=false  benMulti=false  boundaries=[]  connectives=[]
S4  compound=false  benMulti=true  boundaries=[]  connectives=[]
S5  compound=false  benMulti=true  boundaries=[]  connectives=[]
S6  compound=false  benMulti=false  boundaries=[]  connectives=[]
S7  compound=true  benMulti=true  boundaries=[", and "]  connectives=[]
S8  compound=false  benMulti=false  boundaries=[]  connectives=[]
S9  compound=true  benMulti=true  boundaries=[", with "]  connectives=[]
S10  compound=false  benMulti=false  boundaries=[]  connectives=[]
S11  compound=false  benMulti=true  boundaries=[]  connectives=[]
S12  compound=false  benMulti=false  boundaries=[]  connectives=["driven by"]
S13  compound=false  benMulti=false  boundaries=[]  connectives=[]
S14  compound=false  benMulti=false  boundaries=[]  connectives=[]
admitted: S7, S9
```

Even on the two admitted sentences, rollup cannot lower the sentence verdict. Splitting would not have moved S8 Run B from partly-confirmed to a named MAIT error, and would not have made S5 Run B mention the still-correct 6.3%.

### A8  TRUE

An `unsupportedSpan` covering a whole sentence is stored on the card and never painted. Stage 2 elicit is only for `partially_confirmed` and `conflicting`. Implement Changes reads the span. The frontend does not.

Quoted `lib/qc/pipeline-v4/stage2-match-sources.mjs`:

```
export const SPAN_ELICIT_CLASSIFICATIONS = new Set(["partially_confirmed", "conflicting"]);
```

Quoted B342 `scripts/diagnostic/inner-claim/REPORT.md`:

```
`unsupportedSpans` is validated ... copied onto the card ... and read by Implement Changes ... The frontend has no read of `unsupportedSpans`
Denmark produces no card line because the span is stored and never painted.
```

The comment attached to `"significant"` because `thing1FromCandidates` prefers the shortest quote that is shorter than the whole statement. `evidenceCandidates` feeds both the whole-sentence span and any quoted snippets from `evidenceSummary`. The word `"significant"` in quotes wins on length.

Quoted `lib/revise-actions/thing1.mjs`:

```
export function thing1FromCandidates(candidates, statement) {
  const stmt = String(statement ?? "");
  const proper = candidates.filter((c) => c.length < stmt.length);
  const chosen = (proper.length ? proper : candidates).slice().sort((a, b) => a.length - b.length)[0] || null;
```

Probe:

```
=== A8 thing1 on a whole-sentence unsupportedSpan plus a quoted word ===
{"state":"PHRASE","quote":"significant","source":"evidenceSummary_quote","length":11}
```

Internally the whole sentence is in `unsupportedSpans`. The card face highlights `"significant"` and the Stage 5 comment, given a highlight about a word, talks about that word. Nothing on the card names MAIT.

### A9  TRUE: there is no live check

`excerptCreditsADifferentActor` / `corePropositionConfirmed` exist in `lib/qc/evidence-relationship.mjs`. They ask whether the excerpt's nearest name before a relation is someone other than the statement's anchor, and only when an authoring organisation is configured. They are imported by `lib/qc/evidence-authority.mjs`, which the backend census records as an orphan. v4 Stage 2 / Stage 3 does not call them.

Quoted `lib/qc/evidence-relationship.mjs`:

```
function excerptCreditsADifferentActor(excerpt, anchor, sharedRelations) {
  if (!resolveAuthoringOrganisationName()) return false;
  ...
  const subject = [...names].reverse().find((n) => /\s/.test(n));
  if (subject) {
    const lower = subject.toLowerCase();
    const sharesGroundWithAnchor =
      lower === anchor || lower.includes(anchor) || anchor.includes(lower);
    if (!sharesGroundWithAnchor && !isAuthoringOrganisationName(subject)) return true;
  }
```

That test is also the wrong question for F3/F4: it is about author vs other, not "did MAIT complete the redemption" vs "did Action". There is no live check that the named party performed the named action, as distinct from whether the name appears in the source. F4 was caught because "the UK government" appears nowhere. F3 was missed because MAIT appears in the source doing something else.

### A10  PARTLY. S7 is not a different writer.

Nothing in Stage 5 is a per-claim commenter. Stage 5 receives the sentence, the verdict, one primary excerpt, and `sourceExplanations` (Stage 2 classification plus explanation per source). The prompt tells it to use those explanations to identify what the source confirms or contradicts.

Quoted `lib/qc/pipeline-v4/prompts/stage5_v2.md`:

```
- `sourceExplanations`: a list of per-source classification and explanation pairs from the matching stage. Use these only to identify what the source confirms or contradicts within the statement.
```

```
### `partially_confirmed`
Required structure: count + name + suggest.
- **COUNT:** Begin by stating precisely what's confirmed.
```

Quoted `lib/qc/pipeline-v4/index.mjs` (Stage 5 input):

```
          sourceExplanations: Array.isArray(entry?.sourceMatches)
            ? entry.sourceMatches.map((m) => ({
                classification: m?.classification,
                explanation: m?.explanation,
              }))
```

S7's Stage 2 explanation listed four facts. Stage 5 restated them. That is luck of the Stage 2 prose, not a per-claim loop. S7 is also one of the two sentences `isCompoundCandidate` admits, so claim×source matching may have run; the rollup still cannot change the sentence verdict, and Stage 5 is still one comment. F6 shows the model can enumerate claims when the matcher already did. It does not do it from the sentence alone, and it does not do it when Stage 2's explanation collapses to one attractive phrase (F1 Run B, F3).

---

## Part 0B. Question one design

### D1  Several faults. Three real problems, not eight and not one.

E1 through E8 are not eight bugs, and they are not one bug with eight faces.

**Problem 1. Card honesty.** The card is allowed to assert a state that its own stored evidence contradicts, or to report that it could not find something it is holding. E1, E2, E3, E4, E5, E6, and the rhetoric of E9 are instances of this.

- E1/E2: Unverifiable, while a located `supportSpan` is on the payload.
- E3: Confirmed-class span with empty passage (B251 kept the class).
- E4: CONFLICTING, while a stored span states the GIC 2.2% purchase the comment says is missing. False conflict.
- E5: The shown quote is a mid-word 300-character cut that does not contain the fact the card is about. The fuller span exists.
- E6: Confirmed, correctly, but the quote shown is a different fact, and the supporting line was stored and not shown.
- E9: The comment's connective (`However`) introduces a confirmation; S14's comment names silence (`does not specifically mention`) instead of the fault (wrong party). The card's prose disagrees with its own evidence.

The single mechanism for this family is an assembly invariant, not eight excerpt patches: a card may not assert anything its stored evidence contradicts, and may not report that it could not find something it is holding. Excerpt fallback, empty-confirmation refusal, quote selection, and comment-connective hygiene are how the invariant is kept, not separate products.

**Problem 2. Editorial without source.** E7. Where a phrase is in the matched source, a comment is acceptable and a flag or recommended change is not (Ben). Framing fidelity already has the passages. These two rules do not. This is not an excerpt bug.

**Problem 3. Pairing vocabulary.** E8. Dates are skipped. A scale word is not a token. Corrections that are obvious to Ben are invisible to `findCandidatePairs`. This is not an excerpt bug and not an honesty bug. The finding (the wrong period) can already appear as a highlight; the missing piece is a derived replace.

A list of eight fixes would re-break the next time Stage 4 and span rewrite disagree. Three problems, three mechanisms.

### D2  Accept the invariant.

**Invariant.** A card may not assert anything that its own stored evidence contradicts, and may not report that it could not find something it is holding.

**Where.** `assembleCard` (`lib/qc/pipeline-v3/stage7-assemble-card.mjs`), after spans are rewritten and before `qcCard` is returned. Optional cheap helpers in `excerpt-locate.mjs` so Stage 4 can share them. Not a new model call. Not a Stage 2 prompt change.

**What it checks, mechanically.**

1. If `displayVerdict` would be `unverifiable` / `excerptNotLocatable`, and any rewritten `supportSpan` has a non-empty locatable passage, that passage becomes `primaryExcerpt` and the card is not Unverifiable for want of a quote.
2. If `supportState` is `supported` and every stored passage (matches, spans, gated excerpt) is empty, the card is `not_reviewed` / `excerpt_not_locatable`, not Confirmed and not a silent empty Confirmed (E3). Loud at assembly if Stage 2 failed to be loud.
3. If `displayVerdict` is `conflict` and a stored span on the same statement contains the allegedly missing fact as a verbatim slice, the comment may not say the source does not mention it (E4). Either show that span or do not call it a conflict of omission.
4. The displayed excerpt must be a source slice. If the Stage 4 pointer is truncated mid-word, recover from offsets or from the next sentence boundary in the named source, not from the cut pointer (E5).
5. If several locatable passages are stored, the one shown is chosen by the D4 rule, not by "first confirmed match" (E6).
6. Comment rhetoric: a sentence that confirms must not be introduced with a contrastive (`However`, `but`) that implies a remaining dispute (E9). Deterministic on the assembled `evidenceSummary`.

**Cost.** Zero extra LLM calls. A few string scans per statement at assembly. Does not move the size ceiling.

**What point fixes would miss.** The next disagreement between `gateExcerpt` and `rewriteSpanFromSource`. A new Stage 4 trim. A confirmation with a rejected passage. A comment that denies a span sitting on the same object. Point-fixing E1's fallback without (2) leaves E3. Point-fixing E6's order without (1) leaves Unverifiable-with-a-span. The invariant is the thing that stays when the locators keep drifting.

**What it does not catch.** E7 (editorial never received the source). E8 (pairing never issued a replace). F3 (MAIT as actor). Those stay problems 2, 3, and question two.

### D3  Excerpt fix for E1, E2, E3, E5

Deterministic. No model.

1. **Fallback (E1, E2).** In `assembleCard`, if `gateExcerpt(primaryExcerpt)` misses and a rewritten `supportSpan` has a non-empty locatable passage, use that span as `primaryExcerpt` (source slice, offsets, label). Re-run honesty only after the fallback. `gateExcerpt` should stop voiding `supportSpans`; if the pointer misses, try the spans before returning null. Stage 4 confirmed path should also call `firstSpanExcerpt` when `firstMatchWithClassification` returns null, matching what conflicting / partial already do.

2. **Empty confirmation (E3).** At the Stage 2 writer (`normalizeValidResponse`): if classification is `confirmed` and `passage` is empty after validation, do not keep `confirmed`. Emit `no_support` or `not_reviewed` with `passageRejected`, and log. P31. Assembly: if after fallback there is still no locatable passage, `applyExcerptHonestyToDisplay` already demotes `supported_full`; keep that, and do not leave an empty confirmed span on the card.

3. **Trim (E5).** Change `trimExcerptTo300` to treat `"."`, `"!"`, `"?"` followed by whitespace including newline as a boundary, and never hard-cut inside a word: if no sentence boundary exists, back up to the last whitespace in the 300-character window, then `"..."`. Prefer not truncating at all when offsets exist: slice the source at `[start, min(end, start+N)]` on a sentence boundary. The stored `primaryExcerpt` is always a source slice (B325). Do not store a mid-word pointer for display to recover later.

S8's fragment would then either include the redemption sentence or stop at `"transactions."` rather than `"Su"`.

### D4  Selection fix for E6

Deterministic. When several locatable passages are stored for a confirmed statement, show the one that covers the statement's own checkable anchors (figures, dates, names) with the highest overlap, then the shortest such passage, then source order. Do not show a passage whose figures are a different metric (13% Group vs 14% PE; £139 million / 9% vs "outperformed expected returns") if another stored passage shares the statement's figures or distinctive phrase.

Reuse `collectBackstopFigures` / the B345 figure-preference already on conflicting and partial cards. Extend that preference to `confirmed`. `supportSpans` become candidates on confirmed, not only on conflict.

S11 would show the Chief Executive line. S1 would show the 14% sentence. Run A stays Confirmed. The quote changes. That is not a new finding.

### D5  Source-awareness for E7

Honour Ben: comment acceptable, flag or recommended change not, when the phrase is in the source.

Do not paste the source into the editorial prompt (B178 was right about cost and about editorial inventing evidence claims). Do a deterministic post-filter on the editorial result: if the flagged span is a literal substring of any matched source passage already on the entry (`primaryExcerpt`, rewritten `supportSpans`, Stage 2 passages), drop the flag and the recommended change; keep an optional comment-only note if the rule still wants to remark.

S3 `"record year"` and S12 `"driven primarily by share price gains at 3i Infrastructure plc"` are both in the source. They fall out. Framing fidelity already has this shape and stays the evaluative-vs-source judge. `overreach_unsupported_causal` and `marketing_language_excess` keep judging the draft; assembly refuses to raise a concern the source already used.

Zero extra calls. Tiny tokens. Does not reverse B178.

### D6  Correction extension for E8

Deterministic, in `findCandidatePairs` / `annotateTokens`, after Review, on Implement Changes.

**Dates.** Stop skipping `kind === "date"` when both sides parsed a full date (day+month+year) and the values differ. Pair June 2025 with September 2025 on S0. Do not pair a bare year with a full date. Do not pair two dates that already agree.

**Units / scale.** Treat scale as a comparable dimension, not as part of identity that blocks pairing. `£3,291 million` and `£3,291 billion` should pair (same currency, same number, different scale). A scale word that is not attached to a number still produces no token.

**Must not regress B338.** Pence-to-pounds on S13 is a derived match of the same quantity, not a conflict pair. Derived provenance stays. Do not emit a replace that changes 2,681 pence into £26.81 when they already agree. The new pairs are disagreements of date or of scale, with `provenance: derived`, subject to the existing displayed-figure gate and governance.

S0 Run A: offer `30 September 2025`. S0 Run B: offer `£3,291 million` and the September date. The period catch (the highlight) stays; this adds the replace the highlight already implied.

### D7  Wording rule for E9

Deterministic on assembled commentary, plus one Stage 5 prompt line.

1. A sentence that confirms must not begin with a contrastive (`However`, `But`, `Nevertheless`). Rewrite or drop the connective. S9's "However, the source indicates that £755 million was redeployed..." becomes the confirmation without `However`.

2. When the statement names a party the source does not credit with the action, the comment names that fault: "the statement attributes the action to the wrong party." Silence (`does not specifically mention the UK government`) is not the finding. This needs D10 to know it is a wrong-party miss rather than an absence. Until D10 ships, Stage 5's `not_supported` / `partially_confirmed` line: if the statement's leading proper-noun agent does not appear in the excerpt, say so as a wrong-party or missing-agent gap, not as "not specifically mentioned."

---

## Part 0B. Question two design

### D8  Both, but the unit of explanation is the one that would have changed these two runs.

The unit of judgement is the sentence. Stage 3, the badge, and Implement Changes all key off it. Ben's eight multi-claim sentences are real, and the prefilter admits two of fifteen. Widening the splitter without changing the comment would still write one comment per sentence (F1 Run B, F3). That has not answered this.

F6 shows the missing piece is explanation: when Stage 2's prose already listed four facts, Stage 5 listed them. When Stage 2 collapsed to the period (F1 Run B) or to `"significant"` (F3), Stage 5 followed the collapse.

A design that splits sentences and still writes one comment per sentence has not answered this. A design that keeps the sentence as the verdict unit and requires the comment to report every claim has.

Judgement can stay on the sentence so that Run A does not grow eight new badges. Explanation must enumerate claims, including the ones that are fine, whenever the sentence has more than one checkable anchor.

### D9  How a card reports on every claim, including the ones that are fine

Ben: when a sentence has an error, the card must still say what is correct.

**Inventory (deterministic).** `extractVerifiableAnchors` already lists figures, dates, names, acronyms. Pass that list into Stage 5 as `claimInventory` (text plus kind). No extra LLM for the inventory. Do not wait on `isCompoundCandidate`.

**Stage 5 contract (one existing call).** For every inventory item, the comment must say confirmed or not. Required structure on `partially_confirmed` and `conflicting` already begins with COUNT. Extend COUNT to the inventory, not to whatever the model found interesting. Confirmed items get a short clause ("like-for-like sales growth of 6.3% is confirmed"). The gap is named after that, not instead of it.

**Backstop (deterministic).** After Stage 5, if an inventory item's literal figure or name does not appear in the commentary and the item is not the named gap, append one sentence: "Also confirmed: …". Loud empty is worse than a stiff appendix. This is how F1 Run B would still mention 6.3%, and how F3 would still have to speak to MAIT vs Action if the inventory includes both names.

**Highlight.** Do not let `thing1` prefer a quoted adjective over a whole-sentence `unsupportedSpan` when the span covers the actor or the figure that actually moved the verdict. Prefer the span whose text contains a name or number over a four-letter evaluative. F3 would highlight `MAIT` (or the whole clause), not `"significant"`.

**Verdict.** Unchanged. One badge per sentence. No downward rollup (B342). Claim spans stay default-on and keep returning almost nothing; do not widen the prefilter in the same spec as this comment contract.

### D10  "Did this party do this"

Worked against F3 and F4.

F4 is name absence: "the UK government" is not in the source. Stage 2 already treated that as unsupported. Keep it.

F3 is name presence on the wrong action: MAIT is in the source, doing realisations, not the share redemption. Presence is not agency.

**Do not resurrect `evidence-authority.mjs` onto v4.** It is orphaned, author-vs-other, and would refuse supported house sentences.

**Deterministic backstop, then prompt.** From the statement, take the first plausible agent (leading proper noun / acronym before the main verb) and the verb lemma (`completed`, `announced`, `acquired`). From each stored source passage, take the agent of that same verb if the verb appears. If the statement agent and the source agent of that verb differ, and both are recognised names, the pair is an actor mismatch: classification at most `partially_confirmed`, explanation must name both parties, comment must name the fault (D7). If the verb does not appear in the source, this backstop is silent (Stage 2 already classified).

F3: statement agent MAIT, source agent of `completed` / `redemption` is Action. Mismatch. Comment: "the statement attributes the redemption to MAIT; the source credits Action." Highlight `MAIT`.

F4: "the UK government" never appears. Backstop does not fire. Stage 2 `no_support` / partial stays. Comment names wrong party if the inventory includes that name (D9).

**Prompt (same Stage 2 call).** One line: a name in the source doing a different action is not support for this action. Do not treat this as a new call.

False-positive risk on Run A: S9 "3i increased its stake ... after an earlier 2.2% purchase from GIC" has two agents in one sentence. The backstop must bind agent to verb, not "any name in the sentence vs any name in the excerpt." If binding is ambiguous, stand down (same posture as `excerptCreditsADifferentActor` on a junk anchor). S14 Run A "Management announced" stays confirmed.

### D11  Quantifiers

Lower priority. Ben did not raise F5. I would leave it.

F5 ("across essentially all of its investments" still fully confirmed, comment about the portfolio performing well) is a quantifier swap. A lexical list (`all`, `every`, `none`, `the majority`, `across ... all`) on a confirmed card is cheap and would false-flag ordinary English on Run A (S12 "primarily" is already a fight). Do not add a quantifier judge until a corpus count shows how often confirmed cards contain these words and how often the source uses a narrower noun. Measure before building. Not in the first piece.

---

## Constraints

### C1  The control. Run A is a correct draft, with one later-acknowledged miss.

What the design does to all fifteen clean sentences:

| S | Run A today (Ben) | After this design |
|---|-------------------|-------------------|
| S0 | Period error, no correction offered | Still one card. Correction offered (D6). Justified by E8. The only new finding on Run A. |
| S1 | Confirmed; 13% quote | Confirmed; 14% quote if stored (D4). No new finding. |
| S2 | Clean | Unchanged. |
| S3 | False-positive editorial on "record year" | Flag dropped; comment-only allowed (D5). Removes a finding. |
| S4 | Paraphrase accepted | Unchanged (C2). |
| S5 | Confirmed both claims | Unchanged. Comment still names both if inventory is on; it already did in Run A. |
| S6 | Unverifiable with a held span | Confirmed (or whatever Stage 3 already was) with the span shown (D2/D3). Removes a false Unverifiable. |
| S7 | Unverifiable with a held span | Same as S6. Removes a false Unverifiable. |
| S8 | Confirmed; mid-word excerpt | Confirmed; sentence-bounded excerpt (D3). No new finding. |
| S9 | False CONFLICTING | Not a conflict of omission if the GIC span is stored (D2). Removes a false conflict. Comment loses `However` (D7). |
| S10 | Unverifiable; empty span | Not Confirmed-class empty. Loud miss (D3). If Stage 2 really confirmed MPM/MAIT, that is E3 and must not read Unverifiable-while-empty; it must re-match or `not_reviewed`. |
| S11 | Confirmed; wrong quote | Confirmed; supporting line shown (D4). No new finding. |
| S12 | False-positive causal flag | Flag dropped (D5). Removes a finding. |
| S13 | Pence-pounds match | Unchanged (C2, B338). |
| S14 | Clean | Unchanged. |

The danger is flagging correct writing. This design removes four false findings (S3, S6, S7, S9, plus S12) and adds one justified correction (S0 date). D9/D10/D11 must not add findings on Run A. D10 stands down when agent-binding is ambiguous. D9 on confirmed cards is a comment that lists what is already confirmed, not a new concern. D11 is not built.

### C2  Nothing may regress

| Must stay right | Why this design does not touch it |
|-----------------|-----------------------------------|
| Period catch on S0 | Highlight / partial already fires. D6 adds a replace; it does not remove the catch. Date pairing is opt-in for full dates that disagree, not a skip of the period gate. |
| Period catch on S5 | Same period gate. Inventory (D9) adds "6.3% confirmed" on the doctored run; it does not drop the period gap. |
| UK government catch on S14 | Stage 2 absence path stays. D10 is additive for F3, silent when the name is absent. |
| Pence-to-pounds match on S13 | D6 must not pair agreeing derived units as a conflict. B338 `provenance: derived` and `sameQuantity` for 2681 pence / £26.81 stay. Scale pairing is million vs billion, not pence vs pounds. |
| Paraphrase acceptance on S4 | No Stage 2 prompt change in the first pieces. D4/D5/D9 do not re-judge paraphrases. |
| Two derived corrections shipped in B338 | Pairing, B336, displayed-figure, governance unchanged except date skip and scale identity. Tests in `tests/correct-not-compose.test.mjs` are the regression pin. |

### C3  Cost

**Today, this 330-word / 15-statement / one-source draft.** One Stage 2 call per statement×source (15). Claim×source extra only if Stage 1b actually decomposes; the prefilter admits S7 and S9, so at most a handful. One Stage 5 per statement (15, `STAGE5_CALL_TOKENS` 1800). One editorial per statement (15). Compliance if on (15). Planner estimate (`estimateReviewWork`) on a 330-word draft plus a short source: ~17 statements, ~330k tokens, Stage 2 ~52k, editorial ~163k, Stage 5 ~34k.

**Today, 3,698-word draft against a 5,105-word source.** Planner: ~185 statements, ~5.4M tokens, Stage 2 ~1.65M, editorial ~2.56M, Stage 5 ~370k. Live B277 Run 4 on a 3,698-word memo was 187 editorial / 186 compliance, wall 267 s, list USD 16.44, ceiling about 3700 words.

**Under this design.**

| Piece | Calls | Tokens | Multiplier on this draft | Moves the ceiling? |
|-------|-------|--------|--------------------------|--------------------|
| D2/D3/D4 honesty, excerpt, selection | 0 extra | assembly string scans | 1.0x | No |
| D5 editorial substring filter | 0 extra | none (uses stored passages) | 1.0x | No |
| D6 date/scale pairing | 0 extra | Implement Changes only | 1.0x | No |
| D7 connective | 0 extra (optional one Stage 5 prompt line, same call) | Stage 5 output maybe +1 sentence | ~1.0x | No |
| D9 inventory + Stage 5 contract | 0 extra calls | Stage 5 output maybe 1.5x on multi-claim cards | ~1.0x calls; Stage 5 tokens not the ceiling driver | No |
| D10 actor backstop | 0 extra calls | Stage 2 prompt +1 line, same call | ~1.0x | No |
| Paste source into editorial (rejected) | 0 extra | editorial + source×statements. On the large draft ~+1.2M | would | Yes. Do not build. |
| Widen `isCompoundCandidate` and per-claim Stage 2 (rejected as first piece) | +claim×source on every newly admitted sentence | Stage 2 is already 1.65M on the large draft | 1.3-2x Stage 2 if 30% admit | Yes, would pressure the 3700-word ceiling. |

Recommended set (D2-D7, D9, D10): multiplier **1.0x calls**, Stage 5 output a little longer. Does not move the existing size ceiling.

### C4  Sequence

Smallest pieces that stand alone, in ship order.

| # | Piece | Kind | Depends on | Stand-alone value |
|---|-------|------|------------|-------------------|
| 1 | Assembly invariant + excerpt fallback + stop mid-word trim (D2, D3) | Deterministic | None | E1, E2, E5; E3 loud; E4 if the span is present |
| 2 | Confirmed-path selection among stored passages (D4) | Deterministic | Happier if 1 stored untruncated slices | E6 |
| 3 | Editorial post-filter: phrase in matched passage cannot be a flag (D5) | Deterministic | None | E7 |
| 4 | Date and scale pairing (D6) | Deterministic | None (Implement Changes) | E8 |
| 5 | Comment connective + Stage 5 COUNT against inventory (D7, D9) | Prompt + deterministic backstop | Inventory is `extractVerifiableAnchors`, already shipped | F1, F6, E9 |
| 6 | Actor-of-the-action backstop (D10) | Deterministic + one Stage 2 line | 5 makes the comment name it | F3 vs F4 |
| 7 | Quantifiers (D11) | Do not build | Measure first | F5 |

**Ship first: piece 1.** It is deterministic, zero calls, and it is the honesty fault the reviewer actually saw: Unverifiable next to a held span, a quote cut at `"Su"`, a confirmation with an empty passage. It would have changed both 29 September runs without touching verdict logic on the fifteen clean sentences except to stop lying about them. Piece 2 is the same family and can follow in the same spec if the diff stays small; if not, it is the second spec.

Piece 5 is the first question-two change. Do not combine it with piece 1. Do not widen the compound prefilter in the same spec.

### C5  What I would not build, and what I would measure first

**Would not build**

- A downward claim rollup. B342 still holds. F3's verdict moving to partly-confirmed was not the miss; the comment was.
- Widening `ADDITIVE_BOUNDARIES` to plain `" and "` so S5 splits. That admits a large fraction of investment prose. Run A would grow badges. Measure admitted-rate on a production corpus before touching the prefilter.
- Restoring `evidence-authority.mjs` to v4.
- Pasting the source into editorial (reverses B178, moves the ceiling).
- A quantifier judge (D11) in the first month.
- Per-claim Stage 5 calls (Nx commentary). Cost with no extra truth once COUNT is required on the existing call.

**Measure before deciding**

- On a corpus of confirmed cards: how often `supportSpans` contain a passage that `primaryExcerpt` does not, and how often `excerptNotLocatable` is true while a span is locatable. That is the size of problem 1. The 29 September runs are two reviews; they are not a rate.
- Admitted-rate of `isCompoundCandidate` on production drafts after B349's reconstructed 2/15. If it stays near zero, do not spend a spec on the splitter.
- How often `marketing_language_excess` and `overreach_unsupported_causal` fire on a phrase that is a literal substring of a matched passage (E7 rate).
- How often Implement Changes had a date or scale disagreement and emitted no pair (E8 rate). Pin B338's pence-pounds tests before changing `kindKey`.
- F5 rate: confirmed cards whose statement has `all` / `every` / `none` / `majority` and whose source uses a narrower noun.

---

## If only one change

**Piece 1: the card-honesty invariant plus excerpt fallback and a sentence-bounded trim.**

On these two runs it would have shown the October financing span on S6 and S7 instead of Unverifiable, refused an empty confirmation on S10, stopped the excerpt at a word boundary so S8 could include the redemption (or at least not end at `"Su"`), and, if the GIC slice was in the stored spans, stopped S9 calling a present fact a conflict of omission. It would not have flagged "record year", offered the June-to-September replace, or made S5 Run B mention 6.3%. Those are the other two problems, and they wait.

---

## Probe

Command: `node scripts/diagnostic/two-questions/probe.mjs`

The 29 September production payloads (build `a22e894`) are not in this repo. RUN_A in `probe.mjs` is reconstructed from the spec's fragments so `isCompoundCandidate` can be run. Word count of the reconstruction is 199, not 330. Compound results are therefore a lower bound on admission, not a replay.

Full printed output is in Part 0A under each answer.

---

## Files

- `scripts/diagnostic/two-questions/probe.mjs` (throwaway, read-only)
- `scripts/diagnostic/two-questions/REPORT.md` (this file)
- `docs/BACKLOG.md` (B349 closed; B350 filed; B341 annotated)
