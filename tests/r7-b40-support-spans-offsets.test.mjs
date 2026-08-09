import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  locatePassageInSource,
  repairNormaliseWithMap,
  buildSupportSpans,
} from "../lib/qc/pipeline-v4/stage2-match-multipassage.mjs";

describe("repairNormaliseWithMap", () => {
  test("collapses whitespace and maps back to original indices", () => {
    const { normalised, map } = repairNormaliseWithMap("a  b");
    assert.equal(normalised, "a b");
    assert.deepEqual(map, [0, 1, 3]);
  });

  test("maps curly quotes and dashes 1:1", () => {
    const { normalised, map } = repairNormaliseWithMap("\u201Cok\u201D \u2013 yes");
    assert.equal(normalised, '"ok" - yes');
    assert.equal(map.length, normalised.length);
    assert.equal(map[0], 0);
  });
});

describe("locatePassageInSource", () => {
  test("exact indexOf sets start/end; slice matches passage", () => {
    const source = "Alpha Beta Gamma";
    const passage = "Beta";
    const { start, end } = locatePassageInSource(source, passage);
    assert.equal(start, 6);
    assert.equal(end, 10);
    assert.equal(source.slice(start, end), passage);
  });

  test("takes the first of multiple exact matches", () => {
    const source = "xx needle yy needle zz";
    const { start, end } = locatePassageInSource(source, "needle");
    assert.equal(start, 3);
    assert.equal(end, 9);
  });

  test("repair-normalised locate for curly quotes and whitespace", () => {
    const source = "Revenue  grew\u2014\u201C12%\u201D year on year.";
    const passage = 'Revenue grew-"12%" year on year.';
    const { start, end } = locatePassageInSource(source, passage);
    assert.notEqual(start, null);
    assert.notEqual(end, null);
    const sliced = source.slice(start, end);
    const { normalised: normSlice } = repairNormaliseWithMap(sliced);
    const { normalised: normPassage } = repairNormaliseWithMap(passage);
    assert.equal(normSlice, normPassage);
  });

  test("repair-normalised locate for newline-vs-space", () => {
    const source = "located in\nOttawa, Canada.";
    const passage = "located in Ottawa, Canada.";
    const { start, end } = locatePassageInSource(source, passage);
    assert.equal(start, 0);
    assert.equal(end, source.length);
    const sliced = source.slice(start, end);
    assert.equal(sliced, source);
    const { normalised: normSlice } = repairNormaliseWithMap(sliced);
    const { normalised: normPassage } = repairNormaliseWithMap(passage);
    assert.equal(normSlice, normPassage);
  });

  test("repair-normalised locate for en-dash vs hyphen", () => {
    const source = "payback in 7\u20139 months";
    const passage = "payback in 7-9 months";
    const { start, end } = locatePassageInSource(source, passage);
    assert.equal(start, 0);
    assert.equal(end, source.length);
    const sliced = source.slice(start, end);
    const { normalised: normSlice } = repairNormaliseWithMap(sliced);
    const { normalised: normPassage } = repairNormaliseWithMap(passage);
    assert.equal(normSlice, normPassage);
    assert.equal(normSlice, "payback in 7-9 months");
  });

  test("not found leaves null/null", () => {
    const { start, end } = locatePassageInSource("hello world", "absent passage");
    assert.equal(start, null);
    assert.equal(end, null);
  });

  test("empty passage leaves null/null", () => {
    const { start, end } = locatePassageInSource("hello", "");
    assert.equal(start, null);
    assert.equal(end, null);
  });

  test("deterministic: same input → same offsets", () => {
    const source = "foo   bar\u2019s baz";
    const passage = "bar's baz";
    const a = locatePassageInSource(source, passage);
    const b = locatePassageInSource(source, passage);
    assert.deepEqual(a, b);
  });
});

describe("buildSupportSpans offsets (R7.B40)", () => {
  const sources = [
    { text: "The fund returned 12% net IRR last year." },
    { text: "Unrelated memo." },
  ];

  test("resolves offsets against sources[sourceIndex].text", () => {
    const spans = buildSupportSpans(
      [
        {
          sourceIndex: 0,
          classification: "confirmed",
          passage: "returned 12% net IRR",
        },
      ],
      { statementIndex: 3, sources }
    );
    assert.equal(spans.length, 1);
    assert.equal(spans[0].start, 9);
    assert.equal(spans[0].end, 29);
    assert.equal(sources[0].text.slice(spans[0].start, spans[0].end), "returned 12% net IRR");
    assert.equal(spans[0].statementId, "3");
  });

  test("resolves offsets when passage uses space for source newline", () => {
    const sourcesNl = [{ text: "team is\nlocated in Ottawa." }];
    const passage = "team is located in Ottawa.";
    const spans = buildSupportSpans(
      [{ sourceIndex: 0, classification: "confirmed", passage }],
      { statementIndex: 0, sources: sourcesNl }
    );
    assert.equal(spans.length, 1);
    assert.equal(spans[0].start, 0);
    assert.equal(spans[0].end, sourcesNl[0].text.length);
    const sliced = sourcesNl[0].text.slice(spans[0].start, spans[0].end);
    const { normalised: normSlice } = repairNormaliseWithMap(sliced);
    const { normalised: normPassage } = repairNormaliseWithMap(passage);
    assert.equal(normSlice, normPassage);
  });

  test("keeps span with null offsets when passage cannot be located", () => {
    const spans = buildSupportSpans(
      [
        {
          sourceIndex: 0,
          classification: "partially_confirmed",
          passage: "this text is not in the source at all",
        },
      ],
      { statementIndex: 0, sources }
    );
    assert.equal(spans.length, 1);
    assert.equal(spans[0].start, null);
    assert.equal(spans[0].end, null);
    assert.equal(spans[0].passage, "this text is not in the source at all");
  });

  test("accepts getSourceText resolver", () => {
    const spans = buildSupportSpans(
      [{ sourceIndex: 1, classification: "conflicting", passage: "Unrelated" }],
      {
        statementIndex: 0,
        getSourceText: (i) => sources[i]?.text ?? "",
      }
    );
    assert.equal(spans.length, 1);
    assert.equal(spans[0].start, 0);
    assert.equal(spans[0].end, 9);
  });

  test("still gates no_support and empty passages", () => {
    const spans = buildSupportSpans(
      [
        { sourceIndex: 0, classification: "no_support", passage: "returned 12% net IRR" },
        { sourceIndex: 0, classification: "confirmed", passage: "   " },
      ],
      { statementIndex: 0, sources }
    );
    assert.equal(spans.length, 0);
  });
});
