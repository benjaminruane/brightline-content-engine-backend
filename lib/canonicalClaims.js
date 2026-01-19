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
    statementScopeKey = null, // A3.8.10: Unique per-statement scope key for ID generation
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

  // A3.8.9: Always canonicalize, even when rawClaims is empty (will create fallback)
  if (!Array.isArray(rawClaims)) {
    rawClaims = [];
  }

  // Step 1: Normalize raw claims (4.1)
  // A3.8.9: Handle empty rawClaims - will create fallback at end
  // A3.8.8: Pass rawClaims and log for company inference
  // A3.8.36: Pass statementIndex for valuation typing diagnostics
  const entityDropLogCounter = { count: 0 };
  const normalized = rawClaims.length > 0
    ? rawClaims.map((raw, idx) => normalizeRawClaim(raw, statementText, knownEntities, idx, rawClaims, log, entityDropLogCounter, statementIndex, selectionMode, runId, reqSig))
    : [];
  
  // A3.8.2: Step 1.5: Drop junk numeric fragments BEFORE grouping and log type fixes
  let droppedRawCount = 0;
  const filteredNormalized = [];
  for (const norm of normalized) {
    const ctx = { statementText, knownEntities };
    
    // A3.8.2: Log type fixes (if type was changed from qualitative to financial)
    const hasNumeric = norm.normalizedNumericValue !== null;
    const hasCurrency = norm.normalizedCurrency !== null;
    const hasPercent = norm.normalizedPercent !== null;
    const qualitativeTypes = new Set(["other_qualitative", "business_description", "investment_thesis", "growth_strategy"]);
    const financialTypes = new Set([
      "investment_amount",
      "valuation_pre_money",
      "valuation_post_money",
      "valuation_enterprise_value",
      "ownership_percent",
      "secondary_purchase",
      "structure_term",
    ]);
    
    // Check if this was a type fix (would have been caught in normalizeRawClaim)
    // We can't easily track the "old type" here, so we'll rely on isNumericFragmentJunk
    // to catch cases that should be dropped
    // A3.8.42: Enhanced to preserve contextual claims
    
    // A3.8.45: Part A - Allow bare USD selections (selection mode only)
    // A3.8.46: Part A - Do not force type; only prevent dropping
    let allowBareUsdSelection = false;
    if (selectionMode) {
      const claimText = norm.claimText || "";
      const anchorFamily = norm.anchorFamily || "";
      const hasUsdAnchor = anchorFamily.startsWith("usd_");
      // Check if claimText matches standalone USD amount pattern
      const standaloneUsdPattern = /^\s*\$\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|mm|million|bn|b|billion)?\s*$/i;
      const matchesStandaloneUsd = standaloneUsdPattern.test(claimText.trim());
      // Check for truncation markers (ends with "," or "(")
      const hasTruncationMarker = /[,\(]$/.test(claimText.trim());
      
      if (hasUsdAnchor && matchesStandaloneUsd && !hasTruncationMarker) {
        allowBareUsdSelection = true;
        const anchor = norm.anchorFamily || "none";
        const preview = claimText.substring(0, 60);
        if (runId && reqSig && log) {
          log(`[DIAG][A3.8.46][BARE_USD_ALLOW] anchor=${anchor} preview="${preview}"`);
        }
        // A3.8.46: Only prevent dropping; do not force any type here
        // Type will be determined by normal USD typing logic (see Part B)
        // Don't drop - add to filtered
        filteredNormalized.push(norm);
        continue;
      }
    }
    
    // A3.8.42: Check if would be dropped, but guard keeps it
    const wouldBeJunk = isNumericFragmentJunk(norm, ctx);
    if (wouldBeJunk) {
      // A3.8.42: Check if guard kept it due to context
      const claimText = norm.claimText || "";
      const textLower = claimText.toLowerCase();
      const hasTimeBasis = /\b(per\s+month|\/mo|monthly|per\s+year|annual|annualized|run-?rate|arr|mrr)\b/i.test(claimText);
      const hasValuationWords = /\b(valuation|pre-?money|post-?money|premoney|postmoney)\b/i.test(claimText);
      const hasEVWords = /\b(enterprise\s+value|\bev\b(?!\w))\b/i.test(claimText);
      const hasMetricWords = /\b(revenue|subscription|pricing|fees|take\s+rate|gmv)\b/i.test(claimText);
      
      // If it has context, it shouldn't be dropped (but check statement context too)
      if (!hasTimeBasis && !hasValuationWords && !hasEVWords && !hasMetricWords) {
        // Check statement context
        const statementText = ctx.statementText || "";
        if (statementText && norm.normalizedCurrency) {
          const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
          if (usdMatch) {
            const usdIndex = statementText.indexOf(usdMatch[0]);
            if (usdIndex >= 0) {
              const contextStart = Math.max(0, usdIndex - 80);
              const contextEnd = Math.min(statementText.length, usdIndex + usdMatch[0].length + 80);
              const contextWindow = statementText.substring(contextStart, contextEnd).toLowerCase();
              const hasContextTimeBasis = /\b(per\s+month|\/mo|monthly|per\s+year|annual|annualized|run-?rate|arr|mrr)\b/i.test(contextWindow);
              const hasContextValuation = /\b(valuation|pre-?money|post-?money|premoney|postmoney)\b/i.test(contextWindow);
              const hasContextEV = /\b(enterprise\s+value|\bev\b(?!\w))\b/i.test(contextWindow);
              const hasContextMetric = /\b(revenue|subscription|pricing|fees|take\s+rate|gmv)\b/i.test(contextWindow);
              
              if (hasContextTimeBasis || hasContextValuation || hasContextEV || hasContextMetric) {
                // Guard kept it - log and don't drop
                const keptBecause = [];
                if (hasContextTimeBasis) keptBecause.push("basis");
                if (hasContextValuation) keptBecause.push("valuation_ctx");
                if (hasContextEV) keptBecause.push("ev_ctx");
                if (hasContextMetric) keptBecause.push("metric_ctx");
                const preview = claimText.substring(0, 60);
                const anchor = norm.anchorFamily || "none";
                if (selectionMode && runId && reqSig) {
                  log(`[A3.8.42][DROP_GUARD] idx=${statementIndex} anchor=${anchor} preview="${preview}" keptBecause=[${keptBecause.join(",")}]`);
                }
                // Don't drop - add to filtered
                filteredNormalized.push(norm);
                continue;
              }
            }
          }
        }
      } else {
        // Has context in claimText - guard kept it
        const keptBecause = [];
        if (hasTimeBasis) keptBecause.push("basis");
        if (hasValuationWords) keptBecause.push("valuation_ctx");
        if (hasEVWords) keptBecause.push("ev_ctx");
        if (hasMetricWords) keptBecause.push("metric_ctx");
        const preview = claimText.substring(0, 60);
        const anchor = norm.anchorFamily || "none";
        if (selectionMode && runId && reqSig) {
          log(`[A3.8.42][DROP_GUARD] idx=${statementIndex} anchor=${anchor} preview="${preview}" keptBecause=[${keptBecause.join(",")}]`);
        }
        // Don't drop - add to filtered
        filteredNormalized.push(norm);
        continue;
      }
      
      // Actually junk - drop it
      droppedRawCount++;
      if (droppedRawCount <= 10) {
        const preview = (norm.claimText || "").substring(0, 60);
        const anchor = norm.anchorFamily || "none";
        log(`[CANON][DROP_RAW] reason=numeric_fragment anchor=${anchor} preview="${preview}"`);
      }
    } else {
      // A3.8.2: Log type fixes
      if (norm._typeFixInfo) {
        const preview = (norm.claimText || "").substring(0, 60);
        log(`[CANON][FIX_TYPE] from=${norm._typeFixInfo.from} to=${norm._typeFixInfo.to} preview="${preview}"`);
      }
      filteredNormalized.push(norm);
    }
  }
  
  // [CANON][NORMALIZE]
  const typeCounts = {};
  filteredNormalized.forEach(n => {
    const type = n.inferredType || "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  log(`[CANON][NORMALIZE] ${JSON.stringify(typeCounts)}`);

  // Step 2: Group by grouping keys (4.3)
  const groups = groupNormalizedClaims(filteredNormalized, computedSelectionHash, selectionMode, statementText, knownEntities);
  
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
  // A3.8.8: Pass log for invariant checking
  // A3.8.10: Pass statementScopeKey for unique ID generation
  const merged = [];
  const invariantLogCounter = { count: 0 };
  const typeFixLogCounter = { count: 0 };
  for (const [groupKey, groupClaims] of groups.entries()) {
    const canonical = mergeGroupIntoCanonical(groupClaims, statementText, computedSelectionHash, selectionMode, groupKey, log, invariantLogCounter, statementScopeKey);
    if (canonical) {
      // A3.8.41: Add statementIndex to canonical for signal preservation logging
      canonical._statementIndex = statementIndex;
      // A3.8.10: Enforce type invariants before adding to merged list
      // A3.8.43: Handle null return (dropped claim)
      const fixedCanonical = enforceCanonicalTypeInvariants(canonical, statementText, statementIndex, log, typeFixLogCounter);
      if (!fixedCanonical) {
        continue; // Claim was dropped due to invariant violation
      }
      
      // A3.8.35: Split secondary purchase claims that contain both USD amount and ownership percentage
      const splitClaims = splitSecondaryAndOwnership(fixedCanonical, statementText, computedSelectionHash, selectionMode, statementScopeKey, log);
      if (splitClaims.length > 0) {
        merged.push(...splitClaims);
      } else {
        merged.push(fixedCanonical);
      }
    }
  }

  // Step 4: A3.8.35 - Guardrail validation (selection mode only)
  if (selectionMode) {
    for (const claim of merged) {
      validateClaimGuardrails(claim, statementIndex, log);
    }
  }
  
  // Step 5: Deduplicate by canonical ID (4.8)
  const deduplicatedResult = deduplicateCanonicalClaims(merged, log);
  const deduplicated = deduplicatedResult.claims;
  const dedupDroppedCount = deduplicatedResult.droppedCount || 0;
  const mergedGroupsCount = merged.length;
  
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

  // Step 6: Invariant check (selection isolation)
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

  // A3.8.9: Step 7: Qualitative fallback canonical claim (hard invariant - always create if empty)
  let finalCanonical = deduplicated;
  if (finalCanonical.length === 0) {
    const fallbackCtx = {
      knownEntities,
      runId,
      reqSig,
      statementIndex,
      assessment: ctx.assessment || {},
      statementScopeKey: statementScopeKey, // A3.8.10: Pass statementScopeKey for unique ID
    };
    // A3.8.9: Prefer resolved statement-level citations if available
    const citationsFromStatement = ctx.citationsFromStatement || null;
    const fallbackClaim = createQualitativeFallbackClaim(statementText, fallbackCtx, computedSelectionHash, selectionMode, citationsFromStatement);
    if (fallbackClaim) {
      // A3.8.10: Enforce type invariants on fallback claim
      const typeFixLogCounter = { count: 0 };
      const fixedFallback = enforceCanonicalTypeInvariants(fallbackClaim, statementText, statementIndex, log, typeFixLogCounter);
      finalCanonical = [fixedFallback];
      log(`[CANON][FALLBACK_QUAL] idx=${statementIndex} created=true`);
    } else {
      // A3.8.9: Hard invariant - must create fallback, log error if creation failed
      log(`[CANON][FALLBACK_QUAL] idx=${statementIndex} created=false ERROR=fallback_creation_failed`);
      // Create minimal fallback as last resort
      const minimalFallback = {
        id: createHash("sha256").update(`fallback_${statementIndex}_${computedSelectionHash || "global"}`).digest("hex").substring(0, 32),
        type: "other_qualitative",
        value: null,
        unit: null,
        currency: null,
        displayText: statementText.trim().substring(0, 140),
        company: null,
        round: null,
        roleKeywords: [],
        anchorFamily: null,
        sourceSpan: { start: null, end: null },
        citations: [],
        reliability: "Medium",
        reliabilityScore: null,
        evidenceNotes: ["Qualitative fallback claim (minimal)"],
        rawClaimIds: [],
        selectionScope: {
          selectionMode,
          selectionHash: selectionMode ? (computedSelectionHash || null) : null,
        },
      };
      finalCanonical = [minimalFallback];
      log(`[CANON][FALLBACK_QUAL] idx=${statementIndex} created=true minimal=true`);
    }
  }

  // A3.8.39: Step 8: Sanitize unit/currency invariants
  const unitFixLogCounter = { count: 0 };
  finalCanonical = finalCanonical.map(claim => {
    const sanitized = sanitizeCanonicalUnits(claim, statementIndex, log, unitFixLogCounter);
    // A3.8.41: Log signal preservation with statementIndex now that we have it
    if (sanitized.signalAnchors && Array.isArray(sanitized.signalAnchors) && sanitized.signalAnchors.length > 1) {
      const isQualitative = sanitized.type === "other_qualitative" || 
                            sanitized.type === "business_description" ||
                            sanitized.type === "investment_thesis" ||
                            sanitized.type === "growth_strategy";
      if (isQualitative && log) {
        log(`[A3.8.41][QUAL_SIGNAL_PRESERVE] idx=${statementIndex} canonType=${sanitized.type} anchorFamily=${sanitized.anchorFamily || "null"} signalAnchors=[${sanitized.signalAnchors.join(",")}]`);
      }
    }
    return sanitized;
  });

  // A3.8.2: Count financial vs qualitative
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  const finCount = finalCanonical.filter(c => financialTypes.has(c.type)).length;
  const qualCount = finalCanonical.length - finCount;

  // [CANON][END]
  const elapsedMs = Date.now() - startTime;
  log(`[CANON][END] canonicalClaimsCount=${finalCanonical.length} elapsedMs=${elapsedMs}`);

  // A3.8.2: CANON_SUMMARY will be logged in analyse-statements-impl.js after reasons are finalized

  return {
    canonicalClaims: finalCanonical,
    diagnostics: {
      rawCount: rawClaims.length,
      canonicalCount: finalCanonical.length,
      groupsFormed: groups.size,
      selectionLeakageDetected,
      droppedRawCount,
      mergedGroupsCount,
      dedupDroppedCount,
      finCount,
      qualCount,
    },
  };
}

/**
 * Normalize a raw claim (4.1)
 * A3.8.8: Added rawClaims, log, and logCounter parameters for company inference
 * A3.8.36: Added statementIndex parameter for valuation typing diagnostics
 */
function normalizeRawClaim(raw, statementText, knownEntities, idx, rawClaims = null, log = null, logCounter = { count: 0 }, statementIndex = 0, selectionMode = false, runId = null, reqSig = null) {
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
  
  let claimText = raw.claimText || "";
  const anchor = raw.anchor || null;
  
  // A3.8.44: Derive anchorFamily early to avoid TDZ (before preferDollar/preferPercent logic)
  // A3.8.35: Pass statementText for unit pricing context detection
  // A3.8.42: Normalize money anchors for consistency
  let anchorFamily = anchor || inferAnchorFamily(claimText, null, statementText);
  const normalizedAnchor = normalizeMoneyAnchor(anchorFamily);
  if (normalizedAnchor !== anchorFamily && selectionMode && runId && reqSig && log) {
    const claimPreview = claimText.substring(0, 60);
    log(`[A3.8.42][ANCHOR_NORM] idx=${statementIndex} before=${anchorFamily} after=${normalizedAnchor} claimPreview="${claimPreview}"`);
  }
  anchorFamily = normalizedAnchor;
  
  // Extract numeric value, currency, percent
  // A3.8.35: Pass statementText for unit pricing context detection
  // A3.8.43: Part D - Determine preference based on anchorFamily for numeric binding
  let preferDollar = false;
  let preferPercent = false;
  if (anchorFamily) {
    const normalizedAnchorForPref = normalizeAnyAnchor(anchorFamily);
    if (normalizedAnchorForPref && normalizedAnchorForPref.startsWith("usd_")) {
      preferDollar = true;
    } else if (normalizedAnchorForPref && normalizedAnchorForPref.startsWith("pct_")) {
      preferPercent = true;
    }
  }
  
  // A3.8.44: DIAG log for anchorFamily (selection mode only, first 3 rawClaims per statement)
  if (selectionMode && logCounter.count < 3 && runId && reqSig && log) {
    logCounter.count++;
    log(`[DIAG][A3.8.44][RAW_NORM] anchor=${anchor || "none"} anchorFamily=${anchorFamily} preferDollar=${preferDollar} preferPercent=${preferPercent}`);
  }
  
  const numeric = extractNumericValue(claimText, statementText, preferDollar, preferPercent);
  const currency = extractCurrency(claimText);
  const percent = extractPercent(claimText);
  
  // A3.8.35: Log unit pricing guardrail trigger (selection mode only)
  if (numeric._unitPricing && log) {
    const rawAmount = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
    const contextPreview = statementText ? statementText.substring(Math.max(0, statementText.indexOf(claimText) - 20), Math.min(statementText.length, statementText.indexOf(claimText) + claimText.length + 40)) : claimText;
    log(`[NUM_REPAIR][UNIT_PRICE_GUARD] raw="${rawAmount ? rawAmount[0] : 'unknown'}" context="${contextPreview.substring(0, 60)}..." normalized=${numeric.value} preventedScale="million"`);
  }
  
  // A3.8.42: Part C - Expand bare money claims using statement context (selection mode only)
  let expandedType = null;
  if (selectionMode && statementText && currency && numeric.value !== null) {
    // Check if this is a "bare money" claim (short, money-only)
    const isBareMoney = claimText.trim().length < 50 && 
                        /^\$[\d,]+(?:\.\d+)?\s*(million|mm|m|billion|b)?\s*$/i.test(claimText.trim());
    
    if (isBareMoney) {
      // Find USD amount position in statement
      const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
      if (usdMatch) {
        const usdIndex = statementText.indexOf(usdMatch[0]);
        if (usdIndex >= 0) {
          const expansion = expandMoneyClaimFromStatement(statementText, numeric.value, usdIndex);
          if (expansion.expandedText) {
            claimText = expansion.expandedText;
            expandedType = expansion.contextType;
            if (log && runId && reqSig) {
              const beforePreview = raw.claimText.substring(0, 40);
              const afterPreview = claimText.substring(0, 60);
              log(`[A3.8.42][MONEY_EXPAND] idx=${statementIndex} value=${numeric.value} decidedType=${expandedType} beforePreview="${beforePreview}" afterPreview="${afterPreview}"`);
            }
          }
        }
      }
    }
  }
  
  // Extract role keywords (use expanded claimText if available)
  const roleKeywordsRaw = extractRoleKeywords(claimText);
  
  // A3.8.12: Prevent "ownership" roleKeyword for metric/growth types
  // Check if this looks like a metric or growth claim before adding ownership
  const hasMetricKeywords = /\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized|customers)\b/i.test(claimText);
  const hasGrowthKeywords = /\b(yoy|year-over-year|year\s+over\s+year|growth|growth\s+rate)\b/i.test(claimText);
  const hasExplicitOwnership = /\b(ownership|own|stake|equity|fully\s+diluted|FD|%\s+of\s+company|cap\s+table)\b/i.test(claimText);
  
  // Remove "ownership" if it was added by the "%" pattern but this is a metric/growth claim
  const roleKeywords = (hasMetricKeywords || hasGrowthKeywords) && !hasExplicitOwnership && roleKeywordsRaw.includes("ownership")
    ? roleKeywordsRaw.filter(kw => kw !== "ownership")
    : roleKeywordsRaw;
  
  // Extract entity hints (A3.8.8: pass rawClaims and log for inference)
  const entityHints = {
    company: extractCompany(claimText, knownEntities.company, statementText, rawClaims, log, logCounter),
    round: extractRound(claimText, knownEntities.round, statementText),
  };
  
  // Infer canonical type (A3.8.2: pass roleKeywords, A3.8.36: pass statementText for valuation context)
  // A3.8.42: Use expandedType if available (from money expansion)
  // A3.8.46: Pass selectionMode for bare USD selection handling
  let inferredType = expandedType || inferCanonicalType(claimText, numeric, currency, percent, anchorFamily, roleKeywords, statementText, idx, log, selectionMode);
  
  // A3.8.11: Log percent type decision for debugging (use statementIndex from context if available)
  // Note: idx here is the raw claim index, not statement index - logging will happen at statement level if needed
  
  // A3.8.2: Enforce type invariant - if has numeric value AND currency/percent, MUST be financial
  const hasNumeric = numeric.value !== null;
  const hasCurrency = currency !== null;
  const hasPercent = percent.value !== null;
  const qualitativeTypes = new Set(["other_qualitative", "business_description", "investment_thesis", "growth_strategy"]);
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  
  let typeFixInfo = null; // Store for logging
  if (hasNumeric && (hasCurrency || hasPercent) && qualitativeTypes.has(inferredType)) {
    // Force re-typing using role keywords
    const oldType = inferredType;
    inferredType = inferCanonicalType(claimText, numeric, currency, percent, anchorFamily, roleKeywords, statementText, idx, log, selectionMode);
    
    // Store type fix info for logging
    if (financialTypes.has(inferredType)) {
      typeFixInfo = { from: oldType, to: inferredType };
    }
    // If still qualitative, will be caught by isNumericFragmentJunk and dropped
  }
  
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
    _typeFixInfo: typeFixInfo, // A3.8.2: Store type fix info for logging
  };
}

/**
 * Extract numeric value from claim text
 * A3.8.35: Added unit pricing guardrails to prevent small-$ amounts from being normalized as millions
 * A3.8.43: Part D - Added preferDollar/preferPercent for nearest-symbol binding when both $ and % present
 */
function extractNumericValue(text, statementText = null, preferDollar = false, preferPercent = false) {
  // A3.8.35: Check for unit pricing context before processing
  const hasUnitPricingContext = checkUnitPricingContext(text, statementText);
  
  // A3.8.43: Part D - Nearest symbol scan when both $ and % present
  const hasDollar = /\$/.test(text);
  const hasPercent = /%/.test(text);
  
  if (hasDollar && hasPercent && (preferDollar || preferPercent)) {
    if (preferDollar) {
      // Find $ token and parse number immediately following it
      const dollarIndex = text.indexOf("$");
      if (dollarIndex >= 0) {
        const afterDollar = text.substring(dollarIndex + 1);
        // Match: $X or $Xm or $X million, etc.
        const dollarMatch = afterDollar.match(/^\s*([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)?/i);
        if (dollarMatch) {
          const numStr = dollarMatch[1].replace(/,/g, "");
          const unit = (dollarMatch[2] || "").toLowerCase();
          const num = parseFloat(numStr);
          if (Number.isFinite(num) && num > 0) {
            if (hasUnitPricingContext && num >= 1 && num <= 5000) {
              return { value: num, hasCurrency: true, _unitPricing: true };
            }
            let normalized = num;
            if (unit.includes("billion") || unit === "b") {
              normalized = normalized * 1000;
            } else if (unit.includes("thousand") || unit === "k") {
              normalized = normalized / 1000;
            }
            if (unit) {
              return { value: normalized * 1e6, hasCurrency: true };
            } else {
              return { value: num, hasCurrency: true };
            }
          }
        }
      }
    } else if (preferPercent) {
      // Find % token and parse number immediately preceding it
      const percentIndex = text.indexOf("%");
      if (percentIndex >= 0) {
        const beforePercent = text.substring(0, percentIndex);
        // Match: X% (number before %)
        const percentMatch = beforePercent.match(/([\d,]+(?:\.\d+)?)\s*$/);
        if (percentMatch) {
          const num = parseFloat(percentMatch[1].replace(/,/g, ""));
          if (Number.isFinite(num) && num > 0) {
            return { value: num, hasCurrency: false, hasPercent: true };
          }
        }
      }
    }
  }
  
  // Currency patterns: $7m, $7 million, $7mm
  const currencyMatch = text.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)/i);
  if (currencyMatch) {
    const numStr = currencyMatch[1].replace(/,/g, "");
    const unit = (currencyMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      // A3.8.35: Unit pricing guardrail - if amount is in unit pricing range and context is present, treat as literal dollars
      if (hasUnitPricingContext && num >= 1 && num <= 5000) {
        // Treat as unit price (no million scaling)
        return { value: num, hasCurrency: true, _unitPricing: true };
      }
      
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
      // A3.8.35: Unit pricing guardrail - check context for plain currency too
      if (hasUnitPricingContext && num >= 1 && num <= 5000) {
        return { value: num, hasCurrency: true, _unitPricing: true };
      }
      return { value: num, hasCurrency: true };
    }
  }
  
  return { value: null, hasCurrency: false };
}

/**
 * A3.8.35: Check if text contains unit pricing context indicators
 * Returns true if unit pricing triggers are found within ±40 chars of the number
 * Exported for use in analyse-statements-impl.js
 */
export function checkUnitPricingContext(text, statementText = null) {
  if (!text || typeof text !== "string") return false;
  
  const lower = text.toLowerCase();
  const contextText = statementText ? statementText.toLowerCase() : lower;
  
  // Unit pricing triggers (case-insensitive)
  const unitPricingTriggers = [
    /\bper\s+month\b/i,
    /\b\/month\b/i,
    /\bmonthly\b/i,
    /\bper\s+user\b/i,
    /\bper\s+seat\b/i,
    /\bper\s+license\b/i,
    /\bsubscription\b/i,
    /\bpricing\b/i,
    /\btiered\s+subscription\b/i,
    /\bplan\b/i,
    /\barpu\b/i,
    /\baverage\b/i,
  ];
  
  // Find $ amount in text
  const usdMatch = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!usdMatch) return false;
  
  const matchIndex = usdMatch.index;
  const matchEnd = matchIndex + usdMatch[0].length;
  
  // Check context within ±40 chars
  const contextStart = Math.max(0, matchIndex - 40);
  const contextEnd = Math.min(contextText.length, matchEnd + 40);
  const contextWindow = contextText.substring(contextStart, contextEnd);
  
  // Check if any trigger matches in context window
  for (const trigger of unitPricingTriggers) {
    if (trigger.test(contextWindow)) {
      return true;
    }
  }
  
  return false;
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
 * A3.8.42: Normalize money anchor keys (dot/underscore consistency)
 * Ensures all USD anchors use underscores consistently (e.g., usd_18.7m -> usd_18_7m)
 * Exported for use in analyse-statements-impl.js
 */
/**
 * A3.8.43: Normalize money anchors by replacing dots with underscores
 * Handles: usd_18.7m -> usd_18_7m, usd_5.5m -> usd_5_5m
 * Also collapses multiple consecutive underscores
 */
export function normalizeMoneyAnchor(anchor) {
  if (!anchor || typeof anchor !== "string") return anchor;
  
  // Only apply to money anchors (usd_, aud_, eur_, etc.)
  if (!/^(usd|aud|eur|gbp|sgd|cad|jpy|cny)_/.test(anchor.toLowerCase())) {
    return anchor;
  }
  
  // Replace dots with underscores in the numeric portion
  // Pattern: currency_prefix_number_with_dots_suffix
  // e.g., usd_18.7m -> usd_18_7m, usd_5.5m -> usd_5_5m
  let normalized = anchor.replace(/\./g, "_");
  
  // Replace multiple consecutive underscores with single underscore
  normalized = normalized.replace(/_+/g, "_");
  
  return normalized;
}

/**
 * A3.8.43: Check if an anchor is a money anchor
 */
export function isMoneyAnchor(anchor) {
  if (!anchor || typeof anchor !== "string") return false;
  return /^usd_/i.test(anchor);
}

/**
 * A3.8.43: Normalize any anchor (money anchors get normalized, others pass through)
 */
export function normalizeAnyAnchor(anchor) {
  if (!anchor || typeof anchor !== "string") return anchor;
  return isMoneyAnchor(anchor) ? normalizeMoneyAnchor(anchor) : anchor;
}

/**
 * Infer anchor family from claim text or anchor
 * A3.8.35: Enhanced unit pricing detection
 * A3.8.42: Normalize money anchors for consistency
 */
function inferAnchorFamily(claimText, anchor = null, statementText = null) {
  if (anchor) {
    // A3.8.42: Normalize money anchor before returning
    return normalizeMoneyAnchor(anchor);
  }
  
  // Try to extract from claim text
  // A3.8.35: Check for unit pricing context first
  const hasUnitPricingContext = checkUnitPricingContext(claimText, statementText);
  
  const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm\b|m\b|billion|b\b|thousand|k\b)?/i);
  if (usdMatch) {
    const numStr = usdMatch[1].replace(/,/g, "");
    const unit = (usdMatch[2] || "").toLowerCase();
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num > 0) {
      // A3.8.35: Unit pricing guardrail - if amount is in unit pricing range and context is present, use unit pricing anchor
      if (hasUnitPricingContext && num >= 1 && num <= 5000) {
        // Use unit pricing anchor (no "m" suffix)
        const anchor = `usd_${num}`;
        // A3.8.42: Normalize money anchor
        return normalizeMoneyAnchor(anchor);
      }
      
      // A3.8.28: Fix $45 -> $45m bug - if "m" suffix and following text starts with "month", treat as no suffix
      if (unit === "m") {
        const matchIndex = usdMatch.index + usdMatch[0].length;
        const followingText = claimText.substring(matchIndex).trim();
        if (/^month|^monthly|^mo\b/i.test(followingText)) {
          // Treat as plain USD (no million suffix)
          const anchor = `usd_${num}`;
          // A3.8.42: Normalize money anchor
          return normalizeMoneyAnchor(anchor);
        }
      }
      
      let normalized = num;
      if (unit.includes("billion") || unit === "b") {
        normalized = normalized * 1000;
      } else if (unit.includes("thousand") || unit === "k") {
        normalized = normalized / 1000;
      }
      // A3.8.37: Only add "m" suffix if there was an explicit unit (million/mm/m/billion/b/thousand/k)
      // OR if the numeric value is >= 1,000,000 (actual millions)
      // For small values like $45 with no unit, return "usd_45" (no "m")
      let anchor;
      if (unit) {
        // Explicit unit present - use "m" suffix
        anchor = `usd_${normalized}m`;
      } else if (num >= 1000000) {
        // Large value without explicit unit but clearly in millions
        anchor = `usd_${normalized}m`;
      } else {
        // Small value without explicit unit - no "m" suffix
        anchor = `usd_${num}`;
      }
      // A3.8.42: Normalize money anchor
      return normalizeMoneyAnchor(anchor);
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
 * Extract role keywords from claim text (A3.8.2: improved coverage)
 */
function extractRoleKeywords(text) {
  const keywords = [];
  const lower = text.toLowerCase();
  
  const rolePatterns = [
    { pattern: /\b(invest|investing|investment|check|commit|deploy|participate)\b/i, keyword: "investment" },
    { pattern: /\b(financing|finance|funding|round|Series|Seed)\b/i, keyword: "financing" },
    { pattern: /\b(valuation|value|valued|pre-money|premoney|post-money|postmoney|enterprise\s+value|EV)\b/i, keyword: "valuation" },
    // A3.8.12: Metric keywords (before ownership to prevent false matches)
    { pattern: /\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized|customers|user\s+base|active\s+users)\b/i, keyword: "metric" },
    { pattern: /\b(yoy|year-over-year|year\s+over\s+year|growth|growth\s+rate)\b/i, keyword: "growth" },
    // A3.8.12: Ownership pattern - only match explicit ownership phrases, not just "%"
    { pattern: /\b(ownership|own|stake|equity|fully\s+diluted|FD|%\s+of\s+company|cap\s+table)\b/i, keyword: "ownership" },
    { pattern: /\b(secondary|buying\s+shares|existing\s+shareholders|purchase|sale)\b/i, keyword: "secondary" },
    { pattern: /\b(preferred|SAFE|convertible|note|liquidation\s+preference)\b/i, keyword: "structure" },
  ];
  
  for (const { pattern, keyword } of rolePatterns) {
    if (pattern.test(lower)) {
      keywords.push(keyword);
    }
  }
  
  return keywords;
}

/**
 * A3.8.8: Check if entity token is junk (stopwords, generic finance terms, etc.)
 */
function isJunkEntityToken(str) {
  if (!str || typeof str !== "string") return true;
  
  let normalized = str.trim();
  
  // Strip possessive trailing: /'s$/ -> ""
  normalized = normalized.replace(/'s$/, "");
  
  // Remove punctuation/quotes for comparison
  normalized = normalized.replace(/[.,;:!?"'()\[\]{}]/g, "");
  
  const lower = normalized.toLowerCase();
  
  // Determiners / pronouns / glue words
  const stopwords = new Set([
    "the", "a", "an", "this", "that", "these", "those",
    "it", "its", "their", "our", "we", "they", "i", "you", "he", "she"
  ]);
  if (stopwords.has(lower)) {
    return true;
  }
  
  // Generic finance tokens that are NOT companies
  const financeTokens = new Set([
    "series", "financing", "round", "valuation", "pre-money", "post-money",
    "enterprise", "ev", "ownership", "stake", "investment", "capital",
    "money", "usd", "dollars", "million", "billion", "percent",
    "fully", "diluted"
  ]);
  if (financeTokens.has(lower)) {
    return true;
  }
  
  // Any single word of length <= 2
  if (normalized.length <= 2) {
    return true;
  }
  
  // Any token that is purely numeric or currency symbol based
  if (/^[\d$€£¥]+$/.test(normalized)) {
    return true;
  }
  
  return false;
}

/**
 * A3.8.8: Normalize entity name (with junk filtering)
 */
function normalizeEntity(str, log = null, logCounter = { count: 0 }) {
  if (!str || typeof str !== "string") return null;
  
  let normalized = str.trim();
  const original = normalized;
  
  // Strip possessive trailing: /'s$/ -> ""
  normalized = normalized.replace(/'s$/, "");
  
  // Remove punctuation/quotes
  normalized = normalized.replace(/[.,;:!?"'()\[\]{}]/g, "");
  
  // Check if junk (case-insensitive, after punctuation removal)
  if (isJunkEntityToken(normalized)) {
    // Log entity drop (limited)
    if (log && logCounter.count < 5) {
      log(`[CANON][ENTITY_DROP] raw="${original}" normalized="${normalized}"`);
      logCounter.count++;
    }
    return null;
  }
  
  return normalized;
}

/**
 * A3.8.2: Normalize round from text
 */
function normalizeRoundFromText(text) {
  if (!text || typeof text !== "string") return null;
  
  // Series A/B/C/D
  const seriesMatch = text.match(/Series\s+([A-D])/i);
  if (seriesMatch) {
    return `Series ${seriesMatch[1].toUpperCase()}`;
  }
  
  // Seed
  if (/\bSeed\b/i.test(text)) {
    return "Seed";
  }
  
  // Pre-Seed
  if (/\bPre-Seed\b/i.test(text)) {
    return "Pre-Seed";
  }
  
  return null;
}

/**
 * A3.8.8: Infer company from statement text and raw claims
 */
function inferCompanyFromText(statementText, rawClaims) {
  if (!statementText || typeof statementText !== "string") {
    return null;
  }
  
  const candidates = [];
  
  // (A) From rawClaims claimText
  if (Array.isArray(rawClaims)) {
    for (const raw of rawClaims) {
      const claimText = raw?.claimText || "";
      if (!claimText) continue;
      
      // Find proper-noun-ish tokens (capitalized, not junk)
      const words = claimText.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        // Check for possessive: "Shopify's" -> "Shopify"
        const baseWord = word.replace(/'s$/, "");
        
        // Check if capitalized and not junk
        if (/^[A-Z][a-z]+/.test(baseWord) && !isJunkEntityToken(baseWord)) {
          const normalized = normalizeEntity(baseWord);
          if (normalized) {
            candidates.push({
              text: normalized,
              source: "claimText",
              position: i,
              hasPossessive: word.endsWith("'s"),
            });
          }
        }
      }
    }
  }
  
  // (B) From statementText directly (first ~120 chars)
  const stmtPrefix = statementText.substring(0, 120);
  const stmtWords = stmtPrefix.split(/\s+/);
  for (let i = 0; i < stmtWords.length; i++) {
    const word = stmtWords[i];
    const baseWord = word.replace(/'s$/, "");
    
    if (/^[A-Z][a-z]+/.test(baseWord) && !isJunkEntityToken(baseWord)) {
      const normalized = normalizeEntity(baseWord);
      if (normalized) {
        candidates.push({
          text: normalized,
          source: "statementText",
          position: i,
          hasPossessive: word.endsWith("'s"),
        });
      }
    }
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  // (C) Prefer candidates near investment/valuation/ownership keywords
  const financeKeywords = /\b(invest|investment|financing|round|valuation|ownership|stake|equity)\b/i;
  const scoredCandidates = candidates.map(c => {
    let score = 0;
    
    // Prefer possessive forms
    if (c.hasPossessive) {
      score += 10;
    }
    
    // Prefer earlier position
    score += (100 - c.position) * 0.1;
    
    // Check context around candidate in statementText
    const candidateIndex = statementText.indexOf(c.text);
    if (candidateIndex >= 0) {
      const context = statementText.substring(
        Math.max(0, candidateIndex - 30),
        Math.min(statementText.length, candidateIndex + c.text.length + 30)
      );
      if (financeKeywords.test(context)) {
        score += 20;
      }
    }
    
    return { ...c, score };
  });
  
  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  // Return best candidate
  return scoredCandidates[0].text;
}

/**
 * A3.8.8: Extract company name from claim text or use known entity (with inference fallback)
 */
function extractCompany(text, knownCompany = null, statementText = null, rawClaims = null, log = null, logCounter = { count: 0 }) {
  // Use known entity if available
  if (knownCompany) {
    const normalized = normalizeEntity(knownCompany, log, logCounter);
    if (normalized) return normalized;
  }
  
  // Try to extract from claim text
  const words = text.split(/\s+/);
  const capitalized = words.filter(w => /^[A-Z][a-z]+/.test(w) && w.length > 2);
  
  // Filter out junk tokens
  const candidates = [];
  for (const word of capitalized) {
    const baseWord = word.replace(/'s$/, "");
    if (!isJunkEntityToken(baseWord)) {
      const normalized = normalizeEntity(baseWord, log, logCounter);
      if (normalized) {
        candidates.push(normalized);
      }
    }
  }
  
  if (candidates.length > 0) {
    return candidates[0];
  }
  
  // A3.8.8: Inference fallback - prefer extracting from statement text when raw claim company is null/junk
  if (statementText) {
    const inferred = inferCompanyFromText(statementText, rawClaims);
    if (inferred) {
      return inferred;
    }
  }
  
  return null;
}

/**
 * Extract round from claim text or use known entity (A3.8.2: improved)
 */
function extractRound(text, knownRound = null, statementText = null) {
  // Use known entity if available
  if (knownRound) {
    const normalized = normalizeRoundFromText(knownRound);
    if (normalized) return normalized;
  }
  
  // Try to extract from claim text
  let round = normalizeRoundFromText(text);
  if (round) return round;
  
  // A3.8.2: Inference fill - try statementText if claim text didn't have it
  if (statementText) {
    round = normalizeRoundFromText(statementText);
    if (round) return round;
  }
  
  return null;
}

/**
 * Infer canonical type (A3.8.2: improved with role keywords and invariant enforcement)
 * A3.8.36: Added valuation semantic typing (INV-3)
 */
function inferCanonicalType(claimText, numeric, currency, percent, anchorFamily, roleKeywords = [], statementText = null, statementIndex = 0, log = null, selectionMode = false) {
  const lower = claimText.toLowerCase();
  const hasNumeric = numeric && (numeric.value !== null || numeric.hasCurrency);
  const hasCurrency = currency !== null;
  const hasPercent = percent && percent.hasPercent;
  
  // A3.8.2: Hard invariant - if has numeric value AND (currency OR percent), MUST be financial type
  if (hasNumeric && (hasCurrency || hasPercent)) {
    // A3.8.36: INV-3 - Valuation semantic typing (for USD amounts)
    // A3.8.57: Use local context window classification (currency context-window classifier)
    if (hasCurrency && statementText) {
      // Find USD amount in claimText
      const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
      if (usdMatch) {
        // A3.8.57: Extract sourceSpan for local context window
        const sourceSpan = extractSourceSpan(claimText, statementText);
        const { windowText, anchorMid } = getCurrencyContextWindow(statementText, sourceSpan, 80);
        const classification = classifyCurrencyByLocalContext(windowText, anchorMid);
        
        // A3.8.57: Use classification result for type decision
        const chosenFamily = classification.chosenFamily;
        const matchIndex = claimText.indexOf(usdMatch[0]);
        const claimIndexInStatement = statementText.indexOf(claimText);
        
        // Keep existing contextWindow for fallback and logging (legacy support)
        const contextStart = Math.max(0, (claimIndexInStatement >= 0 ? claimIndexInStatement : 0) + matchIndex - 40);
        const contextEnd = Math.min(statementText.length, (claimIndexInStatement >= 0 ? claimIndexInStatement : 0) + matchIndex + usdMatch[0].length + 40);
        let contextWindow = statementText.substring(contextStart, contextEnd).toLowerCase();
        
        // A3.8.40: Cap context window to prevent V8 crash (hard guard)
        if (contextWindow.length > 400) {
          if (log) {
            log(`[CANON][USD_CTX_CAP] lenBefore=${contextWindow.length} lenAfter=400`);
          }
          contextWindow = contextWindow.substring(0, 400);
        }
        
        // A3.8.57: DIAG log for currency local context classification
        if (log && statementIndex !== null) {
          const trimmedWindow = windowText.length > 120 ? windowText.substring(0, 120) + "..." : windowText;
          const distsJson = JSON.stringify(classification.distances);
          const sampleJson = JSON.stringify(classification.matchedTermsSample);
          log(`[DIAG][A3.8.57][CURRENCY_LOCAL_CTX] idx=${statementIndex} anchor=${anchorFamily || "unknown"} span=${sourceSpan.start},${sourceSpan.end} window="${trimmedWindow}" dists=${distsJson} chosen=${chosenFamily} sample=${sampleJson}`);
        }
        
        // Valuation context tokens
        const valuationTokens = [
          "valuation", "valued", "value", "pre-money", "premoney", "post-money", "postmoney",
          "enterprise value", "ev", "at a", "cap table"
        ];
        
        // Investment context tokens
        const investmentTokens = [
          "invest", "investment", "financing", "primary", "check", "commit", "deploy", "participate"
        ];
        
        // A3.8.37: Metric/pricing context tokens
        const metricTokens = [
          "revenue", "run-rate", "run rate", "annualized", "arr", "mrr",
          "subscription", "per month", "/mo", "monthly", "per annum", "per year", "yearly",
          "price", "pricing", "averaging", "avg", "fee", "fees"
        ];
        
        // Count matches and track positions for distance-based priority
        let valuationScore = 0;
        let investmentScore = 0;
        let metricScore = 0;
        
        // A3.8.40: Track token positions for distance-based priority (safe list-based, not sparse arrays)
        // Use small arrays with push() only - never index by large positions
        const invHits = [];
        const valHits = [];
        
        // A3.8.40: usdIdx must be relative to contextWindow (0 to contextWindow.length-1), not statement
        // Find USD amount position within contextWindow
        const usdMatchInContext = contextWindow.match(/\$([\d,]+(?:\.\d+)?)/);
        const usdIdx = usdMatchInContext ? usdMatchInContext.index : Math.floor(contextWindow.length / 2);
        
        // A3.8.40: Defensive guard - ensure usdIdx is within bounds
        const safeUsdIdx = Math.max(0, Math.min(usdIdx, contextWindow.length - 1));
        
        // Extended investment tokens (including phrases)
        const extendedInvestmentTokens = [
          "invest", "investing", "investment", "primary investment", "we invest", "planning to invest",
          "financing", "primary", "check", "commit", "deploy", "participate"
        ];
        
        // Extended valuation tokens (including phrases)
        const extendedValuationTokens = [
          "valuation", "valued", "value", "pre-money", "premoney", "post-money", "postmoney",
          "enterprise value", "ev", "at a", "cap table", "priced at"
        ];
        
        // A3.8.40: Safe position collection - only push indices within contextWindow bounds
        for (const token of extendedValuationTokens) {
          const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
          let match;
          // Reset regex lastIndex to avoid issues with global flag
          regex.lastIndex = 0;
          while ((match = regex.exec(contextWindow)) !== null) {
            // A3.8.40: Ensure index is within contextWindow bounds (should always be, but defensive)
            const idx = Math.max(0, Math.min(match.index, contextWindow.length - 1));
            valHits.push(idx);
            valuationScore++;
            // Pre-money gets extra weight
            if (token.includes("pre-money") || token.includes("premoney")) {
              valuationScore += 2;
            }
            // A3.8.40: Safety cap - never collect more than 50 positions per type
            if (valHits.length >= 50) break;
          }
        }
        
        for (const token of extendedInvestmentTokens) {
          const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
          let match;
          // Reset regex lastIndex to avoid issues with global flag
          regex.lastIndex = 0;
          while ((match = regex.exec(contextWindow)) !== null) {
            // A3.8.40: Ensure index is within contextWindow bounds (should always be, but defensive)
            const idx = Math.max(0, Math.min(match.index, contextWindow.length - 1));
            invHits.push(idx);
            investmentScore++;
            // A3.8.40: Safety cap - never collect more than 50 positions per type
            if (invHits.length >= 50) break;
          }
        }
        
        for (const token of metricTokens) {
          const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
          if (regex.test(contextWindow)) {
            metricScore++;
          }
        }
        
        // A3.8.40: Defensive guard - check array sizes (should never trigger, but belt-and-braces)
        if (invHits.length > 5000 || valHits.length > 5000) {
          if (log) {
            log(`[CANON][USD_POS_GUARD] triggered=true invLen=${invHits.length} valLen=${valHits.length}`);
          }
          // Reset to empty arrays if somehow too large
          invHits.length = 0;
          valHits.length = 0;
        }
        
        // A3.8.40: Compute distances for priority override (safe loop-based, not spread operator on large arrays)
        let nearestInvDist = Infinity;
        if (invHits.length > 0) {
          for (let i = 0; i < invHits.length; i++) {
            const dist = Math.abs(invHits[i] - safeUsdIdx);
            if (dist < nearestInvDist) {
              nearestInvDist = dist;
            }
          }
        }
        
        let nearestValDist = Infinity;
        if (valHits.length > 0) {
          for (let i = 0; i < valHits.length; i++) {
            const dist = Math.abs(valHits[i] - safeUsdIdx);
            if (dist < nearestValDist) {
              nearestValDist = dist;
            }
          }
        }
        
        // A3.8.46: Part B - Detect bare USD selections for logging
        const isBareUsdSelection = selectionMode && hasCurrency && anchorFamily && anchorFamily.startsWith("usd_") && 
          /^\s*\$\s*\d+(?:\.\d+)?\s*(?:k|thousand|m|mm|million|bn|b|billion)?\s*$/i.test(claimText.trim()) &&
          !/[,\(]$/.test(claimText.trim());
        
        // A3.8.57: Currency local context classification decision (takes precedence)
        if (chosenFamily === "INVESTMENT") {
          if (log) {
            const valueDisplay = usdMatch[1];
            const trimmedWindow = windowText.length > 80 ? windowText.substring(0, 80) + "..." : windowText;
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=investment_amount decisionReason=currency_local_ctx_investment ctxPreview="${trimmedWindow}..."`);
          }
          return "investment_amount";
        } else if (chosenFamily === "VALUATION") {
          // A3.8.57: Check for specific valuation role keywords in local window
          const hasPreMoney = /\b(pre-?money|premoney|pre\s+money)\b/i.test(windowText);
          const hasPostMoney = /\b(post-?money|postmoney|post\s+money)\b/i.test(windowText);
          const hasEnterpriseValue = /\b(enterprise\s+value|\bev\b(?!\w))\b/i.test(windowText);
          
          if (hasPreMoney) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const trimmedWindow = windowText.length > 80 ? windowText.substring(0, 80) + "..." : windowText;
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_pre_money decisionReason=currency_local_ctx_valuation_pre ctxPreview="${trimmedWindow}..."`);
            }
            return "valuation_pre_money";
          } else if (hasPostMoney) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const trimmedWindow = windowText.length > 80 ? windowText.substring(0, 80) + "..." : windowText;
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_post_money decisionReason=currency_local_ctx_valuation_post ctxPreview="${trimmedWindow}..."`);
            }
            return "valuation_post_money";
          } else if (hasEnterpriseValue) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const trimmedWindow = windowText.length > 80 ? windowText.substring(0, 80) + "..." : windowText;
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_enterprise_value decisionReason=currency_local_ctx_valuation_ev ctxPreview="${trimmedWindow}..."`);
            }
            return "valuation_enterprise_value";
          } else {
            // Generic valuation - fall back to existing logic for specific type
            // Continue to existing valuation logic below
          }
        } else if (chosenFamily === "METRIC") {
          if (log) {
            const valueDisplay = usdMatch[1];
            const trimmedWindow = windowText.length > 80 ? windowText.substring(0, 80) + "..." : windowText;
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=metric_amount decisionReason=currency_local_ctx_metric ctxPreview="${trimmedWindow}..."`);
          }
          return "metric_amount";
        }
        // If chosenFamily is NONE, fall through to existing logic
        
        // A3.8.39: Check for investment priority override
        const hasInvestNearUsd = investmentScore > 0 && nearestInvDist <= 20;
        const hasValCloser = nearestValDist < nearestInvDist && (nearestInvDist - nearestValDist) >= 10;
        const isStrongValToken = valHits.length > 0 && valHits.some(hit => {
          const hitText = contextWindow.substring(Math.max(0, hit - 5), Math.min(contextWindow.length, hit + 15));
          return /\b(pre-?money|post-?money|valuation|priced\s+at)\b/i.test(hitText);
        });
        const shouldPreferInvestment = hasInvestNearUsd && (!hasValCloser || !isStrongValToken);
        
        // A3.8.37: Decision rule (ordered):
        // a) If valScore > 0 → valuation_* (existing logic)
        // b) Else if metricScore > 0 → metric_amount
        // c) Else if invScore > 0 → investment_amount
        // d) Else fallback to existing default behavior
        // A3.8.39: Override: prefer investment when invest is close to USD even if valuation exists
        
        // A3.8.39: Investment priority override (before valuation check)
        if (shouldPreferInvestment && investmentScore > 0) {
          if (log) {
            const valueDisplay = usdMatch[1];
            const ctxPreview = contextWindow.substring(0, 80);
            // A3.8.40: Only log small primitives, not arrays
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=investment_amount valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=investment_near_usd ctxPreview="${ctxPreview}..."`);
            // A3.8.46: Part B - Log bare USD selection with contextual cues
            if (isBareUsdSelection) {
              const preview = claimText.substring(0, 60);
              log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=investment_amount hasCtx=true preview="${preview}"`);
            }
          }
          return "investment_amount";
        }
        
        // A3.8.36: Typing rule - if valuation context present, classify as valuation type
        if (valuationScore > 0 && !shouldPreferInvestment) {
          // Check for specific valuation types
          if (/\b(pre-?money|premoney|pre\s+money)\b/i.test(contextWindow)) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const ctxPreview = contextWindow.substring(0, 80);
              // A3.8.40: Only log small primitives, not arrays
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_pre_money valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=valuation ctxPreview="${ctxPreview}..."`);
              // A3.8.46: Part B - Log bare USD selection with contextual cues
              if (isBareUsdSelection) {
                const preview = claimText.substring(0, 60);
                log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=valuation_pre_money hasCtx=true preview="${preview}"`);
              }
            }
            return "valuation_pre_money";
          }
          if (/\b(post-?money|postmoney|post\s+money)\b/i.test(contextWindow)) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const ctxPreview = contextWindow.substring(0, 80);
              // A3.8.40: Only log small primitives, not arrays
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_post_money valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=valuation ctxPreview="${ctxPreview}..."`);
              // A3.8.46: Part B - Log bare USD selection with contextual cues
              if (isBareUsdSelection) {
                const preview = claimText.substring(0, 60);
                log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=valuation_post_money hasCtx=true preview="${preview}"`);
              }
            }
            return "valuation_post_money";
          }
          if (/\b(enterprise\s+value|EV)\b(?!\w)/i.test(contextWindow)) {
            if (log) {
              const valueDisplay = usdMatch[1];
              const ctxPreview = contextWindow.substring(0, 80);
              // A3.8.40: Only log small primitives, not arrays
              log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_enterprise_value valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=valuation ctxPreview="${ctxPreview}..."`);
              // A3.8.46: Part B - Log bare USD selection with contextual cues
              if (isBareUsdSelection) {
                const preview = claimText.substring(0, 60);
                log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=valuation_enterprise_value hasCtx=true preview="${preview}"`);
              }
            }
            return "valuation_enterprise_value";
          }
          // Default to pre-money for valuation context
          if (log) {
            const valueDisplay = usdMatch[1];
            const ctxPreview = contextWindow.substring(0, 80);
            // A3.8.40: Only log small primitives, not arrays
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=valuation_pre_money valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=valuation ctxPreview="${ctxPreview}..."`);
            // A3.8.46: Part B - Log bare USD selection with contextual cues
            if (isBareUsdSelection) {
              const preview = claimText.substring(0, 60);
              log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=valuation_pre_money hasCtx=true preview="${preview}"`);
            }
          }
          return "valuation_pre_money";
        }
        
        // A3.8.37: b) Else if metricScore > 0 → metric_amount
        if (metricScore > 0) {
          if (log) {
            const valueDisplay = usdMatch[1];
            const ctxPreview = contextWindow.substring(0, 80);
            // A3.8.40: Only log small primitives, not arrays
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=metric_amount valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=metric ctxPreview="${ctxPreview}..."`);
            // A3.8.46: Part B - Log bare USD selection with contextual cues
            if (isBareUsdSelection) {
              const preview = claimText.substring(0, 60);
              log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=metric_amount hasCtx=true preview="${preview}"`);
            }
          }
          return "metric_amount";
        }
        
        // A3.8.37: c) Else if invScore > 0 → investment_amount
        // A3.8.39: Now also allow if investment context present (even if valuation exists, if not overridden above)
        if (investmentScore > 0) {
          if (log) {
            const valueDisplay = usdMatch[1];
            const ctxPreview = contextWindow.substring(0, 80);
            // A3.8.40: Only log small primitives, not arrays
            log(`[CANON][USD_TYPE] idx=${statementIndex} value=${valueDisplay} decided=investment_amount valScore=${valuationScore} metricScore=${metricScore} invScore=${investmentScore} nearestInvDist=${nearestInvDist} nearestValDist=${nearestValDist} usdIdx=${safeUsdIdx} decisionReason=investment ctxPreview="${ctxPreview}..."`);
            // A3.8.46: Part B - Log bare USD selection with contextual cues
            if (isBareUsdSelection) {
              const preview = claimText.substring(0, 60);
              log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=investment_amount hasCtx=true preview="${preview}"`);
            }
          }
          return "investment_amount";
        }
        
        if (valuationScore === 0 && investmentScore === 0 && metricScore === 0) {
          // No clear context - will use role keywords below
          // A3.8.46: Part B - For bare USD selections in selection mode, default to metric_amount
          if (isBareUsdSelection) {
            // Bare USD selection with no contextual cues - default to metric_amount
            const preview = claimText.substring(0, 60);
            if (log) {
              log(`[DIAG][A3.8.46][BARE_USD_TYPE] decided=metric_amount hasCtx=false preview="${preview}"`);
            }
            return "metric_amount";
          }
        }
      }
    }
    
    // Use role keywords for type inference (priority order)
    
    // A3.8.11: Fee percent detection (must come before ownership percent)
    if (hasPercent) {
      // Fee keywords (case-insensitive)
      const feeKeywords = /\b(fee|fees|transaction\s+fee|transaction\s+fees|take\s+rate|commission|pricing|percent\s+of\s+transaction|subscription\s+fee|0\.5[–-]2%|transaction\s+cost)\b/i;
      // Ownership keywords (case-insensitive)
      const ownershipKeywords = /\b(ownership|stake|equity|fully\s+diluted|shares|%\s+of\s+company|cap\s+table|ownership\s+stake)\b/i;
      
      const hasFeeKeywords = feeKeywords.test(claimText) || roleKeywords.some(kw => 
        typeof kw === "string" && /fee|commission|take.*rate|pricing/i.test(kw)
      );
      const hasOwnershipKeywords = ownershipKeywords.test(claimText) || roleKeywords.includes("ownership") || 
        roleKeywords.some(kw => typeof kw === "string" && /ownership|stake|equity/i.test(kw));
      
      if (hasFeeKeywords && !hasOwnershipKeywords) {
        return "fee_percent";
      }
      if (hasOwnershipKeywords) {
        return "ownership_percent";
      }
      // Ambiguous - use generic percent type
      // (will be handled below)
    }
    
    // A3.8.12: Growth percent detection (must come before ownership percent)
    if (hasPercent) {
      const growthKeywords = /\b(yoy|year-over-year|year\s+over\s+year|growth|growth\s+rate|increased|decreased|up|down)\b/i;
      const hasGrowthKeywords = growthKeywords.test(claimText) || roleKeywords.some(kw => 
        typeof kw === "string" && /growth|yoy/i.test(kw)
      );
      // Check if percent is paired with growth context (within ~40 chars)
      if (hasGrowthKeywords) {
        return "growth_percent";
      }
    }
    
    // Ownership percent (legacy check for backward compatibility)
    if (hasPercent && (roleKeywords.includes("ownership") || /\b(ownership|own|stake|equity|fully\s+diluted|FD)\b/i.test(claimText))) {
      return "ownership_percent";
    }
    
    // A3.8.12: Metric amount detection (must come before investment amount)
    if (hasCurrency) {
      // Metric keywords (case-insensitive, check within ~40 chars of number)
      const metricKeywords = /\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized|customers|user\s+base|active\s+users)\b/i;
      const hasMetricKeywords = metricKeywords.test(claimText) || roleKeywords.some(kw => 
        typeof kw === "string" && /metric|mrr|arr|gmv|revenue/i.test(kw)
      );
      
      // Investment keywords (must be explicit for investment_amount)
      const hasInvestmentKeywords = roleKeywords.includes("investment") || roleKeywords.includes("financing") || 
        /\b(invest|investing|investment|check|commit|deploy|participate|financing|round|Series|Seed)\b/i.test(claimText);
      
      if (hasMetricKeywords && !hasInvestmentKeywords) {
        return "metric_amount";
      }
    }
    
    // Investment amount (requires explicit investment/financing keywords)
    if (hasCurrency && (roleKeywords.includes("investment") || roleKeywords.includes("financing") || 
        /\b(invest|investing|investment|check|commit|deploy|participate|financing|round|Series|Seed)\b/i.test(claimText))) {
      return "investment_amount";
    }
    
    // Valuation types
    if (hasCurrency && (roleKeywords.includes("valuation") || /\b(valuation|value|valued)\b/i.test(claimText))) {
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
    if (roleKeywords.includes("secondary") || /\b(secondary|buying\s+shares|existing\s+shareholders)\b/i.test(claimText)) {
      return "secondary_purchase";
    }
    
    // Structure term
    if (roleKeywords.includes("structure") || /\b(convertible|SAFE|preferred|liquidation\s+preference|note)\b/i.test(claimText)) {
      return "structure_term";
    }
    
    // Fallback: if we have numeric + currency but no clear role, default to investment_amount
    if (hasCurrency) {
      return "investment_amount";
    }
    
    // A3.8.11: If we have percent but no clear classification, use generic "percent" type
    if (hasPercent) {
      return "percent";
    }
  }
  
  // Qualitative types (only if no numeric value)
  if (!hasNumeric) {
    if (/\b(business|company|product|service)\b/i.test(claimText)) {
      return "business_description";
    }
    if (/\b(thesis|rationale|strategy|growth)\b/i.test(claimText)) {
      if (/\b(growth|expansion|scale)\b/i.test(claimText)) {
        return "growth_strategy";
      }
      return "investment_thesis";
    }
  }
  
  // Default
  return "other_qualitative";
}

/**
 * A3.8.42: Expand bare money claim using statement context
 * Converts "$20 million" into contextual claimText like "pre-money valuation of $20 million"
 */
function expandMoneyClaimFromStatement(statementText, moneyValue, moneySpanIndex) {
  if (!statementText || typeof statementText !== "string" || moneySpanIndex < 0) {
    return { expandedText: null, contextType: null };
  }
  
  // Look at window around moneySpanIndex (±80 chars)
  const contextStart = Math.max(0, moneySpanIndex - 80);
  const contextEnd = Math.min(statementText.length, moneySpanIndex + 80);
  const contextWindow = statementText.substring(contextStart, contextEnd).toLowerCase();
  
  // Find the actual USD amount in the window to construct expanded text
  const usdMatch = contextWindow.match(/\$([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b)?/i);
  if (!usdMatch) {
    return { expandedText: null, contextType: null };
  }
  
  const amountText = usdMatch[0]; // e.g., "$20 million"
  const numStr = usdMatch[1].replace(/,/g, "");
  const unit = (usdMatch[2] || "").toLowerCase();
  
  // Check for enterprise value
  if (/\benterprise\s+value|\bev\b(?!\w)/i.test(contextWindow)) {
    const expandedText = `enterprise value ${amountText}`;
    return { expandedText, contextType: "valuation_enterprise_value" };
  }
  
  // Check for pre-money valuation
  if (/\bpre-?money|premoney\b/i.test(contextWindow) || 
      (/\bvaluation\b/i.test(contextWindow) && contextWindow.indexOf(amountText) < contextWindow.indexOf("valuation") + 30)) {
    const expandedText = `pre-money valuation of ${amountText}`;
    return { expandedText, contextType: "valuation_pre_money" };
  }
  
  // Check for post-money valuation
  if (/\bpost-?money|postmoney\b/i.test(contextWindow)) {
    const expandedText = `post-money valuation of ${amountText}`;
    return { expandedText, contextType: "valuation_post_money" };
  }
  
  // Check for metric keywords (revenue, annualized, run-rate, subscription, pricing, fees)
  if (/\b(revenue|annualized|run-?rate|subscription|pricing|fees|take\s+rate|gmv)\b/i.test(contextWindow)) {
    // Determine specific metric type
    if (/\bannualized|run-?rate|arr\b/i.test(contextWindow)) {
      const expandedText = `annualized revenue of ${amountText}`;
      return { expandedText, contextType: "metric_amount" };
    } else if (/\bsubscription\b/i.test(contextWindow)) {
      const expandedText = `subscription of ${amountText}`;
      return { expandedText, contextType: "metric_amount" };
    } else if (/\brevenue\b/i.test(contextWindow)) {
      const expandedText = `revenue of ${amountText}`;
      return { expandedText, contextType: "metric_amount" };
    } else {
      const expandedText = `${amountText}`; // Keep original but mark as metric
      return { expandedText, contextType: "metric_amount" };
    }
  }
  
  return { expandedText: null, contextType: null };
}

/**
 * A3.8.2: Check if numeric fragment is junk (should be dropped)
 * A3.8.42: Enhanced to preserve contextual currency claims (time basis, valuation, EV, metrics)
 */
function isNumericFragmentJunk(norm, ctx) {
  const { statementText = "", knownEntities = {} } = ctx;
  const claimText = norm.claimText || "";
  
  // Must have numeric value AND currency/percent
  const hasNumeric = norm.normalizedNumericValue !== null;
  const hasCurrency = norm.normalizedCurrency !== null;
  const hasPercent = norm.normalizedPercent !== null;
  
  if (!hasNumeric || (!hasCurrency && !hasPercent)) {
    return false; // Not a numeric fragment
  }
  
  // A3.8.42: Check for contextual meaning in claimText itself (preserve these)
  const textLower = claimText.toLowerCase();
  
  // Time basis words (per month, monthly, annual, etc.)
  const hasTimeBasis = /\b(per\s+month|\/mo|monthly|per\s+year|annual|annualized|run-?rate|arr|mrr)\b/i.test(claimText);
  
  // Valuation words
  const hasValuationWords = /\b(valuation|pre-?money|post-?money|premoney|postmoney)\b/i.test(claimText);
  
  // EV words
  const hasEVWords = /\b(enterprise\s+value|\bev\b(?!\w))\b/i.test(claimText);
  
  // Metric words
  const hasMetricWords = /\b(revenue|subscription|pricing|fees|take\s+rate|gmv)\b/i.test(claimText);
  
  // A3.8.42: If claimText itself has contextual meaning, DO NOT drop
  if (hasTimeBasis || hasValuationWords || hasEVWords || hasMetricWords) {
    return false; // Has contextual meaning in claimText
  }
  
  // A3.8.42: Check statement context for recoverable meaning (Part C will handle expansion)
  // For now, if statement has contextual words near the money, don't drop
  if (statementText && hasCurrency) {
    // Find USD amount in claimText to locate it in statement
    const usdMatch = claimText.match(/\$([\d,]+(?:\.\d+)?)/);
    if (usdMatch) {
      const usdIndex = statementText.indexOf(usdMatch[0]);
      if (usdIndex >= 0) {
        // Check ±80 chars around the USD amount
        const contextStart = Math.max(0, usdIndex - 80);
        const contextEnd = Math.min(statementText.length, usdIndex + usdMatch[0].length + 80);
        const contextWindow = statementText.substring(contextStart, contextEnd).toLowerCase();
        
        // Check for contextual meaning in statement context
        const hasContextTimeBasis = /\b(per\s+month|\/mo|monthly|per\s+year|annual|annualized|run-?rate|arr|mrr)\b/i.test(contextWindow);
        const hasContextValuation = /\b(valuation|pre-?money|post-?money|premoney|postmoney)\b/i.test(contextWindow);
        const hasContextEV = /\b(enterprise\s+value|\bev\b(?!\w))\b/i.test(contextWindow);
        const hasContextMetric = /\b(revenue|subscription|pricing|fees|take\s+rate|gmv)\b/i.test(contextWindow);
        
        if (hasContextTimeBasis || hasContextValuation || hasContextEV || hasContextMetric) {
          return false; // Statement context provides meaning (Part C will expand)
        }
      }
    }
  }
  
  // Check roleKeywords - if empty or only generic tokens, likely junk
  const roleKeywords = norm.roleKeywords || [];
  const genericTokens = ["million", "billion", "usd", "dollar", "currency"];
  const hasNonGenericKeywords = roleKeywords.some(kw => !genericTokens.includes(kw.toLowerCase()));
  
  if (roleKeywords.length > 0 && hasNonGenericKeywords) {
    return false; // Has meaningful role keywords
  }
  
  // Check claimText characteristics
  // a) Check if too short after stripping numeric/currency tokens
  const stripped = claimText
    .replace(/\$[\d,]+(?:\.\d+)?\s*(?:million|mm|m|billion|b|thousand|k)?/gi, "")
    .replace(/[\d,]+(?:\.\d+)?\s*%/g, "")
    .replace(/\b(USD|EUR|GBP|SGD|AUD|CAD|JPY|CNY)\b/gi, "")
    .trim();
  const nonStopwordTokens = stripped.split(/\s+/).filter(w => w.length > 2 && !/^(the|a|an|in|on|at|of|for|to|and|or|but)\b/i.test(w));
  
  if (nonStopwordTokens.length < 3) {
    return true; // Too short
  }
  
  // b) Check if ends with fragment connector
  const lastToken = stripped.split(/\s+/).pop().toLowerCase();
  const fragmentEnders = ["series", "million", "billion", "at", "of", "in", "for", "to"];
  if (fragmentEnders.includes(lastToken)) {
    return true; // Ends with fragment connector
  }
  
  // c) Check if lacks investment/financing/valuation/ownership keywords
  const hasInvestmentKeywords = /\b(invest|investing|investment|check|commit|deploy|participate|financing|round|Series|Seed)\b/i.test(claimText);
  const hasValuationKeywords = /\b(valuation|value|valued|pre-money|premoney|post-money|postmoney|enterprise\s+value|EV)\b/i.test(claimText);
  const hasOwnershipKeywords = /\b(ownership|own|stake|equity|%\s*|fully\s+diluted|FD)\b/i.test(claimText);
  
  if (!hasInvestmentKeywords && !hasValuationKeywords && !hasOwnershipKeywords) {
    return true; // Lacks meaningful keywords
  }
  
  return false; // Not junk
}

/**
 * A3.8.9: Create qualitative fallback canonical claim (with company/round inference)
 */
function createQualitativeFallbackClaim(statementText, ctx, selectionHash, selectionMode, citationsFromStatement = null) {
  if (!statementText || typeof statementText !== "string") {
    return null;
  }
  
  const { knownEntities = {}, runId = null, reqSig = null, statementIndex = 0 } = ctx;
  const assessment = ctx.assessment || {};
  
  // A3.8.9: Trim and cap displayText at 140 chars, no trailing partial word
  let displayText = statementText.trim();
  if (displayText.length > 140) {
    displayText = displayText.substring(0, 140);
    // Find last space to avoid partial word
    const lastSpace = displayText.lastIndexOf(" ");
    if (lastSpace > 100) { // Only truncate if we have enough content
      displayText = displayText.substring(0, lastSpace);
    }
  }
  
  // A3.8.9: Prefer resolved statement-level citations if available; else empty array
  const citations = citationsFromStatement && Array.isArray(citationsFromStatement) 
    ? citationsFromStatement 
    : (Array.isArray(assessment.citations) ? assessment.citations : []);
  
  // A3.8.9: Infer company from statementText (reuse inferCompanyFromText if available)
  let inferredCompany = null;
  if (statementText) {
    inferredCompany = inferCompanyFromText(statementText, []);
    // Normalize to ensure it's not junk
    if (inferredCompany) {
      const normalized = normalizeEntity(inferredCompany);
      if (normalized && !isJunkEntityToken(normalized)) {
        inferredCompany = normalized;
      } else {
        inferredCompany = null;
      }
    }
  }
  // Fallback to knownEntities if inference failed
  if (!inferredCompany && knownEntities.company) {
    const normalized = normalizeEntity(knownEntities.company);
    if (normalized && !isJunkEntityToken(normalized)) {
      inferredCompany = normalized;
    }
  }
  
  // A3.8.9: Infer round (Series/Seed) if present
  let inferredRound = null;
  if (statementText) {
    inferredRound = normalizeRoundFromText(statementText);
  }
  // Fallback to knownEntities if inference failed
  if (!inferredRound && knownEntities.round) {
    inferredRound = normalizeRoundFromText(knownEntities.round);
  }
  
  // A3.8.9: Get reliability - inherit statement-level reliability if computed later; else "Medium" placeholder
  const reliability = assessment.reliabilityLabel || assessment.reliability || "Medium";
  
  // A3.8.9: Build deterministic ID (use inferred company/round)
  // A3.8.10: Include statementScopeKey to prevent collisions
  const statementScopeKey = ctx.statementScopeKey || (selectionMode ? (selectionHash || "null") : "global");
  const idParts = [
    "other_qualitative",
    "null", // value
    "null", // currency/unit
    inferredCompany || "null", // company
    inferredRound || "null", // round
    statementScopeKey, // A3.8.10: Use statementScopeKey for uniqueness
  ];
  const id = createHash("sha256").update(idParts.join("|")).digest("hex").substring(0, 32);
  
  return {
    id,
    type: "other_qualitative",
    value: null,
    unit: null,
    currency: null,
    displayText,
    company: inferredCompany,
    round: inferredRound,
    roleKeywords: [],
    anchorFamily: null,
    sourceSpan: { start: null, end: null },
    citations: citations.slice(), // Copy array
    reliability,
    reliabilityScore: null,
    evidenceNotes: ["Qualitative fallback claim"],
    rawClaimIds: [],
    selectionScope: {
      selectionMode,
      selectionHash: selectionMode ? (selectionHash || null) : null,
    },
  };
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
 * A3.8.57: Get currency context window around sourceSpan
 * Returns a local window of text around the anchor span for classification
 */
function getCurrencyContextWindow(text, sourceSpan, windowChars = 80) {
  if (!text || typeof text !== "string") {
    return { windowText: "", windowStart: 0, windowEnd: 0, anchorMid: 0 };
  }
  
  // If sourceSpan is missing or invalid, fallback to full text
  if (!sourceSpan || sourceSpan.start === null || sourceSpan.end === null || 
      sourceSpan.start < 0 || sourceSpan.end > text.length || sourceSpan.start >= sourceSpan.end) {
    return {
      windowText: text,
      windowStart: 0,
      windowEnd: text.length,
      anchorMid: Math.floor(text.length / 2)
    };
  }
  
  // Calculate window around the span
  const spanMid = Math.floor((sourceSpan.start + sourceSpan.end) / 2);
  const windowStart = Math.max(0, spanMid - windowChars);
  const windowEnd = Math.min(text.length, spanMid + windowChars);
  const windowText = text.substring(windowStart, windowEnd);
  
  // Anchor mid relative to window start
  const anchorMidRelative = spanMid - windowStart;
  
  return {
    windowText,
    windowStart,
    windowEnd,
    anchorMid: anchorMidRelative
  };
}

/**
 * A3.8.57: Classify currency by local context window
 * Deterministic keyword family classification based on distance from anchor
 */
function classifyCurrencyByLocalContext(windowText, anchorMidRelative) {
  if (!windowText || typeof windowText !== "string") {
    return { chosenFamily: "NONE", distances: {}, matchedTermsSample: {} };
  }
  
  const lowerText = windowText.toLowerCase();
  
  // Keyword families (case-insensitive)
  const INVESTMENT_TERMS = [
    /\binvest\b/gi, /\binvesting\b/gi, /\binvestment\b/gi, /\bcheque\b/gi, /\bcheck\b/gi,
    /\bprimary\b/gi, /\bsecondary\b/gi, /\bpurchase\b/gi, /\bbuy\b/gi, /\bacquire\b/gi
  ];
  
  const VALUATION_TERMS = [
    /\bvaluation\b/gi, /\bpre-money\b/gi, /\bpremoney\b/gi, /\bpost-money\b/gi, /\bpostmoney\b/gi,
    /\benterprise value\b/gi, /\bev\b(?!\w)/gi, /\bpriced at\b/gi, /\bimplied valuation\b/gi, /\bcap table\b/gi
  ];
  
  const METRIC_TERMS = [
    /\brevenue\b/gi, /\barr\b/gi, /\brecurring\b/gi, /\bannualized\b/gi, /\brun-rate\b/gi, /\brun rate\b/gi,
    /\bbookings\b/gi, /\bgmv\b/gi, /\bebitda\b/gi, /\bgross profit\b/gi, /\bmargin\b/gi
  ];
  
  // Find all matches and compute minimum distance for each family
  function findMinDistance(patterns) {
    let minDist = Infinity;
    const matchedTerms = [];
    
    for (const pattern of patterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      while ((match = pattern.exec(lowerText)) !== null && matchedTerms.length < 2) {
        const dist = Math.abs(match.index - anchorMidRelative);
        if (dist < minDist) {
          minDist = dist;
        }
        matchedTerms.push(match[0]);
      }
    }
    
    return { distance: minDist, matchedTerms: matchedTerms.slice(0, 2) };
  }
  
  const invResult = findMinDistance(INVESTMENT_TERMS);
  const valResult = findMinDistance(VALUATION_TERMS);
  const metricResult = findMinDistance(METRIC_TERMS);
  
  const distances = {
    INVESTMENT: invResult.distance,
    VALUATION: valResult.distance,
    METRIC: metricResult.distance
  };
  
  const matchedTermsSample = {
    INVESTMENT: invResult.matchedTerms,
    VALUATION: valResult.matchedTerms,
    METRIC: metricResult.matchedTerms
  };
  
  // Choose family by smallest distance; tie-break precedence: INVESTMENT > VALUATION > METRIC > NONE
  let chosenFamily = "NONE";
  let minDistance = Infinity;
  
  if (invResult.distance < minDistance) {
    minDistance = invResult.distance;
    chosenFamily = "INVESTMENT";
  }
  if (valResult.distance < minDistance) {
    minDistance = valResult.distance;
    chosenFamily = "VALUATION";
  }
  if (metricResult.distance < minDistance) {
    minDistance = metricResult.distance;
    chosenFamily = "METRIC";
  }
  
  return { chosenFamily, distances, matchedTermsSample };
}

/**
 * Group normalized claims by grouping keys (A3.8.2: soft round matching)
 */
/**
 * A3.8.13: Check if two sourceSpans overlap
 */
function sourceSpansOverlap(span1, span2) {
  if (!span1 || !span2) return false;
  if (span1.start === null || span1.end === null || span2.start === null || span2.end === null) {
    return false;
  }
  // Spans overlap if one starts before the other ends
  return (span1.start <= span2.end && span1.end >= span2.start);
}

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
  
  // A3.8.2: For financial types, merge groups with soft round matching
  // A3.8.13: In selection mode, only merge if same anchorFamily AND overlapping sourceSpan
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  
  const mergedGroups = new Map();
  const processedKeys = new Set();
  
  for (const [key, claims] of groups.entries()) {
    if (processedKeys.has(key)) continue;
    
    const firstClaim = claims[0];
    const isFinancial = financialTypes.has(firstClaim.inferredType);
    
    if (isFinancial && claims.length > 0) {
      // A3.8.13: In selection mode, disable cross-claim merging unless same anchorFamily + overlapping sourceSpan
      if (selectionMode) {
        // Selection mode: only merge if same anchorFamily AND overlapping sourceSpan
        let mergedClaims = [...claims];
        const thisAnchorFamily = firstClaim.anchorFamily;
        const thisSourceSpan = firstClaim.sourceSpan;
        
        for (const [otherKey, otherClaims] of groups.entries()) {
          if (otherKey === key || processedKeys.has(otherKey)) continue;
          
          const otherFirst = otherClaims[0];
          if (otherFirst.inferredType !== firstClaim.inferredType) continue;
          
          // A3.8.13: Must have same anchorFamily
          if (otherFirst.anchorFamily !== thisAnchorFamily) continue;
          
          // A3.8.13: Must have overlapping sourceSpan
          const otherSourceSpan = otherFirst.sourceSpan;
          if (!sourceSpansOverlap(thisSourceSpan, otherSourceSpan)) continue;
          
          // Additional checks for value/currency/company match
          if (otherFirst.normalizedNumericValue !== firstClaim.normalizedNumericValue) continue;
          if ((otherFirst.normalizedCurrency || "%") !== (firstClaim.normalizedCurrency || "%")) continue;
          
          // Check company match (null-safe)
          const thisCompany = firstClaim.entityHints.company || null;
          const otherCompany = otherFirst.entityHints.company || null;
          if (thisCompany !== otherCompany && thisCompany !== null && otherCompany !== null) continue;
          
          // Merge: same anchorFamily and overlapping sourceSpan
          mergedClaims = [...mergedClaims, ...otherClaims];
          processedKeys.add(otherKey);
        }
        
        mergedGroups.set(key, mergedClaims);
        processedKeys.add(key);
      } else {
        // Non-selection mode: use existing soft round matching logic
        let mergedClaims = [...claims];
        const thisRound = firstClaim.entityHints.round;
        
        for (const [otherKey, otherClaims] of groups.entries()) {
          if (otherKey === key || processedKeys.has(otherKey)) continue;
          
          const otherFirst = otherClaims[0];
          if (otherFirst.inferredType !== firstClaim.inferredType) continue;
          if (otherFirst.normalizedNumericValue !== firstClaim.normalizedNumericValue) continue;
          if ((otherFirst.normalizedCurrency || "%") !== (firstClaim.normalizedCurrency || "%")) continue;
          
          // Check company match (null-safe)
          const thisCompany = firstClaim.entityHints.company || null;
          const otherCompany = otherFirst.entityHints.company || null;
          if (thisCompany !== otherCompany && thisCompany !== null && otherCompany !== null) continue;
          
          // Check round: soft matching - if one is null and other is non-null, merge
          const otherRound = otherFirst.entityHints.round;
          if (thisRound === null && otherRound !== null) {
            // Merge: keep the non-null round
            mergedClaims = [...mergedClaims, ...otherClaims];
            processedKeys.add(otherKey);
          } else if (thisRound !== null && otherRound === null) {
            // Merge: keep the non-null round
            mergedClaims = [...mergedClaims, ...otherClaims];
            processedKeys.add(otherKey);
          } else if (thisRound === otherRound) {
            // Exact match, merge
            mergedClaims = [...mergedClaims, ...otherClaims];
            processedKeys.add(otherKey);
          }
          // If both non-null and differ, don't merge
        }
        
        mergedGroups.set(key, mergedClaims);
        processedKeys.add(key);
      }
    } else {
      // Non-financial or single claim - use existing logic
      if (claims.length === 1) {
        mergedGroups.set(key, claims);
      } else {
        // Multiple claims - verify grouping criteria
        if (verifyGroupingCriteria(claims, selectionHash, selectionMode)) {
          mergedGroups.set(key, claims);
        } else {
          // Split into individual groups
          claims.forEach((claim, idx) => {
            mergedGroups.set(`${key}_${idx}`, [claim]);
          });
        }
      }
      processedKeys.add(key);
    }
  }
  
  return mergedGroups;
}

/**
 * Build grouping key (A3.8.8: normalized company, never junk)
 */
function buildGroupingKey(norm, selectionHash, selectionMode) {
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  
  const isFinancial = financialTypes.has(norm.inferredType);
  
  // For financial types, use "soft" round matching (null rounds can merge)
  // For non-financial, use exact matching
  const roundKey = isFinancial 
    ? (norm.entityHints.round || "null") // Soft: null rounds merge
    : (norm.entityHints.round || "null"); // Exact matching (same for now, but could be different)
  
  // A3.8.8: Normalize company - use normalized company (or "none") but NEVER junk
  let companyKey = "none";
  if (norm.entityHints.company) {
    // Re-normalize to ensure it's not junk (defensive check)
    const normalized = normalizeEntity(norm.entityHints.company);
    if (normalized && !isJunkEntityToken(normalized)) {
      companyKey = normalized;
    }
  }
  
  const parts = [
    norm.inferredType || "unknown",
    norm.normalizedNumericValue !== null ? String(norm.normalizedNumericValue) : "null",
    norm.normalizedCurrency || (norm.normalizedPercent !== null ? "%" : "null"),
    companyKey,
    roundKey,
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
 * A3.8.35: Validate claim guardrails (unit vs anchorFamily consistency)
 * Logs mismatches but does not throw (degrades extractionQuality)
 */
function validateClaimGuardrails(claim, statementIndex, log = null) {
  if (!claim || typeof claim !== "object") return;
  
  const unit = claim.unit;
  const anchorFamily = claim.anchorFamily;
  const currency = claim.currency;
  
  // Rule: If unit == "%" then anchorFamily must be pct_* (or at least not usd_*)
  if (unit === "%") {
    if (anchorFamily && typeof anchorFamily === "string" && anchorFamily.startsWith("usd_")) {
      if (log) {
        log(`[CANON_GUARD] mismatch id=${claim.id ? claim.id.substring(0, 8) : "unknown"} type=${claim.type} unit=% anchorFamily=${anchorFamily} value=${claim.value} - unit is % but anchorFamily is USD`);
      }
      // Degrade extraction quality (could set a flag, but for now just log)
    }
  }
  
  // Rule: If currency == "USD" then anchorFamily must not be pct_*
  if (currency === "USD" || (currency && typeof currency === "string")) {
    if (anchorFamily && typeof anchorFamily === "string" && anchorFamily.startsWith("pct_")) {
      if (log) {
        log(`[CANON_GUARD] mismatch id=${claim.id ? claim.id.substring(0, 8) : "unknown"} type=${claim.type} currency=${currency} anchorFamily=${anchorFamily} value=${claim.value} - currency is USD but anchorFamily is pct_*`);
      }
    }
  }
}

/**
 * A3.8.35: Split secondary purchase claims that contain both USD amount and ownership percentage
 * Returns array of claims (original if no split needed, or [secondaryClaim, ownershipClaim] if split)
 */
function splitSecondaryAndOwnership(claim, statementText, selectionHash, selectionMode, statementScopeKey, log = null) {
  if (!claim || claim.type !== "secondary_purchase") {
    return [claim]; // No split needed
  }
  
  const displayText = claim.displayText || "";
  const lower = displayText.toLowerCase();
  
  // A3.8.35: Detect patterns like "secondary of $X (million|m) to reach (about) Y%"
  // Also cover: "secondary purchase of $X to increase ownership to Y%"
  // Pattern: secondary + USD amount + "to reach/to" + percentage
  const secondaryWithOwnershipPatterns = [
    // "secondary of $2 million to reach about 31%"
    /\bsecondary\s+(?:of|purchase\s+of)\s+\$?([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|billion|b)?\s+to\s+(?:reach|increase\s+to|bring\s+ownership\s+to)\s+(?:about\s+)?([\d,]+(?:\.\d+)?)\s*%/i,
    // "$2m secondary bringing ownership to 31%"
    /\$?([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|billion|b)?\s+secondary\s+(?:bringing|to\s+reach|to\s+increase)\s+ownership\s+to\s+(?:about\s+)?([\d,]+(?:\.\d+)?)\s*%/i,
    // "potential secondary of $2m to reach about 31%"
    /\bpotential\s+secondary\s+(?:of|purchase\s+of)\s+\$?([\d,]+(?:\.\d+)?)\s*(?:million|mm|m|billion|b)?\s+to\s+reach\s+(?:about\s+)?([\d,]+(?:\.\d+)?)\s*%/i,
  ];
  
  let usdAmount = null;
  let ownershipPercent = null;
  let usdUnit = null;
  
  for (const pattern of secondaryWithOwnershipPatterns) {
    const match = displayText.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, "");
      const pctStr = match[2].replace(/,/g, "");
      const amountNum = parseFloat(amountStr);
      const pctNum = parseFloat(pctStr);
      
      if (Number.isFinite(amountNum) && amountNum > 0 && Number.isFinite(pctNum) && pctNum > 0 && pctNum <= 100) {
        // Determine if amount is in millions/billions
        const fullMatch = match[0].toLowerCase();
        if (/\b(million|mm|m)\b/.test(fullMatch)) {
          usdAmount = amountNum * 1e6; // Convert to base units
          usdUnit = "million";
        } else if (/\b(billion|b)\b/.test(fullMatch)) {
          usdAmount = amountNum * 1e9;
          usdUnit = "billion";
        } else {
          usdAmount = amountNum; // Assume base units if no unit specified
          usdUnit = null;
        }
        ownershipPercent = pctNum;
        break;
      }
    }
  }
  
  // If we found both USD amount and ownership percent, split the claim
  if (usdAmount !== null && ownershipPercent !== null) {
    // Calculate normalized amount for anchor (in millions if applicable)
    let normalizedAmount = usdAmount;
    let anchorSuffix = "";
    if (usdUnit === "million") {
      normalizedAmount = Math.floor(usdAmount / 1e6);
      anchorSuffix = "m";
    } else if (usdUnit === "billion") {
      normalizedAmount = Math.floor(usdAmount / 1e9);
      anchorSuffix = "b";
    } else {
      normalizedAmount = Math.floor(usdAmount);
    }
    
    // Create secondary purchase claim (USD amount only)
    const secondaryAnchorFamily = `usd_${normalizedAmount}${anchorSuffix}`;
    const secondaryClaim = {
      ...claim,
      id: createHash("sha256").update([
        "secondary_purchase",
        String(usdAmount),
        "USD",
        claim.company || "null",
        claim.round || "null",
        statementScopeKey || (selectionMode ? (selectionHash || "null") : "global"),
      ].join("|")).digest("hex").substring(0, 32),
      type: "secondary_purchase",
      value: usdAmount,
      currency: "USD",
      unit: "USD",
      displayText: displayText.replace(/\s+to\s+(?:reach|increase\s+to|bring\s+ownership\s+to)\s+(?:about\s+)?[\d,]+(?:\.\d+)?\s*%/i, "").trim(),
      anchorFamily: secondaryAnchorFamily,
    };
    
    // Create ownership percent claim
    const ownershipClaim = {
      ...claim,
      id: createHash("sha256").update([
        "ownership_percent",
        String(ownershipPercent),
        "%",
        claim.company || "null",
        claim.round || "null",
        statementScopeKey || (selectionMode ? (selectionHash || "null") : "global"),
      ].join("|")).digest("hex").substring(0, 32),
      type: "ownership_percent",
      value: ownershipPercent,
      currency: null,
      unit: "%",
      displayText: `${ownershipPercent}% ownership`,
      anchorFamily: `pct_${Math.floor(ownershipPercent)}`,
      roleKeywords: [...(claim.roleKeywords || []), "ownership"].filter((v, i, a) => a.indexOf(v) === i),
    };
    
    if (log) {
      log(`[CANON][SPLIT_SECONDARY] split=true secondaryAmount=${usdAmount} ownershipPercent=${ownershipPercent} secondaryAnchor=${secondaryAnchorFamily} ownershipAnchor=pct_${Math.floor(ownershipPercent)}`);
    }
    
    return [secondaryClaim, ownershipClaim];
  }
  
  // No split needed - return original claim
  return [claim];
}

/**
 * A3.8.10: Enforce canonical type invariants (percent vs currency, other_qualitative fields)
 */
function enforceCanonicalTypeInvariants(claim, statementText, statementIndex, log = null, logCounter = { count: 0 }) {
  if (!claim || typeof claim !== "object") return claim;
  
  const fixes = [];
  let fixedType = claim.type;
  let fixedUnit = claim.unit;
  let fixedCurrency = claim.currency;
  let fixedValue = claim.value;
  let fixedAnchorFamily = claim.anchorFamily;
  
  // Rule 1: If unit is "%" OR anchorFamily starts with "pct_", must be percent type
  const isPercentUnit = fixedUnit === "%";
  const isPercentAnchor = fixedAnchorFamily && typeof fixedAnchorFamily === "string" && fixedAnchorFamily.startsWith("pct_");
  
  if (isPercentUnit || isPercentAnchor) {
    // Must be percent type, not other_qualitative
    if (fixedType === "other_qualitative") {
      // A3.8.11: Determine best percent type based on fee vs ownership keywords
      const roleKeywords = claim.roleKeywords || [];
      const claimText = claim.displayText || "";
      
      // Fee keywords
      const feeKeywords = /\b(fee|fees|transaction\s+fee|transaction\s+fees|take\s+rate|commission|pricing|percent\s+of\s+transaction|subscription\s+fee|0\.5[–-]2%|transaction\s+cost)\b/i;
      // Ownership keywords
      const ownershipKeywords = /\b(ownership|stake|equity|fully\s+diluted|shares|%\s+of\s+company|cap\s+table|ownership\s+stake)\b/i;
      
      const hasFeeKeywords = feeKeywords.test(claimText) || roleKeywords.some(kw => 
        typeof kw === "string" && /fee|commission|take.*rate|pricing/i.test(kw)
      );
      const hasOwnershipKeywords = ownershipKeywords.test(claimText) || roleKeywords.includes("ownership") || 
        roleKeywords.some(kw => typeof kw === "string" && /ownership|stake|equity/i.test(kw)) ||
        (statementText && /\b(ownership|own|stake|equity|fully\s+diluted|FD)\b/i.test(statementText));
      
      // A3.8.12: Check for growth percent first
      const growthKeywords = /\b(yoy|year-over-year|year\s+over\s+year|growth|growth\s+rate)\b/i;
      const hasGrowthKeywords = growthKeywords.test(claimText) || roleKeywords.some(kw => 
        typeof kw === "string" && /growth|yoy/i.test(kw)
      );
      
      if (hasGrowthKeywords) {
        fixedType = "growth_percent";
      } else if (hasFeeKeywords && !hasOwnershipKeywords) {
        fixedType = "fee_percent";
      } else if (hasOwnershipKeywords) {
        fixedType = "ownership_percent";
      } else {
        fixedType = "percent"; // Generic percent type
      }
      fixes.push(`type:other_qualitative->${fixedType}`);
      
      // A3.8.11: Log percent type decision
      if (log && logCounter.count < 5 && fixedAnchorFamily) {
        let reason = "ambiguous";
        if (fixedType === "growth_percent") reason = "growth";
        else if (fixedType === "fee_percent") reason = "fee";
        else if (fixedType === "ownership_percent") reason = "ownership";
        log(`[CANON][PCT_TYPE] idx=${statementIndex} anchor=${fixedAnchorFamily} decided=${fixedType} reason=${reason}`);
        logCounter.count++;
      }
    }
    
    // Currency must be null for percent claims
    if (fixedCurrency !== null) {
      fixedCurrency = null;
      fixes.push("currency:null");
    }
    
    // Unit must be "%"
    if (fixedUnit !== "%") {
      fixedUnit = "%";
      fixes.push("unit:%");
    }
  }
  
  // A3.8.12: Check for metric_amount type fixes (outside percent block)
  if (fixedType === "other_qualitative" && fixedCurrency !== null && fixedValue !== null) {
    const claimText = claim.displayText || "";
    const roleKeywords = claim.roleKeywords || [];
    const metricKeywords = /\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized|customers)\b/i;
    const hasMetricKeywords = metricKeywords.test(claimText) || roleKeywords.includes("metric");
    const hasInvestmentKeywords = roleKeywords.includes("investment") || roleKeywords.includes("financing") ||
      /\b(invest|investing|investment|financing|round|Series|Seed)\b/i.test(claimText);
    
    if (hasMetricKeywords && !hasInvestmentKeywords) {
      fixedType = "metric_amount";
      fixes.push(`type:other_qualitative->metric_amount`);
      
      // A3.8.12: Log metric type decision
      if (log && logCounter.count < 5) {
        log(`[CANON][METRIC_TYPE] idx=${statementIndex} decided=metric_amount reason=metric`);
        logCounter.count++;
      }
    }
  }
  
  // Rule 2: If currency is set, unit must not be "%"
  if (fixedCurrency !== null && fixedUnit === "%") {
    fixedUnit = null;
    fixes.push("unit:null (currency set)");
  }
  
  // A3.8.12: Rule 3a: metric_amount must have currency set (if amount), unit="USD" (or detected), and must not be forced into investment_amount
  if (fixedType === "metric_amount") {
    if (fixedCurrency === null && fixedValue !== null) {
      fixedCurrency = "USD"; // Default to USD if currency missing
      fixes.push("currency:USD");
    }
    if (fixedUnit === "%") {
      fixedUnit = null; // metric_amount should not have % unit
      fixes.push("unit:null (metric_amount)");
    }
  }
  
  // A3.8.12: Log metric/growth type decisions (only if type changed or is already metric/growth)
  if ((fixedType === "metric_amount" || fixedType === "growth_percent") && log && logCounter.count < 5) {
    let reason = "default";
    if (fixedType === "metric_amount") {
      const claimText = claim.displayText || "";
      reason = /\b(mrr|arr|gmv|revenue|run-rate|run\s+rate|annualized|customers)\b/i.test(claimText) ? "metric" : "default";
    } else if (fixedType === "growth_percent") {
      reason = "growth";
    }
    log(`[CANON][METRIC_TYPE] idx=${statementIndex} decided=${fixedType} reason=${reason}`);
    logCounter.count++;
  }
  
  // A3.8.12: Rule 3b: growth_percent must have unit="%", currency=null
  if (fixedType === "growth_percent") {
    if (fixedUnit !== "%") {
      fixedUnit = "%";
      fixes.push("unit:%");
    }
    if (fixedCurrency !== null) {
      fixedCurrency = null;
      fixes.push("currency:null");
    }
  }
  
  // Rule 3: "other_qualitative" must have value/unit/currency all null
  if (fixedType === "other_qualitative") {
    if (fixedValue !== null) {
      fixedValue = null;
      fixes.push("value:null");
    }
    if (fixedUnit !== null) {
      fixedUnit = null;
      fixes.push("unit:null");
    }
    if (fixedCurrency !== null) {
      fixedCurrency = null;
      fixes.push("currency:null");
    }
  }
  
  // A3.8.43: Part C - Enforce anchor↔type invariants
  const normalizedAnchorFamily = fixedAnchorFamily ? normalizeAnyAnchor(fixedAnchorFamily) : null;
  
  // Rule 4: If anchorFamily starts with "pct_", enforce percent-compatible type and currency
  if (normalizedAnchorFamily && normalizedAnchorFamily.startsWith("pct_")) {
    const percentCompatibleTypes = new Set([
      "percent",
      "ownership_percent",
      "fee_percent",
      "growth_percent",
    ]);
    const usdTypes = new Set([
      "metric_amount",
      "investment_amount",
      "valuation_pre_money",
      "valuation_post_money",
      "valuation_enterprise_value",
      "secondary_purchase",
    ]);
    
    // If type is USD-compatible, force to percent type (or drop if no % present)
    if (usdTypes.has(fixedType)) {
      const claimText = claim.displayText || "";
      const hasPercent = /%/.test(claimText);
      
      if (hasPercent) {
        // Force to percent type
        fixedType = "percent"; // Default, will be refined by earlier rules
        fixes.push(`type:${claim.type}->percent (pct_ anchor)`);
      } else {
        // No % present - this is a contradiction, drop the claim
        fixes.push("dropped:pct_anchor_without_percent");
        if (log && logCounter.count < 5) {
          const id8 = claim.id ? claim.id.substring(0, 8) : "unknown";
          log(`[A3.8.43][INVARIANT_REPAIR] claimId=${id8} before={type:${claim.type},anchor:${normalizedAnchorFamily},currency:${claim.currency},value:${claim.value}} after=null action=dropped reason=pct_anchor_without_percent`);
          logCounter.count++;
        }
      }
    }
    
    // Ensure currency is not USD
    if (fixedCurrency === "USD") {
      fixedCurrency = null;
      fixes.push("currency:null (pct_ anchor)");
    }
    
    // Ensure unit is "%" if type is percent-compatible
    if (percentCompatibleTypes.has(fixedType) && fixedUnit !== "%") {
      fixedUnit = "%";
      fixes.push("unit:% (pct_ anchor)");
    }
  }
  
  // Rule 5: If anchorFamily starts with "usd_", enforce USD-compatible type and currency
  if (normalizedAnchorFamily && normalizedAnchorFamily.startsWith("usd_")) {
    const usdCompatibleTypes = new Set([
      "metric_amount",
      "investment_amount",
      "valuation_pre_money",
      "valuation_post_money",
      "valuation_enterprise_value",
      "secondary_purchase",
    ]);
    const percentTypes = new Set([
      "percent",
      "ownership_percent",
      "fee_percent",
      "growth_percent",
    ]);
    
    // If type is percent, force to metric_amount if money semantics exist, otherwise drop
    if (percentTypes.has(fixedType)) {
      const claimText = claim.displayText || "";
      const hasDollar = /\$/.test(claimText) || /\b(?:usd)\b/i.test(claimText);
      
      if (hasDollar) {
        // Force to metric_amount
        fixedType = "metric_amount";
        fixes.push(`type:${claim.type}->metric_amount (usd_ anchor)`);
      } else {
        // No dollar semantics - drop
        fixes.push("dropped:usd_anchor_without_dollar");
        if (log && logCounter.count < 5) {
          const id8 = claim.id ? claim.id.substring(0, 8) : "unknown";
          log(`[A3.8.43][INVARIANT_REPAIR] claimId=${id8} before={type:${claim.type},anchor:${normalizedAnchorFamily},currency:${claim.currency},value:${claim.value}} after=null action=dropped reason=usd_anchor_without_dollar`);
          logCounter.count++;
        }
      }
    }
    
    // Ensure currency is USD
    if (fixedCurrency !== "USD") {
      fixedCurrency = "USD";
      fixes.push("currency:USD (usd_ anchor)");
    }
    
    // Ensure unit is not "%"
    if (fixedUnit === "%") {
      fixedUnit = null;
      fixes.push("unit:null (usd_ anchor)");
    }
  }
  
  // Log fixes if any occurred
  if (fixes.length > 0 && log && logCounter.count < 5) {
    const id8 = claim.id ? claim.id.substring(0, 8) : "unknown";
    const beforeState = { type: claim.type, anchor: normalizedAnchorFamily, currency: claim.currency, value: claim.value };
    const afterState = { type: fixedType, anchor: normalizedAnchorFamily, currency: fixedCurrency, value: fixedValue };
    const action = fixes.some(f => f.includes("dropped")) ? "dropped" : "forced";
    log(`[A3.8.43][INVARIANT_REPAIR] claimId=${id8} before=${JSON.stringify(beforeState)} after=${JSON.stringify(afterState)} action=${action} reason=anchor_type_mismatch`);
    log(`[CANON][TYPE_FIX] idx=${statementIndex} id=${id8} from=${claim.type} to=${fixedType} fieldsFixed=[${fixes.join(",")}]`);
    logCounter.count++;
  }
  
  // Return fixed claim (or null if dropped)
  if (fixes.length > 0) {
    // Check if claim was dropped
    if (fixes.some(f => f.includes("dropped"))) {
      return null;
    }
    return {
      ...claim,
      type: fixedType,
      unit: fixedUnit,
      currency: fixedCurrency,
      value: fixedValue,
      anchorFamily: normalizedAnchorFamily || fixedAnchorFamily, // Normalize anchorFamily
    };
  }
  
  // Normalize anchorFamily even if no other fixes
  if (normalizedAnchorFamily && normalizedAnchorFamily !== fixedAnchorFamily) {
    return {
      ...claim,
      anchorFamily: normalizedAnchorFamily,
    };
  }
  
  return claim;
}

/**
 * Merge group into canonical claim (4.4, 4.5, 4.7)
 * A3.8.8: Added log and logCounter for invariant checking
 * A3.8.10: Added statementScopeKey for unique ID generation
 */
function mergeGroupIntoCanonical(groupClaims, statementText, selectionHash, selectionMode, groupKey, log = null, logCounter = { count: 0 }, statementScopeKey = null) {
  if (groupClaims.length === 0) return null;
  
  const first = groupClaims[0];
  
  // Pick best displayText (A3.8.2: improved selection)
  const bestDisplayText = selectBestDisplayText(groupClaims, statementText);
  
  // A3.8.2: Merge entity hints (keep non-null company/round)
  let mergedCompany = null;
  let mergedRound = null;
  for (const c of groupClaims) {
    if (c.entityHints.company && !mergedCompany) {
      mergedCompany = c.entityHints.company;
    }
    if (c.entityHints.round && !mergedRound) {
      mergedRound = c.entityHints.round;
    }
  }
  
  // A3.8.8: Invariant check - company must never be junk
  const companyBefore = mergedCompany;
  if (mergedCompany && isJunkEntityToken(mergedCompany)) {
    mergedCompany = null;
    if (log && logCounter.count < 3) {
      log(`[CANON][ENTITY_INVARIANT] fixed=true before="${companyBefore}" after="null"`);
      logCounter.count++;
    }
  }
  
  // A3.8.8: Ensure round signals are preserved for all financial claims
  const financialTypes = new Set([
    "investment_amount",
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "ownership_percent",
    "fee_percent",
    "percent",
    "metric_amount",
    "growth_percent",
    "secondary_purchase",
    "structure_term",
  ]);
  const isFinancial = financialTypes.has(first.inferredType);
  
  // If canonical.round is null but statementText contains a round token -> set it
  if (isFinancial && !mergedRound && statementText) {
    const inferredRound = normalizeRoundFromText(statementText);
    if (inferredRound) {
      mergedRound = inferredRound;
    }
  }
  
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
  // A3.8.10: Include statementScopeKey to prevent collisions across statements
  // A3.8.8: Use mergedCompany and mergedRound (after invariant checks)
  const idParts = [
    first.inferredType,
    value !== null ? String(value) : "null",
    currency || unit || "null",
    mergedCompany || "null",
    mergedRound || "null",
    statementScopeKey || (selectionMode ? (selectionHash || "null") : "global"), // A3.8.10: Use statementScopeKey for uniqueness
  ];
  const id = createHash("sha256").update(idParts.join("|")).digest("hex").substring(0, 32);
  
  // Collect raw claim IDs
  const rawClaimIds = groupClaims.map(c => c.rawClaimId);
  
  // Evidence notes
  // A3.8.11: Use user-facing phrasing instead of "Merged X raw claims"
  const evidenceNotes = [];
  if (groupClaims.length > 1) {
    evidenceNotes.push(`Consolidated ${groupClaims.length} extracted signals into one claim`);
  }
  
  // Source span - use best one
  const bestSpan = groupClaims.reduce((best, c) => {
    if (!best || !c.sourceSpan.start) return c.sourceSpan;
    if (!c.sourceSpan.start) return best;
    const bestLength = best.end && best.start ? best.end - best.start : 0;
    const cLength = c.sourceSpan.end && c.sourceSpan.start ? c.sourceSpan.end - c.sourceSpan.start : 0;
    return cLength > bestLength ? c.sourceSpan : best;
  }, null);
  
  // A3.8.41: Preserve qualitative signal anchors through consolidation
  // Collect unique anchor families from all contributing raw claims
  const signalAnchorsSet = new Set();
  for (const c of groupClaims) {
    if (c.anchorFamily && typeof c.anchorFamily === "string") {
      signalAnchorsSet.add(c.anchorFamily);
    }
  }
  const signalAnchors = Array.from(signalAnchorsSet);
  
  // A3.8.41: Log signal preservation for qualitative claims when consolidation occurred
  const isQualitative = first.inferredType === "other_qualitative" || 
                        first.inferredType === "business_description" ||
                        first.inferredType === "investment_thesis" ||
                        first.inferredType === "growth_strategy";
  if (isQualitative && signalAnchors.length > 1 && log) {
    // statementIndex will be added to canonical after merge, so we can't log it here
    // Logging will happen at canonicalizeClaims level if needed
    log(`[A3.8.41][QUAL_SIGNAL_PRESERVE] canonType=${first.inferredType} anchorFamily=${first.anchorFamily || "null"} signalAnchors=[${signalAnchors.join(",")}] rawCount=${groupClaims.length}`);
  }
  
  return {
    id,
    type: first.inferredType,
    value,
    unit,
    currency,
    displayText: bestDisplayText,
    company: mergedCompany, // A3.8.8: Already merged and validated (null if junk)
    round: mergedRound, // A3.8.8: Already merged and inferred for financial claims
    roleKeywords: Array.from(new Set(groupClaims.flatMap(c => c.roleKeywords))),
    anchorFamily: first.anchorFamily,
    signalAnchors: signalAnchors.length > 0 ? signalAnchors : undefined, // A3.8.41: Preserve signal anchors
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
    
  // Prefer text with company and round (A3.8.2: prioritize role keyword + company)
  if (c.roleKeywords.length > 0 && c.entityHints.company) {
    score += 15; // Bonus for role keyword + company
  }
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
 * A3.8.39: Sanitize canonical claim unit/currency invariants
 * Ensures USD types have unit="USD" and currency="USD", percent types have unit="%" and currency=null
 */
function sanitizeCanonicalUnits(claim, statementIndex, log, logCounter) {
  if (!claim || typeof claim !== "object") return claim;
  
  const usdTypes = new Set([
    "valuation_pre_money",
    "valuation_post_money",
    "valuation_enterprise_value",
    "investment_amount",
    "metric_amount",
    "secondary_purchase",
  ]);
  
  const percentTypes = new Set([
    "ownership_percent",
    "fee_percent",
    "growth_percent",
  ]);
  
  let fixedUnit = claim.unit;
  let fixedCurrency = claim.currency;
  const before = { unit: claim.unit, currency: claim.currency, value: claim.value };
  const fixes = [];
  
  // Rule 1: USD types must have unit="USD" and currency="USD" (or null, but NOT "%")
  if (usdTypes.has(claim.type)) {
    if (fixedUnit !== "USD") {
      fixedUnit = "USD";
      fixes.push("unit:USD");
    }
    if (fixedCurrency === "%") {
      // Move "%" from currency to unit if it's there
      fixedCurrency = null;
      if (fixedUnit !== "%") {
        fixedUnit = "USD"; // Ensure unit is USD
      }
      fixes.push("currency:null (was %)");
    } else if (fixedCurrency !== "USD" && fixedCurrency !== null) {
      // Allow null or USD, but if it's something else, set to USD
      fixedCurrency = "USD";
      fixes.push("currency:USD");
    }
  }
  
  // Rule 2: Percent types must have unit="%" and currency=null
  if (percentTypes.has(claim.type)) {
    if (fixedUnit !== "%") {
      fixedUnit = "%";
      fixes.push("unit:%");
    }
    if (fixedCurrency !== null && fixedCurrency !== undefined) {
      fixedCurrency = null;
      fixes.push("currency:null");
    }
  }
  
  // Rule 3: If unit is "%" but type is USD type -> force to USD
  if (fixedUnit === "%" && usdTypes.has(claim.type)) {
    fixedUnit = "USD";
    fixes.push("unit:USD (was %)");
  }
  
  // Rule 4: If currency is "%" anywhere -> move to unit and set currency=null
  if (fixedCurrency === "%") {
    if (fixedUnit !== "%") {
      fixedUnit = "%";
      fixes.push("unit:% (from currency)");
    }
    fixedCurrency = null;
    fixes.push("currency:null (was %)");
  }
  
  // Apply fixes if any
  if (fixes.length > 0) {
    const after = { unit: fixedUnit, currency: fixedCurrency, value: claim.value };
    const claimId = claim.id ? claim.id.substring(0, 8) : "unknown";
    if (log && logCounter.count < 10) {
      log(`[CANON][UNIT_FIX] idx=${statementIndex} claimId=${claimId} type=${claim.type} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      logCounter.count++;
    }
    
    return {
      ...claim,
      unit: fixedUnit,
      currency: fixedCurrency,
    };
  }
  
  return claim;
}

/**
 * Deduplicate canonical claims by ID (A3.8.2: return dropped count)
 */
function deduplicateCanonicalClaims(canonicalClaims, log) {
  const byId = new Map();
  const duplicates = [];
  let droppedCount = 0;
  
  for (const canonical of canonicalClaims) {
    if (byId.has(canonical.id)) {
      duplicates.push(canonical.id);
      droppedCount++;
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
  
  return {
    claims: Array.from(byId.values()),
    droppedCount,
  };
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

