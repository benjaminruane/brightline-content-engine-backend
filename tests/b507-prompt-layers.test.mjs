import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterAll, test, vi } from "vitest";
import generate from "../api/generate.js";
import rewrite from "../api/rewrite.js";
import { EVENT_TYPE } from "../lib/event-type.js";
import * as observability from "../lib/observability.js";
import {
  CONTEXT_SOURCE_LINE,
  LAYER_ORDER,
  composeLayers,
} from "../lib/prompt-library/compose.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";

const savedOrg = process.env.AUTHORING_ORGANISATION;
delete process.env.AUTHORING_ORGANISATION;

afterAll(() => {
  if (savedOrg === undefined) delete process.env.AUTHORING_ORGANISATION;
  else process.env.AUTHORING_ORGANISATION = savedOrg;
});

const baseline = JSON.parse(
  readFileSync(new URL("../scripts/diagnostic/b507/baseline.json", import.meta.url), "utf8")
);
const fixed = baseline.fixed;

function windowAt(expected, actual) {
  const a = String(expected ?? "");
  const b = String(actual ?? "");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return `at ${i} expected ${a.length} actual ${b.length}\nEXPECTED ${JSON.stringify(a.slice(Math.max(0, i - 70), i + 70))}\nACTUAL   ${JSON.stringify(b.slice(Math.max(0, i - 70), i + 70))}`;
}

function assertSame(label, expected, actual) {
  if (expected !== actual) {
    throw new Error(`${label}\n${windowAt(expected, actual)}`);
  }
}

function resStub() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function capture(handler, body) {
  const llm = vi.spyOn(observability, "callLLM").mockResolvedValue({
    text: JSON.stringify({ draftText: fixed.draft }),
  });
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  const res = resStub();
  const log = console.log;
  console.log = () => {};
  let messages = [];
  try {
    await handler({ method: "POST", headers: {}, body }, res);
    messages = llm.mock.calls[0]?.[0]?.messages ?? [];
  } finally {
    console.log = log;
    vi.restoreAllMocks();
  }
  return {
    system: messages.find((m) => m.role === "system")?.content ?? "",
    user: messages.find((m) => m.role === "user")?.content ?? "",
  };
}

function bodies(row, source) {
  const eventType = row.textType === "none" ? "" : row.textType;
  return {
    base: {
      outputType: row.outputType,
      visibility: row.visibility,
      eventType,
      transactionDate: fixed.transactionDate,
      investment: fixed.investment,
      specialInstructions: row.specialInstructions,
      sources: [source],
      authoringOrganisation: fixed.authoringOrganisation,
    },
    generate: {
      title: fixed.title,
      notes: row.specialInstructions,
      eventType,
      outputType: row.outputType,
      visibility: row.visibility,
      transactionDate: fixed.transactionDate,
      investment: fixed.investment,
      specialInstructions: row.specialInstructions,
      maxWords: fixed.maxWords,
      publicSearch: false,
      sources: [source],
      bannedWords: [],
    },
    rewrite: {
      text: fixed.draft,
      instructions: row.specialInstructions,
      eventType,
      outputType: row.outputType,
      visibility: row.visibility,
      transactionDate: fixed.transactionDate,
      investment: fixed.investment,
      specialInstructions: row.specialInstructions,
      maxWords: fixed.maxWords,
      publicSearch: false,
      sources: [source],
      bannedWords: [],
    },
  };
}

test("layers stay in one order", () => {
  const facts = composeLayers({
    outputType: "REPORTING_COMMENTARY",
    visibility: "complete",
    eventType: "SPECIAL_TOPIC",
    transactionDate: fixed.transactionDate,
    investment: fixed.investment,
    specialInstructions: "",
    sources: [fixed.source],
    authoringOrganisation: null,
  });
  assert.deepEqual(
    facts.map((layer) => layer.id),
    LAYER_ORDER
  );
  assert.equal(facts.find((layer) => layer.id === "source-roles").text, "");

  const context = composeLayers({
    outputType: "REPORTING_COMMENTARY",
    visibility: "complete",
    eventType: "NEW_DIRECT_INVESTMENT",
    sources: [{ ...fixed.source, role: "context" }],
  });
  assert.deepEqual(
    context.map((layer) => layer.id),
    LAYER_ORDER
  );
  assert.equal(context.find((layer) => layer.id === "source-roles").text, CONTEXT_SOURCE_LINE);
});

test("every text type module exports the shape", async () => {
  const withScaffold = new Set(["NEW_DIRECT_INVESTMENT", "NEW_PRIMARY_COMMITMENT"]);
  for (const key of Object.values(EVENT_TYPE)) {
    const mod = await import(`../lib/prompt-library/text-types/${key}.mjs`);
    assert.equal(typeof mod.label, "string");
    assert.ok(mod.label.length > 0, key);
    assert.ok(Array.isArray(mod.mustCover), key);
    assert.equal(typeof mod.guidance, "string", key);
    if (withScaffold.has(key)) {
      assert.match(mod.guidance, /Binding constraints \(highest precedence/);
    } else {
      assert.equal(mod.guidance, "");
      assert.deepEqual(mod.mustCover, []);
    }
  }
});

test("facts sources match the baseline byte for byte", async () => {
  assert.equal(baseline.rows.length, 176);
  let identical = 0;
  for (const row of baseline.rows) {
    const input = bodies(row, fixed.source);
    const base = buildBasePrompt(input.base);
    const label = `${row.textType} ${row.outputType} ${row.visibility} special=${Boolean(row.specialInstructions)}`;
    assertSame(`${label} base`, row.basePromptText, base.basePromptText);
    assert.deepEqual(base.baseGuidanceSummary, row.baseGuidanceSummary);
    assert.equal(base.basePromptText.includes(CONTEXT_SOURCE_LINE), false);
    const generated = await capture(generate, input.generate);
    const rewritten = await capture(rewrite, input.rewrite);
    assertSame(`${label} generate system`, row.generateSystem, generated.system);
    assertSame(`${label} generate user`, row.generateUser, generated.user);
    assertSame(`${label} rewrite system`, row.rewriteSystem, rewritten.system);
    assertSame(`${label} rewrite user`, row.rewriteUser, rewritten.user);
    identical += 1;
  }
  assert.equal(identical, baseline.rows.length);
});

test("a context source appends one line and changes nothing else", async () => {
  const row = baseline.rows.find(
    (item) =>
      item.textType === "NEW_DIRECT_INVESTMENT" &&
      item.outputType === "REPORTING_COMMENTARY" &&
      item.visibility === "complete" &&
      item.specialInstructions
  );
  const source = { ...fixed.source, role: "context" };
  const input = bodies(row, source);
  const base = buildBasePrompt(input.base);
  assertSame("context base", `${row.basePromptText}\n\n${CONTEXT_SOURCE_LINE}`, base.basePromptText);
  assert.deepEqual(base.baseGuidanceSummary, row.baseGuidanceSummary);
  const generated = await capture(generate, input.generate);
  const rewritten = await capture(rewrite, input.rewrite);
  assertSame(
    "context generate system",
    `${row.generateSystem}\n\n${CONTEXT_SOURCE_LINE}`,
    generated.system
  );
  assertSame("context generate user", row.generateUser, generated.user);
  assertSame("context rewrite system", row.rewriteSystem, rewritten.system);
  assertSame(
    "context rewrite user",
    `${row.rewriteUser}\n\n${CONTEXT_SOURCE_LINE}`,
    rewritten.user
  );
  assert.equal(generated.user.includes(CONTEXT_SOURCE_LINE), false);
  assert.equal(rewritten.system.includes(CONTEXT_SOURCE_LINE), false);
});
