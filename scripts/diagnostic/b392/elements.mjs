/**
 * Re-export. The extractor lives in lib/qc/b394-elements.mjs so the reading
 * contract can ask it for the line of a hit. Callers of this path are
 * unchanged: b392/cross-table.mjs, b396, b397, b398, b401.
 */
export {
  BENCHMARK_WORDS,
  droppedPeriodLengths,
  elementFound,
  extractElements,
  isDerivedPeriodLength,
  locateElement,
  normaliseName,
} from "../../../lib/qc/b394-elements.mjs";
