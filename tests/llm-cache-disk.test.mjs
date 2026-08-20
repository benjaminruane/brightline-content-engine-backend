import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import { readFile } from "node:fs/promises";

import {
  CACHE_VERSION,
  beginCacheRun,
  buildCacheKey,
  buildComponentHashes,
  createDiskStore,
  endCacheRun,
  getLlmCacheStore,
  isLlmCacheEnabled,
  llmCacheDiskPathFromEnv,
  resetLlmCacheStore,
  setCacheVersionOverride,
  setLlmCacheStore,
  withLlmCache,
} from "../lib/qc/llm-cache.mjs";
import {
  DEFAULT_LLM_CACHE_DISK_PATH,
  LIVE_MEASUREMENT_CACHE_OFF_LINE,
  applyDiagnosticDiskCache,
  forceLiveMeasurementCacheOff,
} from "../scripts/diagnostic/lib/llm-cache-disk.mjs";
import { loadLocalEnvFiles } from "../scripts/diagnostic/lib/env.mjs";

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

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), "ce-llm-cache-disk-"));
}

const LIVE_SCRIPTS = [
  "scripts/diagnostic/llm-cache/run-gate.mjs",
  "scripts/diagnostic/llm-cache/run-stage1-stability.mjs",
  "scripts/diagnostic/stage2-determinism/run.mjs",
];

describe("disk-backed LLM cache", () => {
  const prevCache = process.env.QC_LLM_CACHE;
  const prevDisk = process.env.QC_LLM_CACHE_DISK;
  const dirs = [];

  beforeEach(() => {
    process.env.QC_LLM_CACHE = "1";
    delete process.env.QC_LLM_CACHE_DISK;
    setCacheVersionOverride(null);
    resetLlmCacheStore();
    beginCacheRun({ recordEvents: true });
  });

  afterEach(async () => {
    endCacheRun();
    const store = resetLlmCacheStore();
    if (typeof store.clear === "function") await store.clear();
    setCacheVersionOverride(null);
    if (prevCache === undefined) delete process.env.QC_LLM_CACHE;
    else process.env.QC_LLM_CACHE = prevCache;
    if (prevDisk === undefined) delete process.env.QC_LLM_CACHE_DISK;
    else process.env.QC_LLM_CACHE_DISK = prevDisk;
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("put, discard memory, reload from the same file, hit with identical payload", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "cache.json");
    const payload = {
      classification: "confirmed",
      passage: "Revenue was EUR 10 million.",
      explanation: "Same figure.",
    };
    const first = createDiskStore({ filePath });
    setLlmCacheStore(first);
    let calls = 0;
    const liveCall = async () => {
      calls += 1;
      return { ...payload, usage: { inputTokens: 10, outputTokens: 2 }, costUsd: 0.0001 };
    };
    const a = await withLlmCache({ parts: cloneParts(), liveCall });
    assert.equal(calls, 1);
    assert.equal(a.classification, "confirmed");

    resetLlmCacheStore();
    const second = createDiskStore({ filePath });
    setLlmCacheStore(second);
    const b = await withLlmCache({
      parts: cloneParts(),
      liveCall: async () => {
        throw new Error("should not call live on disk hit");
      },
    });
    assert.equal(b.classification, "confirmed");
    assert.equal(b.passage, payload.passage);
    assert.equal(b.explanation, payload.explanation);
    assert.ok(second.fileBytes() > 0);
  });

  test("disk entry whose component hashes no longer match is a miss plus warning and is overwritten", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "cache.json");
    const parts = cloneParts();
    const key = buildCacheKey(parts);
    const hashes = buildComponentHashes(parts);
    const store = createDiskStore({ filePath });
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
    resetLlmCacheStore();
    const reloaded = createDiskStore({ filePath });
    setLlmCacheStore(reloaded);

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
          return { classification: "confirmed", usage: { inputTokens: 8, outputTokens: 1 } };
        },
      });
      assert.equal(calls, 1);
      assert.equal(result.classification, "confirmed");
      assert.ok(warnings.some((w) => w.includes("MISMATCH") && w.includes("inputText")));
      const stored = await reloaded.get(key);
      assert.equal(stored.payload.classification, "confirmed");
    } finally {
      console.warn = origWarn;
    }
  });

  test("CACHE_VERSION bump invalidates disk entries", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "cache.json");
    const store = createDiskStore({ filePath });
    setLlmCacheStore(store);
    await withLlmCache({
      parts: cloneParts({ cacheVersion: CACHE_VERSION }),
      liveCall: async () => ({ classification: "confirmed", usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    resetLlmCacheStore();
    setLlmCacheStore(createDiskStore({ filePath }));
    setCacheVersionOverride(CACHE_VERSION + 1);
    let calls = 0;
    const result = await withLlmCache({
      parts: cloneParts({ cacheVersion: CACHE_VERSION + 1 }),
      liveCall: async () => {
        calls += 1;
        return { classification: "partially_confirmed", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.classification, "partially_confirmed");
  });

  test("corrupt file does not throw; logs and starts empty", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "cache.json");
    writeFileSync(filePath, "{not-json", "utf8");
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const store = createDiskStore({ filePath });
      assert.equal(store.size(), 0);
      assert.equal(await store.get("anything"), null);
      assert.ok(warnings.some((w) => /unreadable|starting empty/i.test(w)));
    } finally {
      console.warn = origWarn;
    }
  });

  test("with QC_LLM_CACHE_DISK unset, no file is read or written", async () => {
    delete process.env.QC_LLM_CACHE_DISK;
    resetLlmCacheStore();
    const defaultExisted = existsSync(DEFAULT_LLM_CACHE_DISK_PATH);
    const defaultBefore = defaultExisted ? statSync(DEFAULT_LLM_CACHE_DISK_PATH) : null;
    await withLlmCache({
      parts: cloneParts(),
      liveCall: async () => ({ classification: "confirmed", usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    assert.equal(llmCacheDiskPathFromEnv(), null);
    assert.equal(getLlmCacheStore().kind, "memory");
    if (defaultBefore) {
      const after = statSync(DEFAULT_LLM_CACHE_DISK_PATH);
      assert.equal(after.mtimeMs, defaultBefore.mtimeMs);
      assert.equal(after.size, defaultBefore.size);
    } else {
      assert.equal(existsSync(DEFAULT_LLM_CACHE_DISK_PATH), false);
    }
  });

  test("leftover tmp or corrupt JSON does not throw; starts empty", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "cache.json");
    writeFileSync(`${filePath}.tmp`, "{partial", "utf8");
    const store = createDiskStore({ filePath });
    assert.equal(store.size(), 0);
    await store.put("k", { payload: { ok: true }, componentHashes: {} });
    assert.equal(existsSync(filePath), true);
  });

  test("env-attached disk store writes through when QC_LLM_CACHE_DISK is set", async () => {
    const dir = tempDir();
    dirs.push(dir);
    const filePath = path.join(dir, "from-env.json");
    process.env.QC_LLM_CACHE_DISK = filePath;
    resetLlmCacheStore();
    await withLlmCache({
      parts: cloneParts(),
      liveCall: async () => ({ classification: "no_support", usage: { inputTokens: 2, outputTokens: 1 } }),
    });
    assert.equal(existsSync(filePath), true);
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    assert.equal(raw.format, 1);
    assert.equal(typeof raw.entries, "object");
    assert.ok(Object.keys(raw.entries).length >= 1);
  });
});

describe("diagnostic disk-cache policy", () => {
  const prevCache = process.env.QC_LLM_CACHE;
  const prevDisk = process.env.QC_LLM_CACHE_DISK;

  afterEach(() => {
    if (prevCache === undefined) delete process.env.QC_LLM_CACHE;
    else process.env.QC_LLM_CACHE = prevCache;
    if (prevDisk === undefined) delete process.env.QC_LLM_CACHE_DISK;
    else process.env.QC_LLM_CACHE_DISK = prevDisk;
  });

  test("forceLiveMeasurementCacheOff cannot be overridden by env or flag", () => {
    process.env.QC_LLM_CACHE = "1";
    process.env.QC_LLM_CACHE_DISK = "/tmp/should-not-keep.json";
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const line = forceLiveMeasurementCacheOff();
      assert.equal(line, LIVE_MEASUREMENT_CACHE_OFF_LINE);
      assert.equal(isLlmCacheEnabled(), false);
      assert.equal(process.env.QC_LLM_CACHE, "0");
      assert.equal(process.env.QC_LLM_CACHE_DISK, undefined);
      assert.ok(logs.some((l) => l === LIVE_MEASUREMENT_CACHE_OFF_LINE));
    } finally {
      console.log = origLog;
    }
  });

  test("loadLocalEnvFiles liveMeasurement ignores --refresh-cache and leaves a disk file in place", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-llm-live-"));
    const filePath = path.join(dir, "keep.json");
    writeFileSync(filePath, "{\"format\":1,\"entries\":{}}\n", "utf8");
    process.env.QC_LLM_CACHE = "1";
    process.env.QC_LLM_CACHE_DISK = filePath;
    const origArgv = process.argv;
    const origLog = console.log;
    console.log = () => {};
    try {
      process.argv = ["node", "script.mjs", "--refresh-cache"];
      loadLocalEnvFiles({ liveMeasurement: true });
      assert.equal(isLlmCacheEnabled(), false);
      assert.equal(process.env.QC_LLM_CACHE_DISK, undefined);
      assert.equal(existsSync(filePath), true);
    } finally {
      process.argv = origArgv;
      console.log = origLog;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--no-disk-cache unsets the path; --refresh-cache deletes the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-llm-flags-"));
    const filePath = path.join(dir, "wipe.json");
    writeFileSync(filePath, "{\"format\":1,\"entries\":{}}\n", "utf8");
    process.env.QC_LLM_CACHE_DISK = filePath;
    applyDiagnosticDiskCache(["node", "script.mjs", "--refresh-cache"]);
    assert.equal(existsSync(filePath), false);
    process.env.QC_LLM_CACHE_DISK = filePath;
    applyDiagnosticDiskCache(["node", "script.mjs", "--no-disk-cache"]);
    assert.equal(process.env.QC_LLM_CACHE_DISK, undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  test("the three live-only scripts hard-code liveMeasurement and cannot opt into disk", async () => {
    for (const rel of LIVE_SCRIPTS) {
      const src = await readFile(path.join(process.cwd(), rel), "utf8");
      assert.ok(
        src.includes("loadLocalEnvFiles({ liveMeasurement: true })"),
        `${rel} must call loadLocalEnvFiles({ liveMeasurement: true })`
      );
      assert.equal(
        src.includes("applyDiagnosticDiskCache("),
        false,
        `${rel} must not apply the diagnostic disk cache`
      );
    }
  });
});
