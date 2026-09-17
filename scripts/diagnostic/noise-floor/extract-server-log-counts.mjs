/**
 * Pull per-run cache and schema-failure counts from a vercel dev log slice.
 * The raw log is not committed. Sequential runs are sliced by byte offset.
 */

const CACHE_LINE =
  /\[QC_LLM_CACHE\]\s+\S+\s+hits=(\d+)\s+misses=(\d+)\b.*?stage1\s+(\d+)\/(\d+).*?stage1b\s+(\d+)\/(\d+).*?stage2\s+(\d+)\/(\d+)/;

const EDITORIAL_FAIL =
  /\[EDITORIAL_STYLE_REVIEW\] schema validation failed after retry/;

const COMPLIANCE_FAIL =
  /\[EDITORIAL_COMPLIANCE_ERROR\] compliance parse failed/;

export function emptyLogCounts() {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    stage1Hits: 0,
    stage1Total: 0,
    stage1bHits: 0,
    stage1bTotal: 0,
    stage2Hits: 0,
    stage2Total: 0,
    summaryLogged: false,
    editorialSchemaFailures: 0,
    complianceParseFailures: 0,
  };
}

/**
 * @param {string} text
 */
export function extractLogCounts(text) {
  const out = emptyLogCounts();
  const src = typeof text === "string" ? text : "";
  if (!src) return out;

  const cacheMatch = src.match(CACHE_LINE);
  if (cacheMatch) {
    out.summaryLogged = true;
    out.cacheHits = Number(cacheMatch[1]) || 0;
    out.cacheMisses = Number(cacheMatch[2]) || 0;
    out.stage1Hits = Number(cacheMatch[3]) || 0;
    out.stage1Total = Number(cacheMatch[4]) || 0;
    out.stage1bHits = Number(cacheMatch[5]) || 0;
    out.stage1bTotal = Number(cacheMatch[6]) || 0;
    out.stage2Hits = Number(cacheMatch[7]) || 0;
    out.stage2Total = Number(cacheMatch[8]) || 0;
  }

  for (const line of src.split(/\r?\n/)) {
    if (EDITORIAL_FAIL.test(line)) out.editorialSchemaFailures += 1;
    if (COMPLIANCE_FAIL.test(line)) out.complianceParseFailures += 1;
  }
  return out;
}

/**
 * @param {string} filePath
 * @param {{ startByte?: number, endByte?: number }} [range]
 */
export async function extractLogCountsFromFile(filePath, range = {}) {
  const { readFile, stat } = await import("node:fs/promises");
  const size = (await stat(filePath)).size;
  const start = Number.isFinite(range.startByte) ? Math.max(0, range.startByte) : 0;
  const end = Number.isFinite(range.endByte) ? Math.min(size, range.endByte) : size;
  if (end <= start) return emptyLogCounts();
  const buf = await readFile(filePath);
  const slice = buf.subarray(start, end).toString("utf8");
  return extractLogCounts(slice);
}
