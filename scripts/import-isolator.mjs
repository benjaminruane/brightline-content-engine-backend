// scripts/import-isolator.mjs
// A3.8.20: Temporary import isolator to find syntax error file via binary search

console.log("ISOLATOR start");

// Import suspect modules one by one, starting with the most likely culprits
// based on recent changes (A3.8.16-A3.8.19)

try {
  console.log("ISOLATOR importing analyse-statements-impl");
  const impl = await import("../api/analyse-statements-impl.js");
  console.log("ISOLATOR ✓ analyse-statements-impl imported");
} catch (err) {
  console.error("ISOLATOR ✗ analyse-statements-impl FAILED:", err.message);
  console.error("ISOLATOR stack:", err.stack);
  process.exit(1);
}

try {
  console.log("ISOLATOR importing canonicalClaims");
  const canon = await import("../lib/canonicalClaims.js");
  console.log("ISOLATOR ✓ canonicalClaims imported");
} catch (err) {
  console.error("ISOLATOR ✗ canonicalClaims FAILED:", err.message);
  console.error("ISOLATOR stack:", err.stack);
  process.exit(1);
}

try {
  console.log("ISOLATOR importing web.js");
  const web = await import("../lib/web.js");
  console.log("ISOLATOR ✓ web.js imported");
} catch (err) {
  console.error("ISOLATOR ✗ web.js FAILED:", err.message);
  console.error("ISOLATOR stack:", err.stack);
  process.exit(1);
}

try {
  console.log("ISOLATOR importing corpusSearch");
  const corpus = await import("../lib/corpusSearch.js");
  console.log("ISOLATOR ✓ corpusSearch imported");
} catch (err) {
  console.error("ISOLATOR ✗ corpusSearch FAILED:", err.message);
  console.error("ISOLATOR stack:", err.stack);
  process.exit(1);
}

try {
  console.log("ISOLATOR importing analyse-selected-statements");
  const selected = await import("../api/analyse-selected-statements.js");
  console.log("ISOLATOR ✓ analyse-selected-statements imported");
} catch (err) {
  console.error("ISOLATOR ✗ analyse-selected-statements FAILED:", err.message);
  console.error("ISOLATOR stack:", err.stack);
  process.exit(1);
}

console.log("ISOLATOR complete - all imports successful");
