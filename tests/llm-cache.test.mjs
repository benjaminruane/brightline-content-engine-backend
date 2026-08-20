import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "vitest";

import {
  CACHE_VERSION,
  beginCacheRun,
  buildCacheKey,
  buildComponentHashes,
  createMemoryStore,
  endCacheRun,
  getCacheVersion,
  isLlmCacheEnabled,
  putLlmCache,
  resetLlmCacheStore,
  setCacheVersionOverride,
  setLlmCacheStore,
  withLlmCache,
} from "../lib/qc/llm-cache.mjs";

const BASE_PARTS = {
  stage: "stage2",
  inputText: "Revenue was EUR 10 million.",
  parentSentence: null,
  sourceText: "The company reported revenue of EUR 10 million.",
  promptHash: "prompt-hash-v4",
  modelId: "gpt-4o",
  temperature: 0,
  seed: 1,
  cacheVersion: 1,
};

function cloneParts(overrides = {}) {
  return { ...BASE_PARTS, ...overrides };
}

describe("buildCacheKey", () => {
  test("identical inputs give identical keys", () => {
    const a = buildCacheKey(cloneParts());
    const b = buildCacheKey(cloneParts());
    assert.equal(a, b);
    assert.equal(typeof a, "string");
    assert.equal(a.length, 64);
  });

  test("changing stage produces a different key", () => {
    const base = buildCacheKey(cloneParts({ stage: "stage2" }));
    assert.notEqual(base, buildCacheKey(cloneParts({ stage: "stage1" })));
    assert.notEqual(base, buildCacheKey(cloneParts({ stage: "stage1b" })));
  });

  test("changing inputText produces a different key", () => {
    const base = buildCacheKey(cloneParts());
    assert.notEqual(base, buildCacheKey(cloneParts({ inputText: "Revenue was EUR 10 million!" })));
  });

  test("changing parentSentence produces a different key", () => {
    const base = buildCacheKey(cloneParts({ parentSentence: null }));
    assert.notEqual(base, buildCacheKey(cloneParts({ parentSentence: "Parent sentence here." })));
  });

  test("parentSentence null vs populated produces different keys", () => {
    const withNull = buildCacheKey(cloneParts({ parentSentence: null }));
    const withText = buildCacheKey(cloneParts({ parentSentence: "The fund continues to perform." }));
    assert.notEqual(withNull, withText);
  });

  test("parentSentence null vs empty string produces different keys", () => {
    const withNull = buildCacheKey(cloneParts({ parentSentence: null }));
    const withEmpty = buildCacheKey(cloneParts({ parentSentence: "" }));
    assert.notEqual(withNull, withEmpty);
  });

  test("changing sourceText produces a different key", () => {
    const base = buildCacheKey(cloneParts());
    assert.notEqual(base, buildCacheKey(cloneParts({ sourceText: "Different source." })));
  });

  test("sourceText null vs populated produces different keys", () => {
    const withNull = buildCacheKey(cloneParts({ sourceText: null }));
    const withText = buildCacheKey(cloneParts({ sourceText: "Source body." }));
    assert.notEqual(withNull, withText);
  });

  test("changing promptHash produces a different key", () => {
    const base = buildCacheKey(cloneParts());
    assert.notEqual(base, buildCacheKey(cloneParts({ promptHash: "prompt-hash-v4-changed" })));
  });

  test("changing modelId produces a different key", () => {
    const base = buildCacheKey(cloneParts());
    assert.notEqual(base, buildCacheKey(cloneParts({ modelId: "gpt-4o-mini" })));
  });

  test("changing temperature produces a different key", () => {
    const base = buildCacheKey(cloneParts({ temperature: 0 }));
    assert.notEqual(base, buildCacheKey(cloneParts({ temperature: 0.1 })));
  });

  test("changing seed produces a different key", () => {
    const base = buildCacheKey(cloneParts({ seed: 1 }));
    assert.notEqual(base, buildCacheKey(cloneParts({ seed: 2 })));
    assert.notEqual(base, buildCacheKey(cloneParts({ seed: null })));
  });

  test("changing cacheVersion produces a different key", () => {
    const base = buildCacheKey(cloneParts({ cacheVersion: 1 }));
    assert.notEqual(base, buildCacheKey(cloneParts({ cacheVersion: 2 })));
  });

  test("whitespace differences produce different keys", () => {
    const compact = buildCacheKey(cloneParts({ inputText: "Revenue was EUR 10 million." }));
    const trailing = buildCacheKey(cloneParts({ inputText: "Revenue was EUR 10 million. " }));
    const doubled = buildCacheKey(cloneParts({ inputText: "Revenue was EUR  10 million." }));
    const newline = buildCacheKey(cloneParts({ inputText: "Revenue was EUR 10 million.\n" }));
    assert.notEqual(compact, trailing);
    assert.notEqual(compact, doubled);
    assert.notEqual(compact, newline);
    assert.notEqual(trailing, newline);
  });

  test("component hashes cover every required field", () => {
    const hashes = buildComponentHashes(cloneParts());
    for (const name of [
      "stage",
      "inputText",
      "parentSentence",
      "sourceText",
      "promptHash",
      "modelId",
      "temperature",
      "seed",
      "cacheVersion",
    ]) {
      assert.equal(typeof hashes[name], "string");
      assert.equal(hashes[name].length, 64);
    }
  });
});

describe("QC_LLM_CACHE flag default OFF", () => {
  const prev = process.env.QC_LLM_CACHE;

  afterEach(() => {
    if (prev === undefined) delete process.env.QC_LLM_CACHE;
    else process.env.QC_LLM_CACHE = prev;
  });

  test("unset is off", () => {
    delete process.env.QC_LLM_CACHE;
    assert.equal(isLlmCacheEnabled(), false);
  });

  test("explicit off values are off", () => {
    process.env.QC_LLM_CACHE = "0";
    assert.equal(isLlmCacheEnabled(), false);
    process.env.QC_LLM_CACHE = "off";
    assert.equal(isLlmCacheEnabled(), false);
    process.env.QC_LLM_CACHE = "false";
    assert.equal(isLlmCacheEnabled(), false);
  });

  test("on values are on", () => {
    process.env.QC_LLM_CACHE = "1";
    assert.equal(isLlmCacheEnabled(), true);
    process.env.QC_LLM_CACHE = "on";
    assert.equal(isLlmCacheEnabled(), true);
    process.env.QC_LLM_CACHE = "true";
    assert.equal(isLlmCacheEnabled(), true);
  });
});

describe("withLlmCache behaviour", () => {
  let store;
  const prev = process.env.QC_LLM_CACHE;

  beforeEach(() => {
    store = createMemoryStore();
    setLlmCacheStore(store);
    process.env.QC_LLM_CACHE = "1";
    setCacheVersionOverride(null);
    beginCacheRun({ recordEvents: true });
  });

  afterEach(() => {
    endCacheRun();
    resetLlmCacheStore();
    setCacheVersionOverride(null);
    if (prev === undefined) delete process.env.QC_LLM_CACHE;
    else process.env.QC_LLM_CACHE = prev;
  });

  test("flag OFF does not read or write", async () => {
    delete process.env.QC_LLM_CACHE;
    let reads = 0;
    let writes = 0;
    setLlmCacheStore({
      async get() {
        reads += 1;
        return null;
      },
      async put() {
        writes += 1;
      },
    });
    let calls = 0;
    const result = await withLlmCache({
      parts: cloneParts(),
      liveCall: async () => {
        calls += 1;
        return { classification: "confirmed" };
      },
    });
    assert.equal(result.classification, "confirmed");
    assert.equal(calls, 1);
    assert.equal(reads, 0);
    assert.equal(writes, 0);
  });

  test("miss then hit", async () => {
    let calls = 0;
    const liveCall = async () => {
      calls += 1;
      return {
        classification: "confirmed",
        passage: "Revenue was EUR 10 million.",
        explanation: "Same figure.",
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.0004,
        systemFingerprint: "fp-test",
      };
    };
    const first = await withLlmCache({ parts: cloneParts(), liveCall });
    const second = await withLlmCache({ parts: cloneParts(), liveCall });
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    assert.equal(second.classification, "confirmed");
    assert.equal(second.passage, "Revenue was EUR 10 million.");
    assert.equal(store.size(), 1);
  });

  test("mismatch forces a miss and a warning", async () => {
    const parts = cloneParts();
    const key = buildCacheKey(parts);
    const hashes = buildComponentHashes(parts);
    await store.put(key, {
      payload: { classification: "stale" },
      componentHashes: { ...hashes, inputText: "tampered-hash" },
      modelId: parts.modelId,
      promptHash: parts.promptHash,
      systemFingerprint: "fp-old",
      createdAt: new Date().toISOString(),
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
    });

    let calls = 0;
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const result = await withLlmCache({
        parts,
        liveCall: async () => {
          calls += 1;
          return { classification: "confirmed", usage: { inputTokens: 10, outputTokens: 2 } };
        },
      });
      assert.equal(calls, 1);
      assert.equal(result.classification, "confirmed");
      assert.ok(warnings.some((w) => w.includes("MISMATCH") && w.includes("inputText")));
      const stored = await store.get(key);
      assert.equal(stored.payload.classification, "confirmed");
    } finally {
      console.warn = origWarn;
    }
  });

  test("throwing store falls through to the live call", async () => {
    setLlmCacheStore({
      async get() {
        throw new Error("store read boom");
      },
      async put() {
        throw new Error("store write boom");
      },
    });
    let calls = 0;
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const result = await withLlmCache({
        parts: cloneParts(),
        liveCall: async () => {
          calls += 1;
          return { classification: "no_support" };
        },
      });
      assert.equal(calls, 1);
      assert.equal(result.classification, "no_support");
      assert.ok(warnings.some((w) => /read failed/i.test(w)));
      assert.ok(warnings.some((w) => /write failed/i.test(w)));
    } finally {
      console.warn = origWarn;
    }
  });

  test("CACHE_VERSION override changes the key", () => {
    const atDefault = buildCacheKey(cloneParts({ cacheVersion: getCacheVersion() }));
    setCacheVersionOverride(CACHE_VERSION + 7);
    const bumped = buildCacheKey(cloneParts({ cacheVersion: getCacheVersion() }));
    assert.notEqual(atDefault, bumped);
    setCacheVersionOverride(null);
    assert.equal(getCacheVersion(), CACHE_VERSION);
  });

  test("put then get round-trips complete Stage 2 payload", async () => {
    const payload = {
      classification: "partially_confirmed",
      passage: "excerpt",
      explanation: "why",
      systemFingerprint: "fp-1",
    };
    await putLlmCache(cloneParts(), payload, () => ({
      usage: { inputTokens: 50, outputTokens: 5 },
      costUsd: 0.0002,
      systemFingerprint: "fp-1",
    }));
    const again = await withLlmCache({
      parts: cloneParts(),
      liveCall: async () => {
        throw new Error("should not call live on hit");
      },
    });
    assert.equal(again.classification, "partially_confirmed");
    assert.equal(again.passage, "excerpt");
    assert.equal(again.explanation, "why");
  });
});
