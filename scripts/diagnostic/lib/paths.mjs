import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const DIAG_ROOT = path.join(REPO_ROOT, "scripts", "diagnostic");
export const FIXTURES_DIR = path.join(DIAG_ROOT, "fixtures");
export const SOURCES_DIR = path.join(DIAG_ROOT, "sources");
export const SOURCES_EXTRACTED_DIR = path.join(DIAG_ROOT, "sources-extracted");
export const RUNS_DIR = path.join(DIAG_ROOT, "runs");
