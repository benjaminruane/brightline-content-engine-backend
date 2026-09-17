import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  extractRunFromResponse,
  scoreFixtureRuns,
} from "../scripts/diagnostic/noise-floor/score-category-noise-floor.mjs";
import { extractLogCounts } from "../scripts/diagnostic/noise-floor/extract-server-log-counts.mjs";

const COMPLIANCE_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function card({
  text,
  displayVerdict,
  editorialVerdict = "clean",
  complianceVerdict = "clean",
  summaryClass,
}) {
  return {
    text,
    qcCard: {
      statement: text,
      displayVerdict,
      editorialVerdict,
      complianceVerdict,
      summaryClass,
    },
  };
}

function responseFromCards(cards, extraMeta = {}) {
  return {
    ok: true,
    statements: cards.map((row, index) => ({
      id: String(index),
      text: row.text,
      qcCard: row.qcCard,
    })),
    meta: {
      reviewOptions: COMPLIANCE_ON,
      reviewSummary: extraMeta.reviewSummary ?? null,
      modelConfig: extraMeta.modelConfig ?? {
        ranAt: "2026-09-17T00:00:00.000Z",
        stage2Fingerprints: ["fp-a"],
        stageModels: { "stage2-matching": { provider: "openai", model: "gpt-4o" } },
      },
      traceId: extraMeta.traceId ?? "trace-test",
    },
  };
}

describe("category noise-floor scorer", () => {
  test("a card flipping conflict to partial is named, and Conflicting/Partial ranges are 1", () => {
    const conflictCard = card({
      text: "ARR is EUR 38 million.",
      displayVerdict: "conflict",
    });
    const partialCard = card({
      text: "ARR is EUR 38 million.",
      displayVerdict: "supported_partial",
    });
    const stable = card({
      text: "The fund is a 2019 vintage.",
      displayVerdict: "supported_full",
    });
    const run1 = extractRunFromResponse(responseFromCards([conflictCard, stable]), {
      wallTimeMs: 1000,
      costUsd: 0.1,
      costSource: "test",
      log: extractLogCounts(""),
    });
    const run2 = extractRunFromResponse(responseFromCards([partialCard, stable]), {
      wallTimeMs: 1100,
      costUsd: 0.11,
      costSource: "test",
      log: extractLogCounts(""),
    });
    const scored = scoreFixtureRuns([run1, run2]);
    assert.equal(scored.splitChanged, false);
    const conflicting = scored.categories.find((row) => row.key === "conflicting");
    const partial = scored.categories.find((row) => row.key === "partial");
    assert.equal(conflicting.min, 0);
    assert.equal(conflicting.max, 1);
    assert.equal(conflicting.range, 1);
    assert.equal(partial.min, 0);
    assert.equal(partial.max, 1);
    assert.equal(partial.range, 1);
    const flip = scored.flips.find((row) => row.text === "ARR is EUR 38 million.");
    assert.ok(flip);
    assert.equal(flip.field, "displayVerdict");
    assert.equal(flip.from, "conflict");
    assert.equal(flip.to, "supported_partial");
  });

  test("an editorial not_reviewed card counts as Not checked, not Editorial", () => {
    const row = card({
      text: "We remain constructive on the remaining portfolio.",
      displayVerdict: "supported_full",
      editorialVerdict: "not_reviewed",
    });
    const run = extractRunFromResponse(responseFromCards([row]), {
      wallTimeMs: 900,
      costUsd: 0.05,
      costSource: "test",
      log: extractLogCounts(""),
    });
    assert.equal(run.counts.editorial, 0);
    assert.equal(run.counts.notChecked, 1);
    assert.equal(run.counts.all, 1);
    assert.equal(run.cards[0].editorialVerdict, "not_reviewed");
  });

  test("a compliance null with compliance on is counted separately and is not a Compliance finding", () => {
    const row = card({
      text: "The Company will be led by its existing Chief Executive.",
      displayVerdict: "supported_full",
      complianceVerdict: null,
    });
    const run = extractRunFromResponse(responseFromCards([row]), {
      wallTimeMs: 800,
      costUsd: 0.04,
      costSource: "test",
      log: extractLogCounts(""),
    });
    assert.equal(run.counts.compliance, 0);
    assert.equal(run.counts.complianceNullOn, 1);
    assert.equal(run.counts.notChecked, 1);
    assert.equal(run.cards[0].complianceVerdict, null);
  });

  test("a run whose statement split differs is reported before category ranges", () => {
    const a = card({ text: "Sentence one stands.", displayVerdict: "supported_full" });
    const b = card({ text: "Sentence two stands.", displayVerdict: "supported_full" });
    const merged = card({
      text: "Sentence one stands. Sentence two stands.",
      displayVerdict: "supported_full",
    });
    const run1 = extractRunFromResponse(responseFromCards([a, b]), {
      wallTimeMs: 700,
      costUsd: 0.03,
      costSource: "test",
      log: extractLogCounts(""),
    });
    const run2 = extractRunFromResponse(responseFromCards([merged]), {
      wallTimeMs: 750,
      costUsd: 0.03,
      costSource: "test",
      log: extractLogCounts(""),
    });
    const scored = scoreFixtureRuns([run1, run2]);
    assert.equal(scored.splitChanged, true);
    assert.deepEqual(scored.split.map((row) => row.statementCount), [2, 1]);
    assert.equal(scored.flips.length, 0);
  });

  test("identical runs give range 0 on every category", () => {
    const cards = [
      card({
        text: "Net IRR since inception stood at 11.2 percent.",
        displayVerdict: "conflict",
        editorialVerdict: "soft_concern",
      }),
      card({
        text: "The fund is a 2019 vintage.",
        displayVerdict: "supported_full",
      }),
    ];
    const extras = {
      wallTimeMs: 1200,
      costUsd: 0.2,
      costSource: "test",
      log: extractLogCounts(""),
    };
    const run1 = extractRunFromResponse(responseFromCards(cards), extras);
    const run2 = extractRunFromResponse(responseFromCards(cards), extras);
    const scored = scoreFixtureRuns([run1, run2]);
    assert.equal(scored.splitChanged, false);
    assert.equal(scored.flips.length, 0);
    for (const row of scored.categories) {
      if (row.key === "readiness") {
        assert.equal(row.range, 0);
        assert.equal(row.min, row.max);
        continue;
      }
      assert.equal(row.range, 0, row.key);
      assert.equal(row.min, row.max, row.key);
    }
  });
});

describe("server log count extraction", () => {
  test("parses cache hits, editorial schema failures, and compliance parse failures", () => {
    const text = [
      "[QC_LLM_CACHE] pipeline hits=4 misses=12 hitRate=25.0% tokensAvoided=1000 costAvoided=$0.0100 | stage1 1/1 (100.0%) stage1b 0/1 (0.0%) stage2 3/14 (21.4%)",
      '[EDITORIAL_STYLE_REVIEW] schema validation failed after retry; applying clean fallback {"statementIndex":2}',
      "[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed",
      "[EDITORIAL_COMPLIANCE_ERROR] compliance parse failed",
    ].join("\n");
    const counts = extractLogCounts(text);
    assert.equal(counts.cacheHits, 4);
    assert.equal(counts.cacheMisses, 12);
    assert.equal(counts.stage1Hits, 1);
    assert.equal(counts.stage1bHits, 0);
    assert.equal(counts.stage2Hits, 3);
    assert.equal(counts.summaryLogged, true);
    assert.equal(counts.editorialSchemaFailures, 1);
    assert.equal(counts.complianceParseFailures, 2);
  });

  test("a cache-off slice with no cache line records zero hits", () => {
    const counts = extractLogCounts("[handler] route selected: v4\n");
    assert.equal(counts.cacheHits, 0);
    assert.equal(counts.cacheMisses, 0);
    assert.equal(counts.summaryLogged, false);
    assert.equal(counts.editorialSchemaFailures, 0);
    assert.equal(counts.complianceParseFailures, 0);
  });
});
