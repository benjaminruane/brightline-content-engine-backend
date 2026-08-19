import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./paths.mjs";

/** Files that change Stage 1 or whole-sentence Stage 2 outputs. */
export const STAGE12_FINGERPRINT_FILES = [
  "lib/qc/pipeline-v4/stage1-extract-statements.mjs",
  "lib/qc/pipeline-v4/stage2-match-sources.mjs",
  "lib/qc/pipeline-v4/prompts/stage2_v4.md",
  "lib/qc/model-config.mjs",
];

export async function pipelineCodeFingerprint(files = STAGE12_FINGERPRINT_FILES) {
  const hash = createHash("sha256");
  for (const rel of files) {
    const text = await readFile(path.join(REPO_ROOT, rel), "utf8");
    hash.update(rel);
    hash.update("\n");
    hash.update(text);
    hash.update("\n");
  }
  return hash.digest("hex");
}
