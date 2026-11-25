BUILD SPEC. Ids: B596.

WHY
Screen, summary and PDF have been deciding the same card in more than one place
(census DISAGREES on label, reason, summary). One backend stamp is the only decision.

======================================================================
PART 0A. CLAIMS. STOP IF A BLOCKING ONE IS FALSE.
======================================================================
C1 BLOCKING. Census at ~/ce-diagnostics/census/CENSUS.md records dual-path
label/reason/summary disagreements. CONFIRMED.
C2 BLOCKING. applyReadingContract already runs shownTrace and finaliseShownReason
but shownLabel can re-run shownTrace without write-back. CONFIRMED (shown-verdict.mjs).
C3 CHECK. No model call. Cost USD 0.

======================================================================
PART 0B. DESIGN.
======================================================================
D1 Stamp once finally after shownTrace + amber reason guard; write
combinedVerdict, sentenceLabel, statementVerdict, shownReason so they agree.
D2 Amber/red shownReason must state a gap; support-only reasons force gap text
or Rule B / facts-only green.
D3 meta.reviewSummary and reading.header from stamped card states only.
D4 Source displayName stamped once; passages/ellipsis rules live in backend;
FE formats only.
D5 FE reads stamps for label, tone, wash, filters, Risk, summary, reason,
Change suggested, export. No re-derivation.
D6 PDF draftFlow takes paragraph gaps from full draft text between spans.
D7 Canonical export uses stamped label/shownReason.

VERIFY A-D as in the user prompt. Ship both repos, tag b596.
