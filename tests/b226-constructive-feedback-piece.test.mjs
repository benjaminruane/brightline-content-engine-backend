/**
 * B226: constructive feedback is a piece, not a form.
 * These assertions are the new contract. They fail on the B26 form.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS,
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
  CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT,
  assembleConstructiveFeedbackPiece,
  buildConstructiveFeedbackPieceUserPayload,
  checkConstructiveFeedbackPiece,
  checkGrouping,
  collectMarginNotes,
  detectInternalFigureClashes,
  feedbackSkeleton,
  skeletonsCollide,
  stripUnquotedCraft,
} from "../lib/qc/constructive-feedback.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";

const EN = "\u2013";
const EM = "\u2014";
const root = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  const raw = JSON.parse(readFileSync(path.join(root, "fixtures/b226", name), "utf8"));
  if (typeof raw.draftText === "string" && raw.reviewOptions && Array.isArray(raw.statements)) {
    return raw;
  }
  const statements = Array.isArray(raw.statements) ? raw.statements : [];
  return {
    ...raw,
    draftText: statements.map((row) => row.text).join(" "),
    reviewOptions: raw.reviewOptions || raw.meta?.reviewOptions || {},
  };
}

const FIXTURES = [
  {
    file: "1-meridian-reporting-live-2026-09-18.json",
    outputType: "reporting_commentary",
    requiredFacts: ["June 2026", "Q3 2026"],
    readiness: "Needs work",
  },
  {
    file: "2-linkedin-post.json",
    outputType: "linkedin_post",
    requiredFacts: ["40 percent"],
    readiness: "Minor points to address",
  },
  {
    file: "3-press-release.json",
    outputType: "press_release",
    requiredFacts: ["EUR 2 billion"],
    readiness: "Minor points to address",
  },
  {
    file: "4-internal-inconsistency.json",
    outputType: "reporting_commentary",
    requiredFacts: ["EUR 84 million", "EUR 81 million"],
    readiness: "Needs work",
  },
];

const CANNED_PIECES = {
  "1-meridian-reporting-live-2026-09-18.json": `Needs work.

The opening date and the equity check size are both off the source. The draft says June 2026; the source says first close expected Q3 2026. "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece" gives a check size the source does not. Put the sourced timing and drop or source the check size.

"Partners Group was attracted to this investment given Meridian Capital's strong track record" assigns a motive the file does not state. "This relationship enabled deep insight during the diligence phase" has no source at all. Keep the relationship, drop the motive and the diligence claim.

The closer is two problems at once. "We recommend approval of the commitment" is first-person, and no source addresses a recommendation. Do not present a recommendation the file does not contain.`,
  "2-linkedin-post.json": `Minor points to address.

The hook and the first person are fine for a LinkedIn post. The live issue is "NorTech today operates across the Nordic region, Germany, France, the UK, and Poland, with international revenue having grown from a fifth of total revenue at entry to more than 40 percent at exit." The source does not give that 40 percent figure. Use the sourced share, or drop the percentage.`,
  "3-press-release.json": `Minor points to address.

The lede does its job. Tighten "The transaction represents the eighth investment from Meridian's European Industrials strategy. Total invested capital from the Meridian platform in the specialty chemicals sector now exceeds EUR 2 billion across the firm's global investments." The eighth investment is sourced; EUR 2 billion is not. Drop that total or put the sourced figure.`,
  "4-internal-inconsistency.json": `Needs work.

The memo disagrees with itself on ARR. One sentence has EUR 84 million as of October 2025; later, "We project ARR growth from EUR 81 million today". Pick one current figure and keep it.

First person on "Our investment thesis rests on three pillars" and "We project" is not house voice for a reporting commentary. Name the firm.`,
};

const FORM_PIECE = `Needs work.

1. Structure & argument flow: the lede is buried.
2. Core-message clarity: the central point is unclear.
3. Conciseness & precision: there is hedging.
4. Register & tone: the register drifts.
5. Opening & closing strength: the opening lacks a hook.
6. Internal coherence: there were no internal contradictions.
7. The June timing is not confirmed.`;

describe("B226 prompt is not a form", () => {
  test("system prompt does not require one numbered point per bundle", () => {
    assert.equal(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes("one per statement bundle"), false);
    assert.equal(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes("one per bundle"), false);
  });

  test("register does not tell the model to say a weak draft needs real work", () => {
    assert.equal(CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER.includes("needs real work"), false);
  });

  test("craft dimensions are not listed as a numbered checklist in the system prompt", () => {
    for (const dimension of CONSTRUCTIVE_FEEDBACK_CRAFT_DIMENSIONS) {
      const name = dimension.split("(")[0].trim();
      assert.equal(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes(name), false, name);
    }
  });

  test("piece prompts contain no en-dash or em-dash", () => {
    assert.equal(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes(EN), false);
    assert.equal(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes(EM), false);
    assert.equal(CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER.includes(EN), false);
    assert.equal(CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER.includes(EM), false);
  });

  test("card payload is not an ordered feedbackBundles array", () => {
    const payload = buildConstructiveFeedbackPieceUserPayload({
      draftText: "We recommend approval of the commitment.",
      signoffVerdict: "Needs work",
      isReady: false,
      feedbackBundles: [
        {
          cardIndex: 0,
          statementText: "We recommend approval of the commitment.",
          editorial: [{ note: "First-person voice on We." }],
          compliance: [],
        },
      ],
    });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "feedbackBundles"), false);
    assert.equal(typeof payload.annotatedDraft, "string");
    assert.equal(payload.annotatedDraft.includes("[editorial]"), true);
  });
});

describe("B226 api is one call", () => {
  test("constructive-feedback route no longer runs a separate craft pass", () => {
    const src = readFileSync(path.join(root, "../api/constructive-feedback.js"), "utf8");
    assert.equal(src.includes("runCraftPass"), false);
    assert.equal(src.includes("assembleCraftAndCardFeedback"), false);
  });
});

describe("B226 seven mechanical checks over the four fixtures", () => {
  test("form piece fails roll-call, invented craft, and F1 when the label is wrong", () => {
    const roll = checkConstructiveFeedbackPiece(FORM_PIECE, {
      readiness: "Needs work",
      notes: [],
      bundleCount: 5,
      forbidInventedCraft: true,
    });
    assert.equal(roll.ok, false);
    assert.equal(roll.failures.includes("dimension roll-call"), true);
    assert.equal(roll.failures.includes("invented craft"), true);

    const wrongLabel = checkConstructiveFeedbackPiece("This draft needs significant work. Fix the dates.", {
      readiness: "Needs work",
      notes: [],
    });
    assert.equal(wrongLabel.failures.includes("F1 exact"), true);
  });

  test("each fixture payload is an annotated draft, and canned pieces pass the seven checks", () => {
    const skeletons = [];
    for (const spec of FIXTURES) {
      const fixture = loadFixture(spec.file);
      const cards = fixture.statements.map((row) => row.qcCard);
      const summary = summariseReview(cards, fixture.reviewOptions);
      assert.equal(summary.readiness, spec.readiness, spec.file);

      const notes = collectMarginNotes(fixture.statements, fixture.reviewOptions, fixture.draftText);
      const payload = buildConstructiveFeedbackPieceUserPayload({
        draftText: fixture.draftText,
        readiness: spec.readiness,
        outputType: spec.outputType,
        statements: fixture.statements,
        reviewOptions: fixture.reviewOptions,
      });
      assert.equal(Object.prototype.hasOwnProperty.call(payload, "feedbackBundles"), false, spec.file);
      assert.equal(typeof payload.annotatedDraft, "string");
      assert.equal(payload.annotatedDraft.includes("card:"), true, spec.file);

      const piece = CANNED_PIECES[spec.file];
      const checked = checkConstructiveFeedbackPiece(piece, {
        readiness: spec.readiness,
        notes,
        requiredFacts: spec.requiredFacts,
        forbidInventedCraft: true,
      });
      assert.equal(checked.ok, true, `${spec.file}: ${checked.failures.join("; ")}`);
      skeletons.push(feedbackSkeleton(piece));
    }
    assert.equal(skeletonsCollide(skeletons), false);
  });

  test("Meridian closer is two notes, not one flattened observation", () => {
    const fixture = loadFixture("1-meridian-reporting.json");
    const notes = collectMarginNotes(fixture.statements, fixture.reviewOptions, fixture.draftText);
    const closer = notes.filter((n) => String(n.statementText).includes("We recommend"));
    assert.equal(closer.length, 2);
    const kinds = closer.map((n) => n.kind).sort();
    assert.deepEqual(kinds, ["editorial", "evidence"]);
  });

  test("live 18 Sep payload has more margin notes than the reconstruction", () => {
    const live = loadFixture("1-meridian-reporting-live-2026-09-18.json");
    const reconstruction = loadFixture("1-meridian-reporting.json");
    const liveNotes = collectMarginNotes(live.statements, live.reviewOptions, live.draftText);
    const reconNotes = collectMarginNotes(
      reconstruction.statements,
      reconstruction.reviewOptions,
      reconstruction.draftText
    );
    assert.equal(reconNotes.length, 3);
    assert.equal(liveNotes.length, 6);
  });

  test("fixture 4 figure clash is a margin note from code", () => {
    const fixture = loadFixture("4-internal-inconsistency.json");
    const clashes = detectInternalFigureClashes(fixture.draftText);
    assert.equal(clashes.length >= 1, true);
    assert.equal(clashes[0].kind, "coherence");
    assert.equal(clashes[0].cardNote.includes("EUR 84 million"), true);
    assert.equal(clashes[0].cardNote.includes("EUR 81 million"), true);
  });

  test("code writes readiness and appends a coverage remainder", () => {
    const assembled = assembleConstructiveFeedbackPiece("Fix the June 2026 date.", {
      readiness: "Needs work",
      notes: [
        {
          kind: "editorial",
          statementText: "We recommend approval of the commitment.",
          cardNote: "First-person voice on We.",
        },
      ],
    });
    assert.equal(assembled.startsWith("Needs work."), true);
    assert.equal(assembled.includes("We recommend"), true);
    assert.equal(assembled.includes("First-person voice on We."), true);
  });
});

const PRODUCTION_B226_PIECE = `Needs work.

The timing of Partners Group's commitment to Meridian Capital Partners V needs verification. The draft states "June 2026," but the source indicates the first close is expected in Q3 2026. Confirm the timing and Partners Group's involvement or adjust the statement.

The draft mentions equity checks of EUR 80-100 million, but the source does not confirm this detail. Verify the equity check size or revise the statement to reflect only the confirmed information about the number of investments.

The phrase "highly regarded" lacks substantiation. Provide evidence or rephrase to maintain objectivity.

The claim that the relationship enabled "deep insight during the diligence phase" is unsupported. Either add a source or remove the statement.

Lastly, the recommendation for approval uses first-person plural, which is inconsistent with the required third-person voice. Remove or rephrase this recommendation to align with the house style.`;

function loadProductionReviewNotes() {
  const payload = JSON.parse(
    readFileSync(
      new URL("../scripts/diagnostic/delivery-check/b226-check-output/production-review.json", import.meta.url),
      "utf8"
    )
  );
  const draftText = payload.statements.map((row) => row.text).join(" ");
  return collectMarginNotes(payload.statements, payload.meta.reviewOptions, draftText);
}

describe("B240 constructive feedback finish", () => {
  test("prompt tells the model to say a fault once at the level it is true", () => {
    assert.equal(
      CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes("Say it once, at the level it is true."),
      true
    );
  });

  test("API path does not assemble a coverage remainder", () => {
    const src = readFileSync(new URL("../api/constructive-feedback.js", import.meta.url), "utf8");
    assert.equal(src.includes("assembleConstructiveFeedbackPiece"), false);
    assert.equal(src.includes("appendCoverageRemainder"), false);
  });

  test("grouping fails on the captured production piece", () => {
    const notes = loadProductionReviewNotes();
    assert.equal(notes.length, 6);
    const grouping = checkGrouping(PRODUCTION_B226_PIECE, notes);
    assert.equal(grouping.ok, false);
    assert.equal(grouping.paragraphCount, 6);
    assert.equal(grouping.findingCount, 6);
  });

  test("craft referee drops a LinkedIn credits paragraph that quotes no draft", () => {
    const fixture = loadFixture("2-linkedin-post.json");
    const notes = collectMarginNotes(fixture.statements, fixture.reviewOptions, fixture.draftText);
    const dirty = `Minor points to address.

The live issue is "NorTech today operates across the Nordic region, Germany, France, the UK, and Poland, with international revenue having grown from a fifth of total revenue at entry to more than 40 percent at exit." The source does not give that 40 percent figure.

The narrative around the team's contributions is compelling, but consider tightening the section on individual credits to maintain focus and flow.`;
    const stripped = stripUnquotedCraft(dirty, { draftText: fixture.draftText, notes });
    assert.equal(stripped.includes("individual credits"), false);
    assert.equal(stripped.includes("40 percent"), true);
  });

  test("craft referee drops a press-release quote request that quotes no draft", () => {
    const fixture = loadFixture("3-press-release.json");
    const notes = collectMarginNotes(fixture.statements, fixture.reviewOptions, fixture.draftText);
    const dirty = `Needs work.

The live issue is "Total invested capital from the Meridian platform in the specialty chemicals sector now exceeds EUR 2 billion across the firm's global investments." That total is not sourced.

Consider adding a quote from Dr Annika Brandt to give the announcement a human voice.`;
    const stripped = stripUnquotedCraft(dirty, { draftText: fixture.draftText, notes });
    assert.equal(stripped.includes("Dr Annika Brandt"), false);
    assert.equal(stripped.includes("EUR 2 billion"), true);
  });
});
