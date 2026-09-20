# Spec template

Cursor: read `ai/AI_OPERATING_MANUAL.md` before filling this in. Standing directives below are part of every spec. Do not paste them into the spec body. Reference this file.

The implementer's report is generated from the parts that actually ran. Do not write a REPORT shopping list in the spec. Two specs in September 2026 shipped a list that did not cover their own sections.

---

## Standing directives (every spec)

These bind even if the spec body does not repeat them.

1. Part 0 is the only place the implementer may stop. After Part 0, run to completion. No "continue?".
2. Ask only when a decision changes user-facing behaviour, the data contract, verdict logic, or is hard to reverse. Otherwise choose, proceed, record.
3. Take the next free ids from `docs/BACKLOG.md` and say which were used. Do not reuse an id that is already a row or a committed test prefix. Untracked files in the tree can steal an id. Check those too.
4. Mark every claim CONFIRMED (file and line, or a named committed artefact) or HYPOTHESIS.
5. Open the implementer response with the scoreboard.
6. No em dashes or en dashes anywhere in the spec, the report, or any copy this spec ships.
7. Follow repo precedent. Smallest change surface. Do not touch Stage 1 or the Stage 2 prompt unless the spec names them. If a required change would touch them and the spec said stop, stop.
8. **P31.** A missing input is loud at the writer. No silent defaults.
9. **P33.** Fixtures, payloads, and traces a later test or spec will need are committed, not pasted.
10. **B222** still applies. This template does not waive it.
11. No model calls unless a part says so. Cost report is required. USD 0 if none.
12. Ship gate: `npm run verify:ship` in both repos unless the spec is backend-only or frontend-only. Working tree must be clean. HEAD must match the remote.
13. Browser: local `localhost:5173` for layout, controls, labels, console. Production, header pill `v4`, for anything downstream of a Review. Skip the browser for copy-only with no layout effect, and for work with no visible surface. Say so.
14. Implementation summaries include technical then plain-language user impact.
15. Edit `docs/BACKLOG.md` in the same work: open rows, closed rows, standing rules, findings. Do not leave the decision in chat.

A typical spec that used to repeat items 1-15 in the prompt can drop that block and keep WHY, claims, design, and any extra ship notes. That is about 80 to 120 lines off a September BUILD SPEC.

---

## Spec body (what you write)

```
BUILD SPEC. Ids: next free from docs/BACKLOG.md.

WHY
...

======================================================================
PART 0A. CLAIMS. STOP IF A BLOCKING ONE IS FALSE.
======================================================================
C1 BLOCKING. ...
C2 CHECK. ...

======================================================================
PART 0B. DESIGN. Agree, amend, or reject each. Then build.
======================================================================
D1 ...
D2 ...

(Further parts as needed. Number them. Each part is a report heading later.)

======================================================================
SHIP
======================================================================
Commits, tags if any, verify:ship, BACKLOG, ledger if billed.
If this spec would change product code and it said it would not, STOP.
```

Optional, only when the spec is not a build: `PROPOSAL` or `DIAGNOSTIC` in place of `BUILD SPEC`. Same claims discipline. Diagnostic is read-only.

---

## Implementer report (generated from the parts)

Do not copy a REPORT list out of the spec. After the work, write:

1. Scoreboard (first).
2. Ids used.
3. One heading per part that ran, in order (Part 0A, Part 0B, Part 1, ...). Under each: the verdict (TRUE / FALSE / AGREE / AMEND / REJECT), CONFIRMED evidence, and what shipped.
4. What was not built, if the spec allowed a leftover.
5. Cost report: calls, USD, source. Zero if none.
6. Technical summary. Plain-language summary.

If a part was added during the run, it appears in the report. If a part did not run because Part 0 stopped, the report is Part 0 only.

---

## Ship notes the spec does not need to repeat

- Commit messages in the repo's voice: `fix(...)` / `docs:` / `test(...)`, ids in parentheses.
- Docs-only paths `docs/` and `scripts/diagnostic/` skip backend deploy. `ai/` and `.cursorrules` do not.
- Production is the only valid check for payload size (**P14**) and for "the harness is green so it works" claims (**P19**).
- Do not quietly regenerate the Meridian fixture (**P30**).
