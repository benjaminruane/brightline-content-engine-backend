/**
 * Local-diagnostic disk cache policy (B69).
 * Production never imports this file. QC_LLM_CACHE_DISK is the only switch
 * inside lib/qc/llm-cache.mjs; this helper sets that path for diagnostic scripts.
 */

import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

import { DIAG_ROOT } from "./paths.mjs";

/** Gitignored. Shared by every diagnostic script that does not force cache off. */
export const DEFAULT_LLM_CACHE_DISK_PATH = path.join(DIAG_ROOT, ".llm-cache.json");

export const LIVE_MEASUREMENT_CACHE_OFF_LINE =
  "[QC_LLM_CACHE] off (live measurement; disk and memory cache disabled)";

/**
 * Hard off. Ignores env and argv. The model's judgement is the thing being
 * measured, so a cached answer would make the gate prove nothing.
 */
export function forceLiveMeasurementCacheOff() {
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;
  console.log(LIVE_MEASUREMENT_CACHE_OFF_LINE);
  return LIVE_MEASUREMENT_CACHE_OFF_LINE;
}

function unlinkQuiet(filePath) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * Default ON for diagnostics. --no-disk-cache opts out. --refresh-cache
 * deletes the file so the next miss repopulates it.
 */
export function applyDiagnosticDiskCache(argv = process.argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes("--no-disk-cache")) {
    delete process.env.QC_LLM_CACHE_DISK;
    return { path: null, refresh: false };
  }
  const fromEnv = String(process.env.QC_LLM_CACHE_DISK || "").trim();
  const diskPath = fromEnv || DEFAULT_LLM_CACHE_DISK_PATH;
  process.env.QC_LLM_CACHE_DISK = diskPath;
  const refresh = args.includes("--refresh-cache");
  if (refresh) {
    unlinkQuiet(diskPath);
    unlinkQuiet(`${diskPath}.tmp`);
  }
  return { path: diskPath, refresh };
}
