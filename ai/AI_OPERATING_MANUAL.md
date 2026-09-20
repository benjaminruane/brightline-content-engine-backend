# Operating manual for Cursor

Read this before every spec. Then follow `ai/SPEC_TEMPLATE.md`. If the spec touches the QC pipeline, also read `docs/ARCHITECTURE.md` (audited 2026-09-20). Do not treat ROADMAP as the live pipeline contract.

This file is rules and facts. It is not a narrative for Ben.

---

## Bind at every action

- Backend is authoritative. The frontend renders the contract. It does not re-derive evidence verdicts.
- Minimal diffs. Do not redesign stable plumbing unless the spec says so.
- No generative fallback fluff. A miss is a miss. It is not a finding.
- Run to completion. Ask only when a decision changes user-facing behaviour, the data contract, verdict logic, or is hard to reverse.
- **B222.** A change that only removes a contradiction, fixes plainly wrong copy, adds a test for shipped behaviour, or removes duplication, and that changes no verdict logic, no data contract, and no user-facing behaviour beyond the copy, may ship without a spec. Log it in `docs/BACKLOG.md` in the same commit. Everything else needs a spec.
- **P31.** A missing input must be loud at the point it goes missing. Refuse, or log, at the writer. Do not silently default.
- **P33.** Anything a future test or spec depends on is committed in git. Never paste a live payload into a conversation and treat the paste as the fixture. See the case study below.
- No em dashes or en dashes in specs, reports, or user-facing copy. ASCII hyphen and period only.
- Every claim is CONFIRMED (file and line, or a named committed artefact) or HYPOTHESIS.
- Open with the scoreboard.
- Dual summary at the end of implementation work: technical, then plain-language user impact. `.cursor/rules/summary-contract.mdc`.

---

## Change Surface Discipline

When a spec changes a shared helper, the spec must enumerate every caller of that helper and state what the change does to each one. A helper that is safe for one caller is not automatically safe for the rest. B278 changed the rate-limit retry wrapper having considered exactly one of its twelve callers (`analyse-statements`). The other eleven inherited an unbounded wait that hung the product in production on 20 September 2026. After this, a shared-helper spec that cannot list its callers is not ready to implement.

---

## How work actually runs

1. Spec is written in the form in `ai/SPEC_TEMPLATE.md`. Part 0 can stop the build.
2. Cursor implements. No model calls unless the spec says so.
3. Cursor commits when asked. Ship is `npm run verify:ship` in both repos. That gate requires a clean tree and HEAD on the remote.
4. Docs-only commits under `docs/` and `scripts/diagnostic/` skip the backend deploy (`vercel.json` `ignoreCommand`). Changes under `ai/` or `.cursorrules` do not skip it.
5. Layout, controls, and copy are checked on local `localhost:5173`. Anything downstream of a Review is checked on production, with the header pill `v4`.
6. Cost is a named Langfuse USD figure, or zero. Unpriced calls are an undercount, never a silent zero. Ledger: `docs/SPEND_LEDGER.md`.

Ids come from `docs/BACKLOG.md`. Next free number in that prefix. Gaps are fine. Specs this year use B/P/F/Pr. The old R-series is history. One BACKLOG row plus the commit is the invariant.

---

## Pipeline facts specs keep getting wrong

Full contract: `docs/ARCHITECTURE.md`. Do not cite it for sprint status.

- Production is v4 (`QC_PIPELINE_V4=1` or `options.pipelineRoute === "v4"`). Unset env still falls back to v3. v3 is still imported on every request.
- Models are pinned snapshots in `lib/qc/model-config.mjs` (`gpt-4o-2024-08-06` for QC stages). Never write a floating alias into a spec.
- Temperature 0 on QC LLM stages. `seed=1` on Stage 2. That does not pin `hasConflict` (**B61**).
- One sentence, one card. Claim spans never add cards. They may upgrade a partial to confirmed. They may never downgrade, never flip `hasConflict`, never override a sentence-level conflict.
- Stage 3 is conflict-wins, in code. Commentary cannot change a verdict.
- Stage 6 evaluates the current statement. The editorial user payload still pastes the full marked draft as context. Those are different facts. Do not cite "current statement only" as a cost claim.
- Stage 5 and Stage 6 concurrency is planned at run time from the actual statements, estimated tokens per call, and live remaining TPM. Stage 2 stays at 24. Function cap is 300 seconds. A 429 waits until it fits, inside that cap minus remaining work. Hitting the bound is `not_reviewed`, never clean.
- A Stage 5 miss is empty prose plus `commentaryNotReviewed: true`, not a canned finding (**B254**).
- When editorial or compliance is off, the payload stamps `clean` and the screen says `Not reviewed` (**B247**). Believe the screen, not the payload field.
- `QC_LLM_CACHE` (default ON, memory only in production) covers Stages 1, 1b, and 2. Not 5. Not 6.
- `review_state` is an overwrite autosave blob. `reviewer_decisions` is the append-only start of B9, governance kinds only.
- Four-statement ~$2/run is not a real-document cost. A 3700-word memo with every Stage 6 check completed billed USD 11.1897 list. Read the ledger.

---

## Lessons that must not be relearned

Standing rules live in `docs/BACKLOG.md`. They bind here so a spec does not have to paste them.

- **P13.** Dependency commits include the lockfile. Backend install is `npm ci`.
- **P14.** Payload-size behaviour cannot be tested locally. Production only.
- **P15.** The Pr9 marker harness measures honesty, not correctness. Read the quoted output.
- **P16.** Planted faults belong only in invented fixtures. Real sources stay verbatim.
- **P18.** Telling a model what not to put in a gap makes it fill the gap. Write a check.
- **P19 / P22.** A harness score is not verification. Confirm on the deployed path.
- **P20.** If deterministic code consumes model prose, the model is the specification. Ask what happens when that prose is wrong.
- **P21.** A model asked to reason about a hypothetical post-transform state reasons about the actual state. Compute the future state in code.
- **P23.** Judge on the trend in defect severity, with a falsifiable stopping rule set before the run.
- **P24.** If local config will not load, run the test where the config already works.
- **P25.** If a question cannot be answered from the output, that is the finding.
- **P26.** After two failed hypotheses about the same behaviour, instrument it.
- **P27.** A tag landing is not a row closing.
- **P28.** Check whether the data already records that the mechanism fired.
- **P30.** The Meridian fixture contradicts itself on purpose. Do not quietly fix it.
- **P31.** Missing input is loud at the writer. See above.
- **B222.** Standing authority. See above.
- **P33.** Commit the artefact. See above.

Also keep:

- Trace the live path before iterating a prompt. If a change has no observable effect, the path is probably not running.
- After two specs on the same symptom miss, stop speccing and diagnose. Diagnosis is read-only.
- Split when surfaces differ. A small sprint that ships cleanly beats a bundle you cannot bisect.
- Signal suppression is per-instance, not per-rule-id. Default is keep. R6.3 is the pattern.
- Style rules with a structurally checkable property get a deterministic backstop in `STYLE_RULE_DETERMINISTIC_FILTERS`. Semantic rules do not.
- QC output to the user is plain language. No system vocabulary (`entity`, `corpus`, `canonical claim`).
- `editorialVerdict: "not_reviewed"` means the check did not complete. Do not treat it as clean. A genuine clean note is `No editorial or style concerns identified under the listed rules.`
- Category routing is enforced in salvage, not by prompting the model to be tidy (**B14**).
- Reproducibility: any eval at temperature above 0, or any reasoning model, is run 2-3 times and reported as a range, not a single cell (**P2**).
- Edit `docs/BACKLOG.md` when a decision lands. Do not draft a later sync prompt and forget.

---

## P33 case study

B226 reconstructed Meridian fixture 1 from a conversation. The 18 Sep live payload was not in the repo. Card 0 wording differed (`month of June 2026` vs live `timing as June 2026`). Live had six margin notes. The reconstruction had three. Grouping, covering-note checks, and D7 of B240 all had to rediscover that the fixture was not the run. The live dump was committed later as `tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json`. If a test or a later spec will need it, commit it in the same pass that first depends on it.

---

## Cost

No invented USD. Named source, or zero.

- Interactive Review on a short synthetic draft is not the unit of planning. Read `docs/SPEND_LEDGER.md`.
- Flag before a full diagnostic batch. Prefer `--only` subsets.
- `verify:ship` is not a billed pass.
- A spec that says "no model calls" reports USD 0 and does not call.

---

## What this file used to contain, and why it is gone

Cut: Ben-and-Claude working-model story; R-series tag ritual; R6.4a incident novel; R5/R3.1 sequencing examples; first-person routing essay; $2/run presented as the cost; legacy commentary field names; "draft a doc-update prompt" procedure; D1.3.2 grep novella.

Kept the rule each of those was trying to teach, in one or two lines. This file is read before every spec. If it is longer than the spec, it loses.
