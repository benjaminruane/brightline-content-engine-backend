# B332. Bring the repo record current to the 25 September ships

Documentation only. No product code. No behaviour change. No test changes.

-----------------------------------------------------------------------------
SHIPPED
-----------------------------------------------------------------------------

| Repo | Pushed sha | verify:ship |
|------|------------|-------------|
| backend | 70558a8 (docs); 629bcd5 (this report's first scoreboard fill) | SHIP VERIFIED  629bcd5  main  130 files  1574 tests |
| frontend | 3f37565 (no change) | SHIP VERIFIED  3f37565  main  44 files  250 tests |

-----------------------------------------------------------------------------
PART 0A
-----------------------------------------------------------------------------

A1 TRUE. `docs/ROADMAP.md` "Last updated" read `2026-09-21 (B305. Repair-plan tier 1 closed. Ingestion is the active block. Ben 19 September: prose-only sources; hosted by Ben.)`

A2 TRUE. Under `## Recently shipped (closed specs)` the newest dated section was `### Word limit, environment, and summary mix (2026-09-15)`. B194 through B331 had no shipped record in that heading.

A3 TRUE. Rows B312 to B331 existed and were factually current for this spec. No new product rows were required. B333 was filed after the pass as the leftover named in Part 1, not as a missing B312-B331 row.

A4 TRUE. `docs/LAUNCH_SUMMARY.md` header said `Last generated: 2026-09-21`. B101 was still a LAUNCH row there. In BACKLOG.md B101 Launch was already RECORD and the Item cell opened `SHIPPED 2026-09-25 as B330.`

A5 TRUE. `package.json` maps `launch:summary` to `node scripts/regen-launch-summary.mjs`. That script regenerates `docs/LAUNCH_SUMMARY.md` from `docs/BACKLOG.md`.

A6 TRUE. `docs/ARCHITECTURE.md` already referenced B325 and the unverifiable miss. It had no B329, no `DB_UNREACHABLE`, and no `DB_NOT_CONFIGURED`.

A7 21 rows. Item cell began with `**SHIPPED` or `**MEASURED` and Launch was RECORD. None contained `OPEN.` or `stays open`.

ID list: B101, B254, B262, B263, B265, B266, B267, B268, B270, B271, B273, B276, B317, B321, B322, B325, B326, B327, B328, B329, B330.

Not in A7 (still in open `## 2. Backend / Pipeline` after the move): B312, B313, B318, B319 (MEASURED or FILED RECORD, but the Item cell does not begin with `**SHIPPED` or `**MEASURED`); B320 and B331 (begin `**B222.`); B323 (OPEN); B314 / B315 / B316 (OPEN, LAUNCH).

A8 The B321 ship commit is `72f913a` (`extraction: read PDF text directly from the bundled engine, officeparser stays for office formats`). `b7b3155` is the later docs commit (`docs: record the deployed extract-draft-text proof for the PDF engine swap`). No file in either repo credited B321 to `b7b3155` before this spec. Grep of `docs/` and the frontend tree found neither sha. No wrong-credit line to fix. ROADMAP D3 now records the ship as `72f913a` and the deployed proof as `b7b3155`.

-----------------------------------------------------------------------------
PART 0B
-----------------------------------------------------------------------------

B1 AGREE. Inserted the 2026-09-25 position immediately above the 2026-09-21 position. Inserted `> **Superseded 2026-09-26 by the position above. Kept for history.**` directly above the older block. Did not delete the older block.

B2 AGREE. Replaced the Last updated line with D1 (one line, same words as the supplied wrap).

B3 AGREE. Inserted the five D3 sections, newest first, above `### Word limit, environment, and summary mix (2026-09-15)`.

B4 AGREE. Added `### Complete or nothing` at the end of `## 2. Core principles`, after `### Backend authority`.

B5 AGREE. Appended the three database states at the end of `## 9. Persistence`, after the pooled/unpooled paragraph.

B6 AGREE, with two in-place replacements. Moved all 21 A7 rows out of `## 2. Backend / Pipeline` into `### Moved from open tables (SHIPPED / MEASURED)`. Row text verbatim. Launch unchanged. No OPEN. / stays open exclusions.

B268 and B273 were already in the destination table with shorter wording. Those two were replaced in place with the verbatim open-table rows so the table did not carry two IDs. The other 19 were appended at the end of that table in ID order (the section's existing convention is to append a moved batch, not to re-sort the whole table).

Final list actually moved: B101, B254, B262, B263, B265, B266, B267, B268, B270, B271, B273, B276, B317, B321, B322, B325, B326, B327, B328, B329, B330.

Exclusions: none from the A7 rule. B331 was not an A7 row.

B7 AGREE. Replaced the B327 "awaiting Ben" clause with D6 (one table cell; words unchanged).

B8 AGREE. Regenerated with `npm run launch:summary`. Did not hand-edit.

The regenerated file differed from the committed one by more than the generated date and the removal of now-RECORD rows. B101 was removed (RECORD). Date became 2026-09-26. Count went 19 to 21 because B314, B315, and B316 (already LAUNCH in BACKLOG) were missing from the 2026-09-21 generated file and now appear. Backend / Pipeline LAUNCH count 15 to 17.

B9 AGREE. No frontend change.

Files read: `README.md`, `.cursorrules`, `docs/ROADMAP.md`, `docs/FRONTEND_CONVENTIONS.md`, `docs/LOCAL_DEV.md`, `docs/R7_SOURCES_DRAWER_DIAGNOSTIC.md`. Grep across `*.md` / `*.mdc` for partial review, two database states, and excerpt retyped by the model.

None of those files stated a partial review being displayed, a database with two states, or an excerpt retyped by the model rather than sliced from the source. `README.md` still says in-memory session state and no backend persistence; that is stale against review-state, but it is not one of the three positions this spec names, so it was left alone.

-----------------------------------------------------------------------------
A8 FIX
-----------------------------------------------------------------------------

No file and line credited B321 to `b7b3155`. No correction of a wrong sha. The new ROADMAP extraction section is the first place the record states `72f913a` as the ship and `b7b3155` as the deployed-proof docs commit.

-----------------------------------------------------------------------------
STILL WRONG AFTER THIS PASS
-----------------------------------------------------------------------------

`docs/ARCHITECTURE.md` still opens "as of 2026-09-21". Filed as **B333**. Not fixed here.

-----------------------------------------------------------------------------
COST
-----------------------------------------------------------------------------

USD 0. No model calls. No production Review.
