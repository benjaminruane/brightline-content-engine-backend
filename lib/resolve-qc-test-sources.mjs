/**
 * T1.1: Safe resolver for QC test corpus source files.
 * Resolves only basename filenames from tests/qc_corpus/; rejects path traversal and absolute paths.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = path.resolve(__dirname, "..", "tests", "qc_corpus");

/**
 * Resolve and read source files from the QC test corpus. Fails closed on unknown or invalid paths.
 * @param {string[]} sourceFiles - Array of basename filenames (e.g. ["B1_shopify_source_1_7m.txt"])
 * @returns {Promise<{ sources: Array<{ id: number, name: string, title: string, text: string, sourceType: string }>, error?: { code: string, message: string } }>}
 */
export async function resolveQcTestSourceFiles(sourceFiles) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) {
    return { sources: [], error: { code: "invalid_source_files", message: "sourceFiles must be a non-empty array" } };
  }

  const normalizedRoot = path.resolve(CORPUS_ROOT);
  const sources = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const raw = sourceFiles[i];
    if (typeof raw !== "string" || !raw.trim()) {
      return { sources: [], error: { code: "invalid_filename", message: `sourceFiles[${i}] must be a non-empty string` } };
    }
    // Reject absolute paths
    if (path.isAbsolute(raw)) {
      return { sources: [], error: { code: "path_traversal", message: "Absolute paths are not allowed" } };
    }
    // Basename only: strip any path components
    const basename = path.basename(raw);
    if (basename !== raw) {
      return { sources: [], error: { code: "path_traversal", message: `Path components not allowed: ${raw}` } };
    }
    const resolved = path.resolve(normalizedRoot, basename);
    // Ensure resolved path stays inside corpus
    const relative = path.relative(normalizedRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { sources: [], error: { code: "path_traversal", message: `Path escapes corpus: ${raw}` } };
    }

    let text;
    try {
      text = await readFile(resolved, "utf8");
    } catch (err) {
      const code = err?.code === "ENOENT" ? "file_not_found" : "read_error";
      const message = err?.code === "ENOENT"
        ? `Source file not found in test corpus: ${basename}`
        : (err?.message || "Failed to read source file");
      return { sources: [], error: { code, message } };
    }

    const id = i + 1;
    sources.push({
      id,
      name: basename,
      title: basename,
      text: String(text),
      sourceType: "uploaded",
    });
  }

  return { sources };
}
