// lib/canonicalClaims.js
//
// A3.8.0: Canonical Claim Layer
// Deterministic post-processing step that transforms raw claims into canonical claims.
// Canonical claims become the ONLY input to statement scoring, reliability derivation,
// reasons generation, and citations.

import { createHash } from "node:crypto";

/**
 * Canonicalize raw claims into canonical claims
 * @param {Array} rawClaims - Array of raw claim objects
 * @param {Object} ctx - Context object
 * @param {string} ctx.statementText - Full statement text
 * @param {boolean} ctx.selectionMode - Whether in selection mode
 * @param {string|null} ctx.selectionText - Selected text if in selection mode
 * @param {string|null} ctx.selectionHash - Hash of selected text segment
 * @param {Object} ctx.knownEntities - { company?: string, round?: string }
 * @param {string|null} ctx.runId - Run ID for logging
 * @param {string|null} ctx.reqSig - Request signature for logging
 * @param {number} ctx.statementIndex - Statement index for logging
 * @returns {Object} { canonicalClaims: CanonicalClaim[], diagnostics: Object }
 */
export function canonicalizeClaims(rawClaims, ctx) {
  const startTime = Date.now();
  const {
    statementText = "",
    selectionMode = false,
    selectionText = null,
    selectionHash = null,
    knownEntities = {},
    runId = null,
    reqSig = null,
    statementIndex = 0,
  } = ctx;

  const log = (runId && reqSig) 
    ? (...args) => console.log(`[DIAG][RID=${runId}][SIG=${reqSig}] ${args.join(" ")}`)
    : console.log;

  // Compute selectionHash if not provided
  const computedSelectionHash = selectionHash || (selectionText 
    ? createHash("sha256").update(selectionText).digest("hex").substring(0, 16)
    : null);

  // [CANON][START]
  log(`[CANON][START] statementIndex=${statementIndex} selectionMode=${selectionMode} selectionHash=${computedSelectionHash || "null"} rawClaimsCount=${rawClaims.length}`);

  if (!Array.isArray(rawClaims) || rawClaims.length === 0) {
    log(`[CANON][END] canonicalClaimsCount=0 elapsedMs=${Date.now() - startTime}`);
    return {
      canonicalClaims: [],
      diagnostics: { rawCount: 0, canonicalCount: 0 },
    };
  }

  // Step 1: Normalize raw claims (4.1)
  const normalized = rawClaims.map((raw, idx) => normalizeRawClaim(raw, statementText, knownEntities, idx));
  
  // [CANON][NORMALIZE]
  const typeCounts = {};
  normalized.forEach(n => {
    const type = n.inferredType || "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  log(`[CANON][NORMALIZE] ${JSON.stringify(typeCounts)}`);

  // Step 2: Group by grouping keys (4.3)
  const groups = groupNormalizedClaims(normalized, computedSelectionHash, selectionMode, statementText, knownEntities);
  
  // [CANON][GROUP]
  const topGroups = Array.from(groups.entries()).slice(0, 5).map(([key, claims]) => {
    const first = claims[0];
    return {
      type: first.inferredType,
      value: first.normalizedNumericValue,
      currency: first.normalizedCurrency,
      company: first.entityHints.company,
      round: first.entityHints.round,
    };
  });
  log(`[CANON][GROUP] groupsFormed=${groups.size} top5=${JSON.stringify(topGroups)}`);

  // Step 3: Merge groups into canonical claims (4.4, 4.5, 4.7)
  const merged = [];
  for (const [groupKey, groupClaims] of groups.entries()) {
    const canonical = mergeGroupIntoCanonical(groupClaims, statementText, computedSelectionHash, selectionMode, groupKey);
    if (canonical) {
      merged.push(canonical);
    }
  }

  // Step 4: Deduplicate by canonical ID (4.8)
  const deduplicated = deduplicateCanonicalClaims(merged, log);
  
  // [CANON][MERGE] - log first 10
  const mergeLogs = deduplicated.slice(0, 10).map(c => ({
    id: c.id.substring(0, 16),
    type: c.type,
    value: c.value,
    currency: c.currency || c.unit,
    company: c.company || "null",
    round: c.round || "null",
    citationsCount: c.citations.length,
    reliability: c.reliability,
    rawClaimIdsCount: c.rawClaimIds.length,
  }));
  log(`[CANON][MERGE] ${JSON.stringify(mergeLogs)}`);

  // Step 5: Invariant check (selection isolation)
  let selectionLeakageDetected = false;
  if (selectionMode && computedSelectionHash) {
    for (const canonical of deduplicated) {
      if (canonical.selectionScope.selectionHash !== computedSelectionHash) {
        selectionLeakageDetected = true;
        break;
      }
    }
  }
  log(`[CANON][INVARIANT] selectionLeakageDetected=${selectionLeakageDetected}`);

  // [CANON][END]
  const elapsedMs = Date.now() - startTime;
  log(`[CANON][END] canonicalClaimsCount=${deduplicated.length} elapsedMs=${elapsedMs}`);

  return {
    canonicalClaims: deduplicated,
    diagnostics: {
      rawCount: rawClaims.length,
      canonicalCount: deduplicated.length,
      groupsFormed: groups.size,
      selectionLeakageDetected,
    },
  };
}

/**
 * Normalize a raw claim (4.1)
 */
function normalizeRawClaim(raw, statementText, knownEntities, idx) {
  if (!raw || typeof raw !== "object") {
    // Return minimal normalized claim for invalid input
    return {
      raw: raw || {},
      rawClaimId: `raw_${idx}`,
      claimText: "",
      normalizedNumericValue: null,
      normalizedCurrency: null,
      normalizedPercent: null,
      anchorFamily: null,
      roleKeywords: [],
      entityHints: { company: null, round: null },
      inferredType: "other_qualitative",
      sourceSpan: { start: null, end: null },
      citations: [],
      reliability: "Low",
      reliabilityScore: null,
    };
  }
  
  const claimText = raw.claimText || "";
  const anchor = raw.anchor || null;
  
  // Extract numeric value, currency, percent
  const numeric = extractNumericValue(claimText);
  const currency = extractCurrency(claimText);
  const percent = extractPercent(claimText);
  
  // Derive anchorFamily
  const anchorFamily = anchor || inferAnchorFamily(claimText);
  
  // Extract role keywords
  const roleKeywords = extractRoleKeywords(claimText);
  
  // Extract entity hints
  const entityHints = {
    company: extractCompany(claimText, knownEntities.company),
    round: extractRound(claimText, knownEntities.round),
  };
  
  // Infer canonical type (4.2)
  const inferredType = inferCanonicalType(claimText, numeric, currency, percent, anchorFamily);
  
  // Extract source span (if available)
  const sourceSpan = extractSourceSpan(claimText, statementText);
  
  return {
    raw,
    rawClaimId: `raw_${idx}`,
    claimText,
    normalizedNumericValue: numeric.value,
    normalizedCurrency: currency,
    normalizedPercent: percent.value,
    anchorFamily,
    roleKeywords,
    entityHints,
    inferredType,
    sourceSpan,
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    reliability: raw.reliability || "Low",
    reliabilityScore: typeof raw.reliabilityScore === "number" ? raw.reliabilityScore : null,
  };
}

/**
 * Extract numeric value from claim text
 */
function extractNumericValue(text) {
  // Currency patterns: $7m, $7 million, $7mm
  const currencyMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/i);
  if (currencyMatch) {
    const numStr = currencyMatch[1].replace(/,/g, "");
    const unit = (currencyMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      // Normalize to base units (millions -> actual value)
      return { value: normalized * 1e6, hasCurrency: true };
    }
  }
  
  // Plain currency: $25, $18.7
  const plainCurrencyMatch = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (plainCurrencyMatch) {
    const num = parseFloat(plainCurrencyMatch[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num > 0) {
      return { value: num, hasCurrency: true };
    }
  }
  
  return { value: null, hasCurrency: false };
}

/**
 * Extract currency code from claim text
 */
function extractCurrency(text) {
  if (/\$|USD|EUR|GBP|SGD|AUD|CAD|JPY|CNY/i.test(text)) {
    // Default to USD for $, otherwise extract code
    const codeMatch = text.match(/\b(USD|EUR|GBP|SGD|AUD|CAD|JPY|CNY)\b/i);
    return codeMatch ? codeMatch[1].toUpperCase() : "USD";
  }
  return null;
}

/**
 * Extract percentage from claim text
 */
function extractPercent(text) {
  const pctMatch = text.match(/([\d,]+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const num = parseFloat(pctMatch[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num >= 0 && num <= 100) {
      return { value: num, hasPercent: true };
    }
  }
  return { value: null, hasPercent: false };
}

/**
 * Infer anchor family from claim text or anchor
 */
function inferAnchorFamily(claimText, anchor = null) {
  if (anchor) return anchor;
  
  // Try to extract from claim text
  const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b)/i);
  if (usdMatch) {
    const numStr = usdMatch[1].replace(/,/g, "");
    const unit = (usdMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      return `usd_${normalized}m`;
    }
  }
  
  const pctMatch = claimText.match(/([\d,]+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const num = Math.floor(parseFloat(pctMatch[1].replace(/,/g, "")));
    return `pct_${num}`;
  }
  
  // Qualitative anchors
  if (/\bpre-?money\b/i.test(claimText)) return "qual_premoney";
  if (/\bpost-?money\b/i.test(claimText)) return "qual_postmoney";
  if (/\bsecondary\b/i.test(claimText)) return "qual_secondary";
  if (/\bvaluation\b/i.test(claimText)) return "qual_valuation";
  if (/\benterprise\s+value\b|\bev\b(?!\w)/i.test(claimText)) return "qual_enterprise_value";
  
  return null;
}

/**
 * Extract role keywords from claim text
 */
function extractRoleKeywords(text) {
  const keywords = [];
  const lower = text.toLowerCase();
  
  const rolePatterns = [
    { pattern: /\b(investing|investment|invest)\b/i, keyword: "investment" },
    { pattern: /\b(financing|finance|funding)\b/i, keyword: "financing" },
    { pattern: /\b(valuation|value|valued)\b/i, keyword: "valuation" },
    { pattern: /\b(ownership|own|stake|equity)\b/i, keyword: "ownership" },
    { pattern: /\b(secondary|purchase|sale)\b/i, keyword: "secondary" },
    { pattern: /\b(convertible|SAFE|preferred|liquidation)\b/i, keyword: "structure" },
  ];
  
  for (const { pattern, keyword } of rolePatterns) {
    if (pattern.test(lower)) {
      keywords.push(keyword);
    }
  }
  
  return keywords;
}

/**
 * Extract company name from claim text or use known entity
 */
function extractCompany(text, knownCompany = null) {
  if (knownCompany) return knownCompany;
  
  // Simple extraction - look for capitalized words that might be company names
  // This is best-effort; Phase 2 will improve
  const words = text.split(/\s+/);
  const capitalized = words.filter(w => /^[A-Z][a-z]+/.test(w) && w.length > 2);
  if (capitalized.length > 0) {
    return capitalized[0];
  }
  
  return null;
}

/**
 * Extract round from claim text or use known entity
 */
function extractRound(text, knownRound = null) {
  if (knownRound) return knownRound;
  
  const roundMatch = text.match(/\b(Series\s+[A-Z]|Seed|Pre-seed|Angel)\b/i);
  if (roundMatch) {
    return roundMatch[1];
  }
  
  return null;
}

/**
 * Infer canonical type (4.2)
 */
function inferCanonicalType(claimText, numeric, currency, percent, anchorFamily) {
  const lower = claimText.toLowerCase();
  
  // Ownership percent
  if (percent.hasPercent && (/\b(ownership|own|stake|equity|fully\s+diluted)\b/i.test(claimText))) {
    return "ownership_percent";
  }
  
  // Investment amount
  if (numeric.hasCurrency && (/\b(investment|investing|invest|proceeds|funding)\b/i.test(claimText))) {
    return "investment_amount";
  }
  
  // Valuation types
  if (numeric.hasCurrency && (/\b(valuation|value|valued)\b/i.test(claimText))) {
    if (/\b(pre-?money|premoney|pre\s+money)\b/i.test(claimText)) {
      return "valuation_pre_money";
    }
    if (/\b(post-?money|postmoney|post\s+money)\b/i.test(claimText)) {
      return "valuation_post_money";
    }
    if (/\b(enterprise\s+value|EV)\b(?!\w)/i.test(claimText)) {
      return "valuation_enterprise_value";
    }
    // Default to pre-money for valuation
    return "valuation_pre_money";
  }
  
  // Secondary purchase
  if (/\b(secondary|shares\s+purchased|existing\s+shareholders)\b/i.test(claimText)) {
    return "secondary_purchase";
  }
  
  // Structure term
  if (/\b(convertible|SAFE|preferred|liquidation\s+preference|warrant)\b/i.test(claimText)) {
    return "structure_term";
  }
  
  // Qualitative types (best-effort)
  if (/\b(business|company|product|service)\b/i.test(claimText)) {
    return "business_description";
  }
  if (/\b(thesis|rationale|strategy|growth)\b/i.test(claimText)) {
    if (/\b(growth|expansion|scale)\b/i.test(claimText)) {
      return "growth_strategy";
    }
    return "investment_thesis";
  }
  
  // Default
  return "other_qualitative";
}

/**
 * Extract source span from claim text in statement text
 */
function extractSourceSpan(claimText, statementText) {
  if (!statementText || !claimText) {
    return { start: null, end: null };
  }
  
  // Find first occurrence of claim text in statement
  const index = statementText.indexOf(claimText);
  if (index >= 0) {
    return {
      start: index,
      end: index + claimText.length,
    };
  }
  
  // Try to find a substring match
  const words = claimText.split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) {
    const searchText = words.slice(0, 3).join(" ");
    const subIndex = statementText.indexOf(searchText);
    if (subIndex >= 0) {
      return {
        start: subIndex,
        end: subIndex + searchText.length,
      };
    }
  }
  
  return { start: null, end: null };
}

/**
 * Group normalized claims by grouping keys (4.3)
 */
function groupNormalizedClaims(normalized, selectionHash, selectionMode, statementText, knownEntities) {
  const groups = new Map();
  
  for (const norm of normalized) {
    // Build grouping key
    const groupKey = buildGroupingKey(norm, selectionHash, selectionMode);
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(norm);
  }
  
  // Filter groups to ensure all grouping criteria are met
  const filteredGroups = new Map();
  for (const [key, claims] of groups.entries()) {
    if (claims.length === 1) {
      // Single claim - always include
      filteredGroups.set(key, claims);
    } else {
      // Multiple claims - verify grouping criteria
      if (verifyGroupingCriteria(claims, selectionHash, selectionMode)) {
        filteredGroups.set(key, claims);
      } else {
        // Split into individual groups
        claims.forEach((claim, idx) => {
          filteredGroups.set(`${key}_${idx}`, [claim]);
        });
      }
    }
  }
  
  return filteredGroups;
}

/**
 * Build grouping key (4.3)
 */
function buildGroupingKey(norm, selectionHash, selectionMode) {
  const parts = [
    norm.inferredType || "unknown",
    norm.normalizedNumericValue !== null ? String(norm.normalizedNumericValue) : "null",
    norm.normalizedCurrency || "null",
    norm.entityHints.company || "null",
    norm.entityHints.round || "null",
    selectionMode ? (selectionHash || "null") : "global",
  ];
  return parts.join("|");
}

/**
 * Verify grouping criteria (4.3)
 */
function verifyGroupingCriteria(claims, selectionHash, selectionMode) {
  if (claims.length <= 1) return true;
  
  // All must have same type
  const firstType = claims[0].inferredType;
  if (!claims.every(c => c.inferredType === firstType)) return false;
  
  // Numeric proximity check
  const firstValue = claims[0].normalizedNumericValue;
  if (firstValue !== null) {
    // Allow small tolerance for same figure (e.g., "$7m" vs "$7 million")
    const tolerance = 0.01; // 1% tolerance
    if (!claims.every(c => {
      if (c.normalizedNumericValue === null) return false;
      const diff = Math.abs(c.normalizedNumericValue - firstValue);
      const maxVal = Math.max(Math.abs(firstValue), Math.abs(c.normalizedNumericValue));
      return diff / maxVal <= tolerance || diff <= 1000; // Small absolute tolerance
    })) {
      return false;
    }
  }
  
  // Currency coherence
  const firstCurrency = claims[0].normalizedCurrency;
  if (firstCurrency) {
    if (!claims.every(c => !c.normalizedCurrency || c.normalizedCurrency === firstCurrency)) {
      return false;
    }
  }
  
  // Entity coherence
  const companies = claims.map(c => c.entityHints.company).filter(Boolean);
  if (companies.length > 0) {
    const uniqueCompanies = new Set(companies);
    if (uniqueCompanies.size > 1) return false;
  }
  
  const rounds = claims.map(c => c.entityHints.round).filter(Boolean);
  if (rounds.length > 0) {
    const uniqueRounds = new Set(rounds);
    if (uniqueRounds.size > 1) return false;
  }
  
  return true;
}

/**
 * Merge group into canonical claim (4.4, 4.5, 4.7)
 */
function mergeGroupIntoCanonical(groupClaims, statementText, selectionHash, selectionMode, groupKey) {
  if (groupClaims.length === 0) return null;
  
  const first = groupClaims[0];
  
  // Pick best displayText (4.4)
  const bestDisplayText = selectBestDisplayText(groupClaims, statementText);
  
  // Merge citations (4.5)
  const allCitations = new Set();
  groupClaims.forEach(c => {
    c.citations.forEach(cit => allCitations.add(cit));
  });
  const mergedCitations = Array.from(allCitations).sort((a, b) => a - b);
  
  // Reliability mapping (4.7) - conservative MIN-OF-GROUP
  const reliabilities = groupClaims.map(c => c.reliability).filter(Boolean);
  const reliabilityRank = { High: 3, Medium: 2, Low: 1 };
  const minReliability = reliabilities.length > 0
    ? reliabilities.reduce((min, r) => 
        reliabilityRank[r] < reliabilityRank[min] ? r : min, 
        reliabilities[0])
    : "Low";
  
  // Reliability score - take minimum
  const scores = groupClaims.map(c => c.reliabilityScore).filter(s => s !== null);
  const minScore = scores.length > 0 ? Math.min(...scores) : null;
  
  // Determine value, unit, currency
  let value = first.normalizedNumericValue;
  let unit = null;
  let currency = first.normalizedCurrency;
  
  if (first.normalizedPercent !== null) {
    value = first.normalizedPercent; // Store as 0-100
    unit = "%";
  } else if (value !== null && currency) {
    // For currency, keep value in base units
    unit = currency;
  }
  
  // Build deterministic ID (4.6)
  const idParts = [
    first.inferredType,
    value !== null ? String(value) : "null",
    currency || unit || "null",
    first.entityHints.company || "null",
    first.entityHints.round || "null",
    selectionMode ? (selectionHash || "null") : "global",
  ];
  const id = createHash("sha256").update(idParts.join("|")).digest("hex").substring(0, 32);
  
  // Collect raw claim IDs
  const rawClaimIds = groupClaims.map(c => c.rawClaimId);
  
  // Evidence notes
  const evidenceNotes = [];
  if (groupClaims.length > 1) {
    evidenceNotes.push(`Merged ${groupClaims.length} raw claims`);
  }
  
  // Source span - use best one
  const bestSpan = groupClaims.reduce((best, c) => {
    if (!best || !c.sourceSpan.start) return c.sourceSpan;
    if (!c.sourceSpan.start) return best;
    const bestLength = best.end && best.start ? best.end - best.start : 0;
    const cLength = c.sourceSpan.end && c.sourceSpan.start ? c.sourceSpan.end - c.sourceSpan.start : 0;
    return cLength > bestLength ? c.sourceSpan : best;
  }, null);
  
  return {
    id,
    type: first.inferredType,
    value,
    unit,
    currency,
    displayText: bestDisplayText,
    company: first.entityHints.company,
    round: first.entityHints.round,
    roleKeywords: Array.from(new Set(groupClaims.flatMap(c => c.roleKeywords))),
    anchorFamily: first.anchorFamily,
    sourceSpan: bestSpan || { start: null, end: null },
    citations: mergedCitations,
    reliability: minReliability,
    reliabilityScore: minScore,
    evidenceNotes,
    rawClaimIds,
    selectionScope: {
      selectionMode,
      selectionHash: selectionMode ? (selectionHash || null) : null,
    },
  };
}

/**
 * Select best displayText from group (4.4)
 */
function selectBestDisplayText(groupClaims, statementText) {
  if (groupClaims.length === 0) return "";
  if (groupClaims.length === 1) return groupClaims[0].claimText;
  
  // Score each claim text
  const scored = groupClaims.map(c => {
    const text = c.claimText;
    let score = 0;
    
    // Prefer longer span coverage
    if (c.sourceSpan.start !== null && c.sourceSpan.end !== null) {
      const spanLength = c.sourceSpan.end - c.sourceSpan.start;
      score += spanLength;
    }
    
    // Prefer text with role keywords
    if (c.roleKeywords.length > 0) {
      score += c.roleKeywords.length * 10;
    }
    
    // Prefer text with company and round
    if (c.entityHints.company) score += 5;
    if (c.entityHints.round) score += 5;
    
    // Prefer reasonable length (10-60 chars)
    const length = text.length;
    if (length >= 10 && length <= 60) {
      score += 20;
    } else if (length < 10) {
      score -= 10;
    } else {
      score -= (length - 60) * 0.5;
    }
    
    return { text, score, claim: c };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  let best = scored[0].text;
  
  // Fragment repair: if best text is truncated, try to enrich from statementText
  if (statementText && best.length > 0) {
    const bestClaim = scored[0].claim;
    if (bestClaim.sourceSpan.start !== null) {
      // Try to extend right context
      const endPos = bestClaim.sourceSpan.end || bestClaim.sourceSpan.start + best.length;
      const rightContext = statementText.substring(endPos, endPos + 100);
      const nextWords = rightContext.split(/\s+/).slice(0, 8).join(" ");
      if (nextWords.length > 0 && !best.endsWith(".") && !best.endsWith(",")) {
        best = best + " " + nextWords;
      }
    }
  }
  
  return best.trim();
}

/**
 * Deduplicate canonical claims by ID (4.8)
 */
function deduplicateCanonicalClaims(canonicalClaims, log) {
  const byId = new Map();
  const duplicates = [];
  
  for (const canonical of canonicalClaims) {
    if (byId.has(canonical.id)) {
      duplicates.push(canonical.id);
      // Keep best candidate
      const existing = byId.get(canonical.id);
      const best = selectBestCanonical([existing, canonical]);
      byId.set(canonical.id, best);
    } else {
      byId.set(canonical.id, canonical);
    }
  }
  
  if (duplicates.length > 0) {
    log(`[CANON][DEDUP] duplicatesFound=${duplicates.length} droppedIds=${JSON.stringify(duplicates.map(d => d.substring(0, 16)))}`);
  }
  
  return Array.from(byId.values());
}

/**
 * Select best canonical claim from candidates (4.8)
 */
function selectBestCanonical(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  
  // Score by: 1) citations count, 2) span coverage, 3) more specific type
  const scored = candidates.map(c => {
    let score = 0;
    
    // Citations count
    score += (c.citations?.length || 0) * 10;
    
    // Span coverage
    if (c.sourceSpan.start !== null && c.sourceSpan.end !== null) {
      score += (c.sourceSpan.end - c.sourceSpan.start) * 0.1;
    }
    
    // Type specificity (prefer specific over generic)
    const typeSpecificity = {
      valuation_pre_money: 3,
      valuation_post_money: 3,
      valuation_enterprise_value: 3,
      investment_amount: 2,
      ownership_percent: 2,
      secondary_purchase: 2,
      structure_term: 2,
      other_qualitative: 1,
    };
    score += typeSpecificity[c.type] || 1;
    
    return { claim: c, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored[0].claim;
}

