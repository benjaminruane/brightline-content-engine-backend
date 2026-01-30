// lib/assessment-language-a391.mjs
// A3.9.2: Isolated A3.9.1 language refinement — tone, ordering, near-figure wording.
// Does NOT change reliabilityScore, reliabilityLabel, citations, evidence; only reason text + order.

/**
 * Refine assessment language per A3.9.1: tighten phrasing, remove hedging, deterministic voice,
 * consistent ordering (strongest confirmations first, then verify/ambiguity), and explicit
 * near-figure wording where applicable.
 * @param {object} assessment - Existing assessment (reliabilityScore, reliabilityLabel, reasons[], citations[], evidence[], etc.)
 * @param {object} opts - Optional options (reserved)
 * @returns {object} New assessment object (never mutates input)
 */
export function refineAssessmentLanguageA391(assessment, opts = {}) {
  if (!assessment || typeof assessment !== "object") return assessment;

  const out = { ...assessment };

  if (!Array.isArray(assessment.reasons) || assessment.reasons.length === 0) {
    return out;
  }

  // Normalize reasons to strings and apply text transforms (tone, near-figure wording)
  const normalizedReasons = assessment.reasons.map((r) => {
    let s = typeof r === "string" ? r : (r && String(r)) || "";
    if (!s.trim()) return s;

    // Near-figure: make "which figure applies" explicit
    if (/multiple figures? present|verify which applies?/i.test(s)) {
      s = s
        .replace(/\bmultiple figures? present\b/gi, "Multiple nearby figures present")
        .replace(/\bverify which applies?\b/gi, "Verify which figure applies to which claim");
    }

    // Remove softeners only when present (do not invent)
    if (/\b(appears|seems)\b/i.test(s)) {
      s = s.replace(/\bappears\s+to\s+be\b/gi, "is").replace(/\bseems\s+to\s+be\b/gi, "is");
      s = s.replace(/\bappears\s+/gi, "").replace(/\bseems\s+/gi, "");
    }

    return s.trim();
  });

  // Order: strongest confirmations/support first, then verify/unclear/multiple-figures
  const confirmed = [];
  const supported = [];
  const verifyOrUnclear = [];
  const nearFigure = [];
  const other = [];

  for (const r of normalizedReasons) {
    const lower = r.toLowerCase();
    if (/confirmed|supported by|matches\s+(source|citation)/i.test(lower)) {
      if (/confirmed/i.test(lower)) confirmed.push(r);
      else supported.push(r);
    } else if (/verify|unclear|ambiguous|which figure|multiple (nearby )?figures/i.test(lower)) {
      if (/figure|figures/i.test(lower)) nearFigure.push(r);
      else verifyOrUnclear.push(r);
    } else {
      other.push(r);
    }
  }

  out.reasons = [...confirmed, ...supported, ...verifyOrUnclear, ...nearFigure, ...other];
  return out;
}

// In-module self-check (example transformations; no test runner)
// refineAssessmentLanguageA391({ reasons: ["Multiple figures present; verify which applies"] })
//   -> reasons: ["Multiple nearby figures present; Verify which figure applies to which claim"]
// refineAssessmentLanguageA391({ reasons: ["Claim appears to be supported"] })
//   -> reasons: ["Claim is supported"] (or similar tightening)
