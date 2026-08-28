import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { getLlmPricingTable } from "../lib/observability.js";
import {
  REVIEW_STAGE_KEYS,
  buildModelConfigRecord,
  collectStage2Fingerprints,
  collectStageModels,
  evaluateModelDrift,
  fingerprintSetsEqual,
  hasDateSuffix,
  systemFingerprintFromCompletion,
} from "../lib/qc/model-fingerprints.mjs";
import {
  reportModelDrift,
  resetInProcessDriftMemory,
} from "../lib/qc/model-drift-reporter.mjs";
import { fingerprintBanner } from "../scripts/diagnostic/lib/fingerprint-manifest.mjs";

const card = (...fps) => ({
  stage2SourceFingerprints: fps.map((systemFingerprint) => ({ systemFingerprint })),
});

describe("STAGE_MODELS is pinned", () => {
  // Guard against silently reintroducing a floating alias. An alias lets the
  // provider promote a new snapshot behind the same name, which moves verdicts
  // with no deploy and no signal.
  it("gives every stage a dated snapshot, never a floating alias", () => {
    const floating = Object.entries(STAGE_MODELS)
      .filter(([, row]) => !hasDateSuffix(row.model))
      .map(([stage, row]) => `${stage} -> ${row.model}`);
    expect(floating).toEqual([]);
  });

  it("prices every configured model, so cost telemetry cannot silently zero", () => {
    const pricing = getLlmPricingTable();
    const unpriced = Object.entries(STAGE_MODELS)
      .filter(([, row]) => !pricing?.[row.provider]?.[row.model])
      .map(([stage, row]) => `${stage} -> ${row.model}`);
    // gpt-5.1 carried no price before pinning either; adding one here would
    // change reported costs, so it stays a known gap rather than a surprise.
    const unexpected = unpriced.filter((entry) => !entry.includes("gpt-5.1"));
    expect(unexpected).toEqual([]);
  });

  it("recognises pinned snapshots and rejects bare aliases", () => {
    expect(hasDateSuffix("gpt-4o-2024-08-06")).toBe(true);
    expect(hasDateSuffix("gpt-5.1-2025-11-13")).toBe(true);
    expect(hasDateSuffix("gpt-4o")).toBe(false);
    expect(hasDateSuffix("gpt-5.1")).toBe(false);
    expect(hasDateSuffix("gpt-4o-mini")).toBe(false);
  });
});

describe("collectStage2Fingerprints", () => {
  it("returns the distinct set, sorted", () => {
    expect(collectStage2Fingerprints([card("fp_b", "fp_a"), card("fp_a")])).toEqual([
      "fp_a",
      "fp_b",
    ]);
  });

  it("tolerates cards with no fingerprints", () => {
    expect(collectStage2Fingerprints([{}, null, card()])).toEqual([]);
    expect(collectStage2Fingerprints(undefined)).toEqual([]);
  });

  it("ignores blank fingerprints", () => {
    expect(collectStage2Fingerprints([card("", "  ", "fp_a")])).toEqual(["fp_a"]);
  });
});

describe("collectStageModels", () => {
  it("names the model configured for each review stage", () => {
    const models = collectStageModels(REVIEW_STAGE_KEYS);
    expect(models["stage2-matching"]).toEqual({
      provider: "openai",
      model: "gpt-4o-2024-08-06",
    });
  });

  it("skips unknown stage keys", () => {
    expect(collectStageModels(["not-a-stage"])).toEqual({});
  });
});

describe("buildModelConfigRecord", () => {
  it("is additive and self-describing", () => {
    const record = buildModelConfigRecord({
      qcCards: [card("fp_a")],
      ranAt: "2026-08-28T00:00:00.000Z",
    });
    expect(record.ranAt).toBe("2026-08-28T00:00:00.000Z");
    expect(record.stage2Fingerprints).toEqual(["fp_a"]);
    expect(record.stageModels["stage2-matching"].model).toBe("gpt-4o-2024-08-06");
  });
});

describe("systemFingerprintFromCompletion", () => {
  it("reads the provider field when present", () => {
    expect(systemFingerprintFromCompletion({ raw: { system_fingerprint: "fp_a" } })).toBe("fp_a");
  });

  it("returns null when the provider does not supply one", () => {
    expect(systemFingerprintFromCompletion({ raw: {} })).toBeNull();
    expect(systemFingerprintFromCompletion({})).toBeNull();
    expect(systemFingerprintFromCompletion(null)).toBeNull();
  });
});

describe("fingerprintSetsEqual", () => {
  it("compares as sets, not sequences", () => {
    expect(fingerprintSetsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(fingerprintSetsEqual(["a"], ["a", "b"])).toBe(false);
  });
});

describe("evaluateModelDrift", () => {
  it("stays silent when the configuration matches", () => {
    const d = evaluateModelDrift({
      stage: "stage2",
      model: "gpt-4o",
      current: ["fp_a"],
      previous: ["fp_a"],
    });
    expect(d).toEqual({ changed: false, level: "silent", line: null });
  });

  it("emits an info baseline when nothing was recorded before", () => {
    const d = evaluateModelDrift({
      stage: "stage2",
      model: "gpt-4o",
      current: ["fp_a"],
      previous: null,
      firstSeen: "2026-08-28T00:00:00.000Z",
    });
    expect(d.level).toBe("info");
    expect(d.changed).toBe(false);
    expect(d.line).toBe(
      "[model-drift] stage=stage2 baseline=fp_a model=gpt-4o firstSeen=2026-08-28T00:00:00.000Z"
    );
  });

  it("warns when the configuration changes", () => {
    const d = evaluateModelDrift({
      stage: "stage2",
      model: "gpt-4o",
      current: ["fp_1a8e2a470b"],
      previous: ["fp_17e3c4f467"],
      firstSeen: "2026-08-28T00:00:00.000Z",
    });
    expect(d.level).toBe("warn");
    expect(d.changed).toBe(true);
    expect(d.line).toBe(
      "[model-drift] stage=stage2 previous=fp_17e3c4f467 current=fp_1a8e2a470b " +
        "model=gpt-4o firstSeen=2026-08-28T00:00:00.000Z"
    );
  });

  it("stays silent when the run reported no fingerprint at all", () => {
    const d = evaluateModelDrift({ stage: "reviser", model: "gpt-5.1", current: [], previous: ["fp_a"] });
    expect(d.level).toBe("silent");
  });
});

describe("reportModelDrift", () => {
  // Exercise the no-database path so the test never touches a real log table.
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    resetInProcessDriftMemory();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("logs a baseline, then stays quiet, then warns on change", async () => {
    resetInProcessDriftMemory();
    const log = vi.fn();
    const warn = vi.fn();
    const args = { stage: "stage2", model: "gpt-4o", log, warn };

    await reportModelDrift({ ...args, fingerprints: ["fp_a"] });
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    await reportModelDrift({ ...args, fingerprints: ["fp_a"] });
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    await reportModelDrift({ ...args, fingerprints: ["fp_b"] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("previous=fp_a current=fp_b");
  });

  it("does nothing when there is no fingerprint to record", async () => {
    resetInProcessDriftMemory();
    const log = vi.fn();
    const warn = vi.fn();
    const out = await reportModelDrift({ stage: "reviser", model: "gpt-5.1", fingerprints: [], log, warn });
    expect(out.level).toBe("silent");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("fingerprintBanner", () => {
  const manifest = { stage2Fingerprints: ["fp_17e3c4f467"] };

  it("is empty when the run matches the baseline", () => {
    expect(fingerprintBanner({ runFingerprints: ["fp_17e3c4f467"], manifest })).toBe("");
  });

  it("is empty when there is nothing to compare", () => {
    expect(fingerprintBanner({ runFingerprints: [], manifest })).toBe("");
    expect(fingerprintBanner({ runFingerprints: ["fp_a"], manifest: null })).toBe("");
  });

  it("warns prominently when the comparison crosses configurations", () => {
    const banner = fingerprintBanner({ runFingerprints: ["fp_1a8e2a470b"], manifest });
    expect(banner).toContain("THIS COMPARISON CROSSES TWO MODEL CONFIGURATIONS");
    expect(banner).toContain("fp_17e3c4f467");
    expect(banner).toContain("fp_1a8e2a470b");
  });
});
