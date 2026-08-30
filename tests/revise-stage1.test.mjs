import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  DEFAULT_CONCURRENCY,
  REJECT_INVENTED_FACT,
  REJECT_NOOP_EDIT,
  REJECT_NO_JSON,
  REJECT_OUTSIDE_SPAN,
  locateSpan,
  runStage1,
  usableReason,
  validateStage1Response,
  stage1SendDecision,
  OUTCOME_AUTHOR_EXEMPT,
  directivesOn,
  OUTCOME_SILENCE_NOT_SENT,
} from "../lib/revise-stage1.mjs";
import {
  buildStage1Prompt,
  buildStage1SharedPrefix,
  livePromptBlocks,
} from "../lib/revise-stage1-prompt.mjs";
import { finalizeSuggestRevisionText } from "../lib/build-revision-prompt.mjs";

const EQUITY =
  "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 80-100 million apiece.";

const spanConcern = (overrides = {}) => ({
  statementIndex: 1,
  statementText: EQUITY,
  evidence: {
    kind: "partial",
    reason: "The source confirms the number of investments but not the cheque size.",
    unsupportedSpans: [{ text: "with equity checks of EUR 80-100 million apiece" }],
    excerpt: "Meridian IV will make 10-14 platform investments.",
  },
  editorial: [],
  compliance: [],
  ...overrides,
});

const noSpanConcern = () => ({
  statementIndex: 5,
  statementText: "This relationship enabled deep insight during the diligence phase.",
  evidence: { kind: "unsupported", verdict: "no_support", reason: "No source addresses this.", unsupportedSpans: [] },
  editorial: [],
  compliance: [],
});

/**
 * The same statement, but with a source that SPOKE. Stage 1 only sends a
 * statement where a source stated a competing value or an editor gave an
 * instruction, so the assembly tests need a sendable fixture; the bare
 * spanConcern is a silence case and is deliberately never sent.
 */
const sendableSpanConcern = (overrides = {}) =>
  spanConcern({
    evidence: {
      ...spanConcern().evidence,
      sourcePassage: "Meridian IV writes equity cheques of EUR 40-60 million.",
      sourceLabel: "Meridian IV PPM",
    },
    ...overrides,
  });

/** The diligence sentence as it really appears: silent, but under a directive. */
const directiveConcern = () => ({
  statementIndex: 5,
  statementText: "This relationship enabled deep insight during the diligence phase.",
  evidence: { kind: "unsupported", verdict: "no_support", reason: "No source addresses this.", unsupportedSpans: [] },
  editorial: [
    {
      rule: "overreach_unsupported_causal",
      suggestedDirection: "Replace 'enabled deep insight during the diligence phase' with a more measured description.",
    },
  ],
  compliance: [],
});

const reply = (o) => JSON.stringify(o);

describe("stage 1 prompt", () => {
  test("kind-independent content leads, so the prefix can cache", () => {
    const prompt = buildStage1Prompt(spanConcern(), "partial", {});
    const prefix = buildStage1SharedPrefix();
    assert.ok(prompt.startsWith(prefix), "the shared prefix must be a leading substring");

    // The kind rule and the statement must both come after it.
    assert.ok(prompt.indexOf("KIND HANDLING") > prefix.length - 1);
    assert.ok(prompt.indexOf("STATEMENT TO REVISE:") > prompt.indexOf("KIND HANDLING"));
  });

  test("the shared prefix is identical across kinds", () => {
    const a = buildStage1Prompt(spanConcern(), "partial", {});
    const b = buildStage1Prompt(noSpanConcern(), "unsupported", {});
    const prefix = buildStage1SharedPrefix();
    assert.ok(a.startsWith(prefix) && b.startsWith(prefix));
  });

  test("carries the house style guide and only one kind rule", () => {
    const prompt = buildStage1Prompt(spanConcern(), "partial", {});
    assert.doesNotMatch(prompt, /hyperbole_vs_qualitative/);
    assert.match(prompt, /first_person_plural/);
    assert.match(prompt, /c\) kind "partial"/);
    assert.doesNotMatch(prompt, /a\) kind "conflict"/);
    assert.doesNotMatch(prompt, /i\) kind "compliance_strip"/);
  });

  test("excludes the MARKERS section and whole-draft framing", () => {
    const prompt = buildStage1Prompt(spanConcern(), "partial", {});
    assert.doesNotMatch(prompt, /MARKERS \(reviewer-confirm spans\)/);
    assert.doesNotMatch(prompt, /Rewrite the ENTIRE draft/);
  });

  test("every kind in the live prompt is extractable", () => {
    const { kindRules } = livePromptBlocks();
    for (const kind of [
      "conflict",
      "unsupported",
      "partial",
      "deletion",
      "soften",
      "craft",
      "compliance_add",
      "compliance_claim",
      "compliance_strip",
    ]) {
      assert.ok(kindRules.has(kind), `missing kind rule: ${kind}`);
    }
  });
});

describe("the validator", () => {
  test("rejects an edit identical to the original", () => {
    const v = validateStage1Response(
      reply({ action: "edit", revised_statement: EQUITY, what: "x", why: "y" }),
      spanConcern()
    );
    assert.equal(v.accepted, false);
    assert.equal(v.reason, REJECT_NOOP_EDIT);
  });

  test("rejects a change outside the unsupported span", () => {
    // "control-oriented" is inside the span here, so change the protected head.
    const c = spanConcern({
      evidence: {
        ...spanConcern().evidence,
        unsupportedSpans: [{ text: "EUR 80-100 million" }],
      },
    });
    const v = validateStage1Response(
      reply({
        action: "edit",
        revised_statement:
          "The fund intends to build a portfolio of 12 investments, with equity checks of an undisclosed size apiece.",
        what: "x",
        why: "y",
      }),
      c
    );
    assert.equal(v.accepted, false);
    assert.equal(v.reason, REJECT_OUTSIDE_SPAN);
  });

  test("accepts a change confined to the unsupported span", () => {
    const v = validateStage1Response(
      reply({
        action: "edit",
        revised_statement: "The fund intends to build a portfolio of 10-14 control-oriented investments.",
        what: "Removed the cheque size",
        why: "the sources do not state a ticket range",
      }),
      spanConcern()
    );
    assert.equal(v.accepted, true, v.detail);
    assert.equal(v.action, "edit");
  });

  test("rejects an invented figure absent from statement and source", () => {
    const v = validateStage1Response(
      reply({
        action: "edit",
        revised_statement:
          "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 250 million apiece.",
        what: "x",
        why: "y",
      }),
      spanConcern(),
      { sourceText: "Meridian IV will make 10-14 platform investments." }
    );
    assert.equal(v.accepted, false);
    assert.equal(v.reason, REJECT_INVENTED_FACT);
    assert.match(v.detail, /250/);
  });

  test("allows a figure that appears in the supplied source", () => {
    const v = validateStage1Response(
      reply({
        action: "edit",
        revised_statement:
          "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks of EUR 45 million apiece.",
        what: "x",
        why: "y",
      }),
      spanConcern(),
      { sourceText: "Meridian IV writes equity checks of EUR 45 million." }
    );
    assert.equal(v.accepted, true, v.detail);
  });

  test("rejects unparseable JSON and missing fields", () => {
    assert.equal(validateStage1Response("not json", spanConcern()).reason, REJECT_NO_JSON);
    assert.equal(
      validateStage1Response(reply({ action: "edit", revised_statement: "x" }), spanConcern()).reason,
      REJECT_NO_JSON
    );
    assert.equal(
      validateStage1Response(reply({ action: "maybe", what: "a", why: "b" }), spanConcern()).reason,
      REJECT_NO_JSON
    );
  });

  test("accepts no_change without a revised statement", () => {
    const v = validateStage1Response(
      reply({ action: "no_change", revised_statement: null, what: "nothing", why: "the source backs it" }),
      spanConcern()
    );
    assert.equal(v.accepted, true);
    assert.equal(v.action, "no_change");
  });

  test("tolerates a fenced JSON reply", () => {
    const v = validateStage1Response(
      "```json\n" + reply({ action: "no_change", revised_statement: null, what: "a", why: "b" }) + "\n```",
      spanConcern()
    );
    assert.equal(v.accepted, true);
  });
});

describe("the no-span fallback", () => {
  test("a statement with no span may be rewritten wholesale", () => {
    const v = validateStage1Response(
      reply({
        action: "edit",
        revised_statement: "The relationship supported the diligence phase.",
        what: "Softened the insight claim",
        why: "no supplied source backs this claim",
      }),
      noSpanConcern()
    );
    assert.equal(v.accepted, true, v.detail);
  });

  test("locateSpan returns null when the span text is absent", () => {
    assert.equal(locateSpan("A short statement.", "not in here"), null);
    assert.deepEqual(locateSpan("A short statement.", "short"), { start: 2, end: 7 });
  });
});

describe("assembly", () => {
  const draft = `Halden Group committed to Meridian Capital Partners IV.\n\n${EQUITY}\n\nThis relationship enabled deep insight during the diligence phase.`;

  test("statements with no concerns are never sent and never touched", async () => {
    const sent = [];
    const out = await runStage1(draft, [sendableSpanConcern()], {
      callModel: async (prompt) => {
        sent.push(prompt);
        return {
          text: reply({
            action: "edit",
            revised_statement: "The fund intends to build a portfolio of 10-14 control-oriented investments.",
            what: "Removed the cheque size",
            why: "the sources do not state a ticket range",
          }),
        };
      },
    });
    assert.equal(sent.length, 1, "only the flagged statement is sent");
    assert.match(out.revisedDraft, /Halden Group committed to Meridian Capital Partners IV\./);
    assert.match(out.revisedDraft, /This relationship enabled deep insight during the diligence phase\./);
    assert.equal(out.edits.length, 1);
  });

  test("a rejected edit keeps the original statement and records the reason", async () => {
    const out = await runStage1(draft, [sendableSpanConcern()], {
      callModel: async () => ({ text: "definitely not json" }),
    });
    assert.equal(out.edits.length, 0);
    assert.ok(out.revisedDraft.includes(EQUITY), "the original statement survives");
    assert.equal(out.events[0].outcome, "rejected");
    assert.equal(out.events[0].reason, REJECT_NO_JSON);
  });

  test("code marks every change, so the unreported-change detector finds none", async () => {
    const out = await runStage1(draft, [sendableSpanConcern(), directiveConcern()], {
      callModel: async (_p, meta) =>
        meta.kind === "partial"
          ? {
              text: reply({
                action: "edit",
                revised_statement:
                  "The fund intends to build a portfolio of 10-14 control-oriented investments.",
                what: "Removed the cheque size",
                why: "the sources do not state a ticket range",
              }),
            }
          : {
              text: reply({
                action: "edit",
                revised_statement: "The relationship supported the diligence phase.",
                what: "Softened the insight claim",
                why: "no supplied source backs this claim",
              }),
            },
    });

    const finalized = finalizeSuggestRevisionText(out.revisedDraft, {
      originalDraft: draft,
      concerns: [sendableSpanConcern(), directiveConcern()],
      log: () => {},
    });

    assert.equal(
      finalized.unreportedEvents.length,
      0,
      `stage 1 left ${finalized.unreportedEvents.length} change(s) unmarked: ${JSON.stringify(
        finalized.unreportedEvents.map((e) => e.regionText)
      )}`
    );
    assert.equal(finalized.markers.length, 2);
    for (const m of finalized.markers) {
      assert.match(m.note, /Confirm before publishing\.$/);
      assert.equal(m.generated, undefined, "code-declared markers are not generated markers");
    }
  });

  test("runs in parallel up to the limit", async () => {
    let live = 0;
    let peak = 0;
    const concerns = Array.from({ length: 9 }, (_, i) => ({
      statementIndex: i,
      statementText: `Sentence number ${i} sits in the draft.`,
      evidence: { kind: "conflict", verdict: "conflicting", reason: "r", unsupportedSpans: [] },
      editorial: [],
      compliance: [],
    }));
    await runStage1("x", concerns, {
      concurrency: 3,
      callModel: async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live -= 1;
        return { text: reply({ action: "no_change", revised_statement: null, what: "a", why: "b" }) };
      },
    });
    assert.equal(peak, 3);
  });

  test("the default concurrency is a sane, small number", () => {
    assert.ok(DEFAULT_CONCURRENCY >= 2 && DEFAULT_CONCURRENCY <= 8);
  });
});

describe("usableReason", () => {
  test("takes a plain reason and rejects marker syntax or waffle", () => {
    assert.equal(usableReason("the sources do not state a ticket range."), "the sources do not state a ticket range");
    assert.equal(usableReason("Confirm before publishing."), "");
    assert.equal(usableReason("{{x||CHANGED: y}}"), "");
    assert.equal(usableReason("a".repeat(200)), "");
    assert.equal(usableReason(""), "");
  });
});

describe("stage 1 under the principle", () => {
  const draft = `${EQUITY} This relationship enabled deep insight during the diligence phase.`;
  const never = async () => {
    throw new Error("the model must not be called for a silence-only statement");
  };

  describe("the gate", () => {
    test("does not send a statement whose findings all rest on silence", () => {
      const d = stage1SendDecision(spanConcern());
      assert.equal(d.send, false);
      assert.match(d.reason, /silen|speaks/i);
    });

    test("sends a conflict", () => {
      const d = stage1SendDecision(spanConcern({ evidence: { kind: "conflict", verdict: "conflicting" } }));
      assert.equal(d.send, true);
    });

    test("sends a partial where the source states a value for the element", () => {
      assert.equal(stage1SendDecision(sendableSpanConcern()).send, true);
    });

    test("sends a statement carrying an editorial directive", () => {
      const d = stage1SendDecision(directiveConcern());
      assert.equal(d.send, true);
      assert.match(d.reason, /overreach_unsupported_causal/);
    });

    test("does not send an editorial concern with no suggestedDirection", () => {
      const bare = { ...directiveConcern(), editorial: [{ rule: "overreach_unsupported_causal" }] };
      assert.equal(stage1SendDecision(bare).send, false);
      assert.deepEqual(directivesOn(bare), []);
    });
  });

  // Measured on the Meridian fixture: the model named the author where the
  // original said "this relationship", and the fidelity check called its own
  // client an invented fact, killing a correct directive edit on every run.
  test("does not call the authoring organisation's own name an invented fact", async () => {
    const out = await runStage1(directiveConcern().statementText, [directiveConcern()], {
      authoringOrganisation: "Partners Group",
      sourceText: "",
      callModel: async () => ({
        text: reply({
          action: "edit",
          revised_statement: "This relationship supported Partners Group's work during the diligence phase.",
          what: "Replaced the causal claim",
          why: "the sources do not support a causal claim",
        }),
      }),
    });
    assert.deepEqual(
      out.events.filter((e) => e.outcome === "rejected"),
      [],
      "the author's own name must not be treated as an invention"
    );
    assert.match(out.revisedDraft, /supported Partners Group's work/);
  });

  test("still rejects a genuinely invented third party", async () => {
    const out = await runStage1(directiveConcern().statementText, [directiveConcern()], {
      authoringOrganisation: "Partners Group",
      sourceText: "",
      callModel: async () => ({
        text: reply({
          action: "edit",
          revised_statement: "This relationship supported Blackstone's work during the diligence phase.",
          what: "x",
          why: "the sources do not support a causal claim",
        }),
      }),
    });
    const rejected = out.events.filter((e) => e.outcome === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason, REJECT_INVENTED_FACT);
  });

  // Measured on R10: the exemption ran first and swallowed marketing_language_excess
  // and voice_consistency on the author's own sentences, so three directives the
  // whole-draft path followed were never even sent to the model.
  test("an editorial directive outranks the author exemption", async () => {
    const authorSentence =
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.";
    const concern = {
      statementIndex: 1,
      statementText: authorSentence,
      evidence: { kind: "unsupported", verdict: "no_support", unsupportedSpans: [] },
      editorial: [
        { rule: "marketing_language_excess", suggestedDirection: "Delete 'genuinely exceptional'." },
      ],
      compliance: [],
    };
    let asked = false;
    const out = await runStage1(authorSentence, [concern], {
      authoringOrganisation: "Halden Group",
      callModel: async () => {
        asked = true;
        return {
          text: reply({
            action: "edit",
            revised_statement:
              "We were attracted to Meridian on the strength of a track record that is, in our view, strong.",
            what: "Removed the promotional phrase",
            why: "the review asked for the promotional phrase to go",
          }),
        };
      },
    });
    assert.equal(asked, true, "the statement must be sent");
    assert.equal(out.events.filter((e) => e.outcome === OUTCOME_AUTHOR_EXEMPT).length, 0);
    assert.doesNotMatch(out.revisedDraft, /genuinely exceptional/);
  });

  test("the author exemption still holds where there is no directive", async () => {
    const authorSentence = "We were attracted to Meridian on the strength of its record.";
    const out = await runStage1(authorSentence, [
      {
        statementIndex: 1,
        statementText: authorSentence,
        evidence: { kind: "unsupported", verdict: "no_support", unsupportedSpans: [] },
        editorial: [],
        compliance: [],
      },
    ], {
      authoringOrganisation: "Halden Group",
      callModel: never,
    });
    assert.equal(out.events.filter((e) => e.outcome === OUTCOME_AUTHOR_EXEMPT).length, 1);
  });

  test("records silence_flagged_not_sent, distinct from a refusal and an exemption", async () => {
    const out = await runStage1(draft, [spanConcern()], { callModel: never });
    const ev = out.events.filter((e) => e.outcome === OUTCOME_SILENCE_NOT_SENT);
    assert.equal(ev.length, 1);
    assert.equal(out.events.filter((e) => e.outcome === "rejected").length, 0);
    assert.ok(ev[0].register === "LOUD" || ev[0].register === "QUIET");
  });

  test("leaves the prose of a not-sent statement exactly as written, and flags it", async () => {
    const out = await runStage1(draft, [spanConcern()], { callModel: never });
    const stripped = out.revisedDraft.replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
    assert.equal(stripped, draft);
    assert.match(out.revisedDraft, /\{\{/, "the statement is wrapped in a register marker");
    assert.match(out.revisedDraft, /No supplied source/);
  });

  // The case most likely to leak: sent on the directive, but the evidence
  // finding underneath it rests on silence. The span constraint has to hold.
  test("a mixed statement is sent, and the edit stays inside the span the source spoke to", async () => {
    const mixed = spanConcern({
      editorial: [
        {
          rule: "marketing_language_excess",
          suggestedDirection: "Delete 'control-oriented'.",
        },
      ],
    });
    assert.equal(stage1SendDecision(mixed).send, true);

    // The model tries to take the silent equity cheque out at the same time.
    const out = await runStage1(EQUITY, [mixed], {
      callModel: async () => ({
        text: reply({
          action: "edit",
          revised_statement: "The fund intends to build a portfolio of 10-14 investments.",
          what: "Removed the cheque size",
          why: "the sources do not state a ticket range",
        }),
      }),
    });
    const rejected = out.events.filter((e) => e.outcome === "rejected");
    assert.equal(rejected.length, 1, "the overreaching edit must be rejected, not applied");
    assert.equal(rejected[0].reason, REJECT_OUTSIDE_SPAN);
    assert.ok(
      out.revisedDraft.includes("equity checks of EUR 80-100 million apiece"),
      "the silent element survives untouched"
    );
  });
});
