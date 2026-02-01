// lib/analyse-statements-helpers.cjs
// A3.8.192: CommonJS version to avoid Vercel "Unexpected token 'export'" errors
// A3.8.185: Extracted helper functions from analyse-statements-impl.mjs

// A3.8.192: Module load marker
console.log("[DIAG][A3.8.192][HELPERS_CJS_LOADED]");

// A3.8.192: Lazy access to utilities from impl.mjs (ESM)
// Since we can't require() ESM directly, we'll use a getter pattern
// The impl.mjs will inject these utilities when it loads this module
let implUtils = null;

// A3.8.192: Set utilities (called by impl.mjs after it loads this module)
function setImplUtils(utils) {
  implUtils = utils;
}

// A3.8.192: Get utilities with fallback (will be set by impl.mjs)
function getUtils() {
  if (!implUtils) {
    // If not set yet, return a proxy that will throw helpful errors
    throw new Error("[A3.8.192] Helpers utilities not initialized. impl.mjs must call setImplUtils() after loading helpers.cjs");
  }
  return implUtils;
}

// A3.9.21: Real implementation for corpus/search text normalization (used by impl via setImplUtils)
function normalizeTextForSearch(s) {
  if (s == null) return "";
  const str = String(s);
  let out = str.normalize("NFKD").toLowerCase();
  out = out.replace(/[^a-z0-9%$£€¥+\-.\s]/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

// Helper functions used only by these 9 functions
// Helper: Extract human-readable form of a numeric value from text
function extractHumanReadableValue(text, normalizedValue, anchorType) {
  if (typeof text !== "string" || !Number.isFinite(normalizedValue)) return null;
  
  // Patterns to match the value in various formats
  const patterns = [
    // $XXmm, $XXm, $XX million
    /\$([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    /\$([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    /\$([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
    /\$([\d,]+(?:\.\d+)?)/g,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      const unit = (match[2] || "").toLowerCase();
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
      };
      const multiplier = multipliers[unit] || 1;
      const value = num * multiplier;
      
      // Check if this matches the normalized value (within tolerance)
      if (numericValuesMatch(value, normalizedValue)) {
        // Return human-readable form
        if (unit === "mm" || unit === "million" || unit === "m") {
          return `$${num}${unit === "million" ? " million" : unit === "mm" ? "mm" : "m"}`;
        } else if (unit === "billion" || unit === "b") {
          return `$${num}${unit === "billion" ? " billion" : "b"}`;
        } else if (unit === "thousand" || unit === "k") {
          return `$${num}${unit === "thousand" ? " thousand" : "k"}`;
        } else {
          return `$${num}`;
        }
      }
    }
  }
  
  return null;
}

// Helper: Format numeric value to human-readable form
function formatNumericValue(value) {
  if (!Number.isFinite(value)) return String(value);
  
  if (value >= 1e9) {
    const billions = value / 1e9;
    return `$${billions.toFixed(billions >= 10 ? 0 : 1)} billion`;
  } else if (value >= 1e6) {
    const millions = value / 1e6;
    return `$${millions.toFixed(millions >= 10 ? 0 : 1)} million`;
  } else if (value >= 1e3) {
    const thousands = value / 1e3;
    return `$${thousands.toFixed(thousands >= 10 ? 0 : 1)} thousand`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

// Helper: Check if two numeric values match (with 5% tolerance) - imported from corpusSearch logic
function numericValuesMatch(val1, val2) {
  if (typeof val1 !== "number" || typeof val2 !== "number") return false;
  if (!Number.isFinite(val1) || !Number.isFinite(val2)) return false;
  const tolerance = 0.05;
  const diff = Math.abs(val1 - val2);
  const maxVal = Math.max(Math.abs(val1), Math.abs(val2), 1);
  return diff / maxVal <= tolerance;
}

// Helper: Extract numeric values from text (same logic as corpusSearch)
// A3.6.2 PATCH v2: Add percentage extraction for numericMatch
function extractNumericValues(text) {
  if (typeof text !== "string") return [];
  
  const values = [];
  const patterns = [
    // $25mm, $25m, $25 million, $25M
    /\$?([\d,]+(?:\.\d+)?)\s*(mm|million|m\b|M\b)/gi,
    // $2b, $2 billion
    /\$?([\d,]+(?:\.\d+)?)\s*(billion|b\b|B\b)/gi,
    // $2k, $2 thousand
    /\$?([\d,]+(?:\.\d+)?)\s*(thousand|k\b|K\b)/gi,
    // Plain $25, $18.7
    /\$([\d,]+(?:\.\d+)?)/g,
    // A3.6.2 PATCH v2: Percentages - "20%", "~20%" -> 20 (normalized as percentage value)
    /([\d,]+(?:\.\d+)?)\s*%/g,
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const numStr = (match[1] || "").replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!Number.isFinite(num)) continue;
      
      // A3.6.2 PATCH v2: Handle percentages
      if (pattern.source.includes("%")) {
        // Store percentage as-is (20% = 20, not normalized to millions)
        // Use a special marker to distinguish from dollar amounts
        values.push(num * 1e-6); // Store as 0.00002 to distinguish from $20m = 20000000
        // Actually, better: store as negative to distinguish, or use a different approach
        // For now, store as-is and let numericMatch handle the comparison
        values.push(num); // Store percentage value directly
        continue;
      }
      
      const unit = (match[2] || "").toLowerCase();
      const multipliers = {
        mm: 1e6, million: 1e6, m: 1e6,
        billion: 1e9, b: 1e9,
        thousand: 1e3, k: 1e3,
      };
      const multiplier = multipliers[unit] || 1;
      const value = num * multiplier;
      values.push(value);
    }
  }
  
  return [...new Set(values)];
}

// A3.5.13: Detect ambiguity when multiple anchor values exist in corpus
// Returns { isAmbiguous: boolean, anchorType: string|null, values: Array<{value: number, humanForm: string}> }
function detectAnchorAmbiguity(statementText, uploadedDocs) {
  if (typeof statementText !== "string" || !statementText.trim()) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  // Extract anchor facts from statement
  const statementAnchors = getUtils().extractAnchorFacts(statementText);
  if (statementAnchors.length === 0) {
    return { isAmbiguous: false, anchorType: null, values: [] };
  }
  
  const statementAnchorType = statementAnchors[0].type; // Use first anchor type
  const statementValue = statementAnchors[0].value;
  
  // Extract all anchor values of the same type from corpus
  const corpusValues = new Set();
  const corpusValueTexts = new Map(); // Map normalized value -> human-readable form
  
  // Combine all uploaded docs into one corpus text
  const corpusText = uploadedDocs
    .map(doc => doc.text || "")
    .join("\n\n");
  
  // Extract all anchor values of the same type from corpus
  // For each document, extract all numeric values and check context
  for (const doc of uploadedDocs) {
    const docText = doc.text || "";
    if (!docText.trim()) continue;
    
    // Extract all numeric values from this document
    const docNumericValues = extractNumericValues(docText);
    
    // For each numeric value, check if it's in the context of the same anchor type
    for (const numericValue of docNumericValues) {
      // Check context around this value in the document
      const valuePattern = new RegExp(
        `\\$?[\\d,]+(?:\\.[\\d]+)?\\s*(?:mm|million|m|billion|b|thousand|k)?`,
        "gi"
      );
      let match;
      while ((match = valuePattern.exec(docText)) !== null) {
        const matchValue = getUtils().normalizeAnchorValue(match[0]);
        if (!matchValue || !numericValuesMatch(matchValue, numericValue)) continue;
        
        // Extract context around the match (100 chars before and after)
        const contextStart = Math.max(0, match.index - 100);
        const contextEnd = Math.min(docText.length, match.index + match[0].length + 100);
        const context = docText.substring(contextStart, contextEnd).toLowerCase();
        
        // Check if context matches the anchor type
        let matchesType = false;
        if (statementAnchorType === "valuation") {
          matchesType = /(?:pre-?money|pre money|premoney|post-?money|post money|postmoney|valuation|val)/i.test(context);
        } else if (statementAnchorType === "funding") {
          matchesType = /(?:funding|financing|raised|raise|series|round)/i.test(context);
        } else if (statementAnchorType === "revenue") {
          matchesType = /(?:revenue|sales|income)/i.test(context);
        } else {
          // For "numeric" type, accept any numeric value
          matchesType = true;
        }
        
        if (matchesType) {
          corpusValues.add(numericValue);
          
          // Extract human-readable form
          const humanForm = extractHumanReadableValue(docText, numericValue, statementAnchorType);
          if (humanForm) {
            corpusValueTexts.set(numericValue, humanForm);
          } else {
            // Fallback: format the normalized value
            corpusValueTexts.set(numericValue, formatNumericValue(numericValue));
          }
          break; // Found this value, move to next
        }
      }
    }
  }
  
  // If we have fewer than 2 distinct values, no ambiguity
  if (corpusValues.size < 2) {
    return { isAmbiguous: false, anchorType: statementAnchorType, values: [] };
  }
  
  // Check if statement value matches any corpus value (within tolerance)
  const statementMatches = Array.from(corpusValues).some(corpusValue => {
    return numericValuesMatch(statementValue, corpusValue);
  });
  
  // Ambiguity exists if: multiple distinct values in corpus AND statement doesn't uniquely match one
  const isAmbiguous = corpusValues.size >= 2;
  
  if (isAmbiguous) {
    // Convert to human-readable forms
    const values = Array.from(corpusValues)
      .slice(0, 5) // Limit to 5 values
      .map(value => ({
        value,
        humanForm: corpusValueTexts.get(value) || formatNumericValue(value),
      }));
    
    return {
      isAmbiguous: true,
      anchorType: statementAnchorType,
      values,
    };
  }
  
  return { isAmbiguous: false, anchorType: statementAnchorType, values: [] };
}

function enforceCorpusVerificationBeforeAbsence(statements, uploadedSources, unifiedReferences = [], runId = null, reqSig = null) {
  // A3.5.20 Fix 3: Log with RID+SIG if provided
  const log = (runId && reqSig) ? (...args) => getUtils().diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) return statements;
  
  // Invariant 1: Full corpus availability - only process if uploaded sources exist with full text
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) {
    // No full text available - do not allow absence language
    return statements.map((stmt) => {
      if (!stmt || typeof stmt !== "object") return stmt;
      const assessment = stmt.assessment || {};
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      
      if (getUtils().hasAbsenceClaim(reasons)) {
        // Replace absence language with weaker wording
        const updatedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          const lower = reason.toLowerCase();
          if (/not (?:mentioned|specified|found|stated) in (?:the )?uploaded (?:memo|sources)/i.test(lower)) {
            return "This claim was not confirmed in the sources reviewed.";
          }
          return reason;
        });
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons.slice(0, 4),
          },
        };
      }
      return stmt;
    });
  }
  
  // Format uploaded docs for corpusSearch utility
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  return statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    // A3.6.4: Guard against invalid index
    if (typeof idx !== "number") idx = -1;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // A3.5.13 Addendum - Anchor Absence Precedence:
    // For anchor facts, if uploaded sources exist, corpusSearch MUST run first
    // Missing citations MUST NOT trigger absence language without corpusSearch
    const isAnchor = getUtils().isAnchorFact(text);
    const uploadedSourcesCount = docsWithFullText.length;
    
    // A3.5.13c: Check for compound numeric anchors first
    const compoundNumericResult = getUtils().validateCompoundNumericAnchors(text, uploadedDocs);
    
    // If compound numeric anchors detected, reconcile reasons
    if (compoundNumericResult.elements.length >= 2) {
      console.log(`[DIAG] A3.5.13c: Compound numeric anchor detected (${compoundNumericResult.elements.length} elements)`);
      
      // Invariant 3: Citation / Evidence Injection
      // If any anchor element is SUPPORTED or AMBIGUOUS by uploaded sources and statement has empty citations
      const existingCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
      const hasAnySupported = compoundNumericResult.supportedKinds.size > 0 || compoundNumericResult.ambiguousKinds.size > 0;
      
      if (hasAnySupported && existingCitations.length === 0) {
        // Find uploaded memo reference ID
        let memoReferenceId = null;
        if (Array.isArray(unifiedReferences) && unifiedReferences.length > 0) {
          const uploadedRef = unifiedReferences.find(ref => ref?.type === "uploaded");
          if (uploadedRef && uploadedRef.id != null) {
            memoReferenceId = uploadedRef.id;
          } else if (uploadedSources.length > 0) {
            memoReferenceId = 1; // Fallback
          }
        }
        
        // Inject memo reference ID
        let injectedCitations = [];
        if (memoReferenceId != null) {
          injectedCitations = [memoReferenceId];
        }
        
        // Build evidence
        const evidence = [];
        if (injectedCitations.length > 0 && Array.isArray(unifiedReferences)) {
          const referencesById = new Map();
          unifiedReferences.forEach((ref) => {
            const id = ref?.id;
            if (id != null) {
              referencesById.set(String(id), ref);
            }
          });
          
          injectedCitations.forEach((citationId) => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey && referencesById.has(citationKey)) {
              const ref = referencesById.get(citationKey);
              const refType = ref?.type || (ref?.url ? "web" : "uploaded");
              evidence.push({
                title: ref?.title || "Untitled source",
                url: ref?.url || null,
                sourceType: refType,
              });
            }
          });
        }
        
        
        // Invariant 4: Reason Reconciliation (hard rule)
        // Remove contradictory reasons and generate deterministic templates
        const kindLabels = {
          investment_amount: "investment amount",
          valuation_premoney: "pre-money valuation",
          ownership_pct: "ownership percentage",
          secondary_amount: "secondary amount",
          other_numeric: "numeric value",
        };
        
        // Helper to format element value (handles percentages differently)
        const formatElementValue = (element) => {
          if (element.kind === "ownership_pct") {
            return `${element.normalizedNumber}%`;
          }
          return formatNumericValue(element.normalizedNumber);
        };
        
        // Build supported elements list
        const supportedElements = [];
        for (const kind of compoundNumericResult.supportedKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length > 0) {
            const element = elementsOfKind[0];
            const label = kindLabels[kind] || kind;
            const humanForm = formatElementValue(element);
            supportedElements.push(`${label} (${humanForm})`);
          }
        }
        
        // Build missing elements list
        const missingElements = [];
        for (const kind of compoundNumericResult.missingKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length > 0) {
            const element = elementsOfKind[0];
            const label = kindLabels[kind] || kind;
            const humanForm = formatElementValue(element);
            missingElements.push(`${label} (${humanForm})`);
          }
        }
        
        // Build ambiguous elements list
        const ambiguousElements = [];
        for (const kind of compoundNumericResult.ambiguousKinds) {
          const elementsOfKind = compoundNumericResult.elements.filter(e => e.kind === kind);
          if (elementsOfKind.length >= 2) {
            const label = kindLabels[kind] || kind;
            const values = elementsOfKind.map(e => formatElementValue(e));
            ambiguousElements.push({
              kind: label,
              values: values.slice(0, 2), // Limit to 2 values
            });
          }
        }
        
        // Generate deterministic reason templates
        const reconciledReasons = [];
        
        // Supported elements
        if (supportedElements.length > 0) {
          const supportedText = supportedElements.length === 1
            ? supportedElements[0]
            : supportedElements.slice(0, -1).join(", ") + " and " + supportedElements[supportedElements.length - 1];
          reconciledReasons.push(`Uploaded memo supports: ${supportedText}.`);
        }
        
        // Missing elements
        if (missingElements.length > 0) {
          const missingText = missingElements.length === 1
            ? missingElements[0]
            : missingElements.slice(0, -1).join(", ") + " and " + missingElements[missingElements.length - 1];
          reconciledReasons.push(`Uploaded memo does not support: ${missingText} (not found).`);
        }
        
        // Ambiguous elements
        for (const ambiguous of ambiguousElements) {
          const valuesText = ambiguous.values.join(" and ");
          reconciledReasons.push(`Memo mentions multiple ${ambiguous.kind}s (${valuesText}), creating ambiguity; statement selects ${ambiguous.values[0]}.`);
        }
        
        // Remove contradictory reasons from existing reasons
        const reasonsToRemove = [];
        const updatedReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          
          // Remove any reason that contradicts supported kinds
          for (const kind of compoundNumericResult.supportedKinds) {
            const label = kindLabels[kind] || kind;
            if (lower.includes(label) && (
              /not (?:specified|mentioned|found|stated)/i.test(lower) ||
              /does not (?:specify|mention|provide|contain)/i.test(lower) ||
              /memo does not/i.test(lower)
            )) {
              reasonsToRemove.push(reason);
              return false; // Remove this reason
            }
          }
          
          // Remove any reason that contradicts ambiguous kinds
          for (const kind of compoundNumericResult.ambiguousKinds) {
            const label = kindLabels[kind] || kind;
            if (lower.includes(label) && /not (?:specified|mentioned)/i.test(lower)) {
              reasonsToRemove.push(reason);
              return false;
            }
          }
          
          return true;
        });
        
        // Combine reconciled reasons with non-contradictory existing reasons
        const finalReasons = [...reconciledReasons, ...updatedReasons].slice(0, 4);
        
        if (reasonsToRemove.length > 0) {
          console.log(`[DIAG] A3.5.13c: Removed ${reasonsToRemove.length} contradictory reasons`);
        }
        
        // Invariant 5: Scoring (minimal change)
        // If ≥1 anchor element SUPPORTED and ≥1 NOT_FOUND → label at most Medium, score cap <=60
        let updatedScore = assessment.reliabilityScore;
        let updatedLabel = assessment.reliabilityLabel;
        if (compoundNumericResult.supportedKinds.size > 0 && compoundNumericResult.missingKinds.size > 0) {
          // Partial support - cap at Medium
          if (updatedScore > 60) {
            updatedScore = Math.min(updatedScore, 60);
            updatedLabel = "Medium";
          } else if (updatedLabel === "High") {
            updatedLabel = "Medium";
          }
        }
        
        return {
          ...stmt,
          citations: injectedCitations,
          evidence: evidence,
          assessment: {
            ...assessment,
            citations: injectedCitations,
            evidence: evidence,
            reasons: finalReasons,
            reliabilityScore: updatedScore,
            reliabilityLabel: updatedLabel,
          },
        };
      }
    }
    
    // A3.5.13 Addendum: Check for compound anchors first (for both absence and non-absence cases)
    const compoundAnchorResult = getUtils().decomposeAndValidateCompoundAnchors(text, uploadedDocs);
    
    // If compound anchors detected, validate each independently
    if (compoundAnchorResult.anchors.length >= 2) {
      console.log(`[DIAG] A3.5.13: Compound anchor detected (${compoundAnchorResult.anchors.length} anchors)`);
      
      // If all anchors found → fully supported
      if (compoundAnchorResult.allFound) {
        // Replace absence language with support language
        let updatedReasons = reasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          const lower = reason.toLowerCase();
          
          // Remove absence claims
          if (/not mentioned/i.test(lower) || /not supported/i.test(lower) || /no support/i.test(lower) || 
              /not found/i.test(lower) || /not stated/i.test(lower)) {
            return "All anchor facts in this statement are supported by the uploaded sources.";
          }
          return reason;
        });
        
        // Remove any remaining absence language
        updatedReasons = updatedReasons.filter((reason) => {
          if (typeof reason !== "string") return true;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        // If all reasons were removed, add support reason
        if (updatedReasons.length === 0) {
          updatedReasons = ["All anchor facts in this statement are supported by the uploaded sources."];
        }
        
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons.slice(0, 4),
          },
        };
      }
      
      // If some anchors found → partially supported or ambiguous
      if (compoundAnchorResult.someFound) {
        // Build explicit enumeration of supported vs missing anchors
        const foundAnchorNames = compoundAnchorResult.foundAnchors.map(a => {
          if (a.type === "valuation") return "valuation";
          if (a.type === "funding") return "funding amount";
          if (a.type === "revenue") return "revenue";
          if (a.type === "ownership") return "ownership percentage";
          if (a.type === "governance") return a.keyword || "governance rights";
          if (a.type === "security") return a.keyword || "security terms";
          return "numeric value";
        });
        
        const missingAnchorNames = compoundAnchorResult.missingAnchors.map(a => {
          if (a.type === "valuation") return "valuation";
          if (a.type === "funding") return "funding amount";
          if (a.type === "revenue") return "revenue";
          if (a.type === "ownership") return "ownership percentage";
          if (a.type === "governance") return a.keyword || "governance rights";
          if (a.type === "security") return a.keyword || "security terms";
          return "numeric value";
        });
        
        // Replace absence language with explicit partial support language
        let updatedReasons = [];
        
        // Add explicit enumeration
        if (foundAnchorNames.length > 0 && missingAnchorNames.length > 0) {
          const foundText = foundAnchorNames.length === 1 
            ? foundAnchorNames[0] 
            : foundAnchorNames.slice(0, -1).join(", ") + " and " + foundAnchorNames[foundAnchorNames.length - 1];
          const missingText = missingAnchorNames.length === 1
            ? missingAnchorNames[0]
            : missingAnchorNames.slice(0, -1).join(", ") + " and " + missingAnchorNames[missingAnchorNames.length - 1];
          
          updatedReasons.push(
            `The uploaded sources support ${foundText}, but do not explicitly support ${missingText}.`
          );
          updatedReasons.push(
            "This statement combines multiple anchor facts; some are supported while others are not found in the uploaded sources."
          );
        }
        
        // Keep non-absence reasons
        const nonAbsenceReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        updatedReasons = [...updatedReasons, ...nonAbsenceReasons].slice(0, 4);
        
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons,
          },
        };
      }
      
      // If no anchors found, continue to standard absence check below
    }
    
    // A3.5.13 Addendum - Anchor Absence Precedence:
    // For anchor facts with uploaded sources, corpusSearch MUST run FIRST
    // This ensures corpusSearch determines support before any absence language is considered
    // Missing citations MUST NOT trigger absence language without corpusSearch
    // A3.5.13b: When corpusSearch finds support, inject citations and build evidence
    // A3.5.14 Part B: Also check WORLD_FACT statements with empty citations
    const existingCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const hasEmptyCitations = existingCitations.length === 0;
    
    // Check if this is a WORLD_FACT statement or contains anchor numbers
    const classification = getUtils().classifyStatementAndProvenance(stmt, unifiedReferences);
    const isWorldFact = classification.category === "WORLD_FACT";
    
    // Check for anchor number indicators: $, %, "pre-money", "ownership", "secondary", "board seats", "preferred"
    const hasAnchorNumbers = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?|\b\d+(?:\.\d+)?\s*%|\b(pre-money|post-money|ownership|secondary|board\s+seats?|preferred)\b)/i.test(text);
    
    // A3.5.14 Part B: Check for WORLD_FACT or anchor-number statements with empty citations
    const shouldCheckForMemoCitation = (isAnchor || (isWorldFact && hasAnchorNumbers)) && hasEmptyCitations && uploadedSourcesCount > 0;
    
    let searchResult = null;
    if (shouldCheckForMemoCitation) {
      // Run corpusSearch FIRST (before checking for absence claims)
      searchResult = getUtils().corpusSearch(text, uploadedDocs);
      
      // A3.5.14 Part B: If corpusSearch returns FOUND with number match and keyword match
      if (searchResult.found && searchResult.debug) {
        const hasNumberMatch = Array.isArray(searchResult.debug.normalizedNumbersFound) && searchResult.debug.normalizedNumbersFound.length > 0;
        const hasKeywordMatch = Array.isArray(searchResult.debug.keywordsMatched) && searchResult.debug.keywordsMatched.length > 0;
        
        if (hasNumberMatch || hasKeywordMatch) {
        // A3.5.14 Part B: corpusSearch found matches - inject citations and build evidence
        // Invariant 1: Support Must Attach a Source
        const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
        
        // Find uploaded memo reference ID
        let memoReferenceId = null;
        if (Array.isArray(unifiedReferences) && unifiedReferences.length > 0) {
          // Find first uploaded reference
          const uploadedRef = unifiedReferences.find(ref => ref?.type === "uploaded");
          if (uploadedRef && uploadedRef.id != null) {
            memoReferenceId = uploadedRef.id;
          } else {
            // Fallback to first uploaded reference by index (1-based for uploaded sources)
            if (uploadedSources.length > 0) {
              memoReferenceId = 1; // Uploaded references start at 1
            }
          }
        }
        
        // Inject memo reference ID if not already present
        let injectedCitations = [...existingCitations];
        if (memoReferenceId != null && !injectedCitations.includes(memoReferenceId)) {
          injectedCitations.push(memoReferenceId);
          injectedCitations.sort((a, b) => a - b);
        }
        
        // Invariant 2: Evidence Must Be Built
        const evidence = [];
        if (injectedCitations.length > 0 && Array.isArray(unifiedReferences)) {
          const referencesById = new Map();
          unifiedReferences.forEach((ref) => {
            const id = ref?.id;
            if (id != null) {
              referencesById.set(String(id), ref);
            }
          });
          
          injectedCitations.forEach((citationId) => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey && referencesById.has(citationKey)) {
              const ref = referencesById.get(citationKey);
              const refType = ref?.type || (ref?.url ? "web" : "uploaded");
              evidence.push({
                title: ref?.title || "Untitled source",
                url: ref?.url || null,
                sourceType: refType,
              });
            }
          });
        }
        
        // Invariant 3: Absence Reasons Must Not Survive
        // Remove any absence reasons
        let updatedReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower) ||
            /anchor fact requires/i.test(lower) ||
            /none was cited/i.test(lower) ||
            /does not provide/i.test(lower) ||
            /cannot be verified/i.test(lower) ||
            /memo does not/i.test(lower)
          );
        });
        
        // A3.5.14 Part B: Replace absence reasons with compound anchor template if applicable
        // Check if statement expresses a range or has multiple figures
        const hasRange = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)\s*[-–—]\s*(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)/i.test(text);
        
        // A3.5.14 Part C: Check for ambiguity (multiple figures)
        let _detectAnchorAmbiguity1;
        try { _detectAnchorAmbiguity1 = detectAnchorAmbiguity; } catch (_) { _detectAnchorAmbiguity1 = undefined; }
        const ambiguityResult = (typeof _detectAnchorAmbiguity1 !== "function")
          ? (console.log("[DIAG][A3.8.181][MISSING_DETECT_ANCHOR_AMBIGUITY_FN]", { name: "detectAnchorAmbiguity" }), { isAmbiguous: false, anchorType: null, values: [] })
          : _detectAnchorAmbiguity1(text, uploadedDocs);
        const isAmbiguous = ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2;
        
        // Initialize score/label variables (may be updated in ambiguity case)
        let updatedScore = assessment.reliabilityScore;
        let updatedLabel = assessment.reliabilityLabel;
        
        if (isAmbiguous || hasRange) {
          // A3.5.14 Part C: Use AMBIGUOUS_WITHIN_SOURCES template
          const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
            ? "valuation figure"
            : ambiguityResult.anchorType === "funding"
            ? "funding amount"
            : ambiguityResult.anchorType === "revenue"
            ? "revenue figure"
            : "numeric value";
          
          const valueList = ambiguityResult.values
            .slice(0, 2)
            .map(v => v.humanForm)
            .join(" and ");
          
          const ambiguityReason = `The uploaded memo references more than one ${anchorTypeLabel} (e.g., ${valueList}). This statement's ${ambiguityResult.anchorType || "value"} should be clarified to match the intended figure.`;
          updatedReasons = [ambiguityReason, ...updatedReasons].slice(0, 4);
          
          // A3.5.14 Part C: Cap reliabilityLabel at Medium unless statement explicitly matches one figure exactly
          
          // Check if statement explicitly matches one figure exactly (no range)
          const statementNumericValues = extractNumericValues(text);
          const exactMatch = statementNumericValues.length === 1 && 
            ambiguityResult.values.some(v => numericValuesMatch(v.value, statementNumericValues[0]));
          
          if (!exactMatch) {
            // Cap at Medium
            if (updatedScore > 60) {
              updatedScore = Math.min(updatedScore, 60);
            }
            if (updatedLabel === "High") {
              updatedLabel = "Medium";
            }
          }
        } else {
          // A3.5.14 Part B: Use compound anchor template for non-ambiguous cases
          const anchorFacts = getUtils().extractAnchorFacts(text);
          const anchorType = anchorFacts.length > 0 ? anchorFacts[0].type : null;
          let anchorTypeLabel = "anchor fact";
          if (anchorType === "valuation") anchorTypeLabel = "valuation figure";
          else if (anchorType === "funding") anchorTypeLabel = "funding amount";
          else if (anchorType === "revenue") anchorTypeLabel = "revenue figure";
          else if (anchorType === "ownership") anchorTypeLabel = "ownership percentage";
          else if (anchorType === "governance") anchorTypeLabel = "governance rights";
          else if (anchorType === "security") anchorTypeLabel = "security terms";
          
          // A3.5.14 Part B: Use compound anchor template
          const supportReason = `The uploaded memo contains the cited term(s) / figure(s), but wording in this statement combines multiple deal terms; interpret with care.`;
          updatedReasons = [supportReason, ...updatedReasons].slice(0, 4);
        }
        
        // Fix 2: Remove old injection code - let enforceAnchorCitationsAndAmbiguity() handle it as LAST mutation step
        // This code is kept for backward compatibility but injection is deferred to enforceAnchorCitationsAndAmbiguity()
        // Continue to standard absence/ambiguity check below
        }
      }
      // If corpusSearch found nothing, continue to standard absence/ambiguity check below
    }
    
    // Invariant 2: Mandatory corpusSearch before absence language
    // Check if reasons contain absence claims
    if (!getUtils().hasAbsenceClaim(reasons)) return stmt; // No absence claim, no action needed
    
    // A3.5.13: Check for ambiguity (before corpus search)
    let _detectAnchorAmbiguity2;
    try { _detectAnchorAmbiguity2 = detectAnchorAmbiguity; } catch (_) { _detectAnchorAmbiguity2 = undefined; }
    const ambiguityResult = (typeof _detectAnchorAmbiguity2 !== "function")
      ? (console.log("[DIAG][A3.8.181][MISSING_DETECT_ANCHOR_AMBIGUITY_FN]", { name: "detectAnchorAmbiguity" }), { isAmbiguous: false, anchorType: null, values: [] })
      : _detectAnchorAmbiguity2(text, uploadedDocs);
    
    // Perform deterministic corpus search (A3.5.12) - only if not already done
    if (!searchResult) {
      // A3.5.20 Fix 3: Log corpusSearch call with RID+SIG
      // A3.6.4: Fix - use idx from map callback scope
      if (runId && reqSig) {
        getUtils().diag(runId, reqSig, `[corpusSearch] calling for statement idx=${idx !== undefined ? idx : 'unknown'}`);
      }
      searchResult = getUtils().corpusSearch(text, uploadedDocs);
      if (runId && reqSig) {
        getUtils().diag(runId, reqSig, `[corpusSearch] result found=${searchResult?.found || false}`);
      }
    }
    
    if (searchResult.found) {
      // Corpus search found matches - MUST NOT state absence (Invariant 2)
      
      // A3.5.13: If ambiguity detected, use ambiguity template instead of generic support language
      if (ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2) {
        const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
          ? "pre-money valuation figures"
          : ambiguityResult.anchorType === "funding"
          ? "funding amounts"
          : ambiguityResult.anchorType === "revenue"
          ? "revenue figures"
          : "numeric values";
        
        const valueList = ambiguityResult.values
          .slice(0, 2)
          .map(v => v.humanForm)
          .join(" and ");
        
        // Use exact template from spec
        const ambiguityReason1 = `The uploaded memo references multiple ${anchorTypeLabel} (e.g., ${valueList}), so the precise ${ambiguityResult.anchorType || "value"} for this draft version is ambiguous.`;
        const ambiguityReason2 = "This is supported by the memo, but not uniquely confirmed to a single figure.";
        
        // Replace all absence language with ambiguity explanation
        let updatedReasons = [ambiguityReason1, ambiguityReason2];
        
        // Remove any remaining absence language
        const filteredReasons = reasons.filter((reason) => {
          if (typeof reason !== "string") return false;
          const lower = reason.toLowerCase();
          return !(
            /not mentioned/i.test(lower) ||
            /not specified/i.test(lower) ||
            /not supported/i.test(lower) ||
            /no support/i.test(lower) ||
            /not found/i.test(lower) ||
            /not stated/i.test(lower) ||
            /not referenced/i.test(lower) ||
            /not cited/i.test(lower) ||
            /not present/i.test(lower) ||
            /absent/i.test(lower) ||
            /lacks?/i.test(lower) ||
            /missing/i.test(lower)
          );
        });
        
        // Keep non-absence reasons (up to 2 more, capped at 4 total)
        updatedReasons = [...updatedReasons, ...filteredReasons].slice(0, 4);
        
        // Diagnostics (A3.5.13)
        console.log(`[DIAG] A3.5.13: Ambiguity detected - replaced absence language:`, {
          anchorType: ambiguityResult.anchorType,
        });
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reasons: updatedReasons,
          },
        };
      }
      
      // No ambiguity - use standard support language
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        const lower = reason.toLowerCase();
        
        // Replace absence claims with support language
        if (/not mentioned/i.test(lower)) {
          return "This information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not specified/i.test(lower)) {
          return "This information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not supported/i.test(lower) || /no support/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact claim may not be explicitly stated.";
        }
        if (/not found/i.test(lower)) {
          return "Related information appears in the uploaded sources, though the exact phrasing may differ.";
        }
        if (/not stated/i.test(lower) || /not referenced/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact phrasing may differ.";
        }
        if (/no (?:source|sources|memo|document).*(?:mention|state|reference|cite)/i.test(lower)) {
          return "The uploaded sources contain related information, though the exact phrasing may differ.";
        }
        
        return reason;
      });
      
      // Remove any remaining absence language
      updatedReasons = updatedReasons.filter((reason) => {
        if (typeof reason !== "string") return true;
        const lower = reason.toLowerCase();
        return !(
          /not mentioned/i.test(lower) ||
          /not specified/i.test(lower) ||
          /not supported/i.test(lower) ||
          /no support/i.test(lower) ||
          /not found/i.test(lower) ||
          /not stated/i.test(lower) ||
          /not referenced/i.test(lower) ||
          /not cited/i.test(lower) ||
          /not present/i.test(lower) ||
          /absent/i.test(lower) ||
          /lacks?/i.test(lower) ||
          /missing/i.test(lower)
        );
      });
      
      // If all reasons were removed, add a default support reason
      if (updatedReasons.length === 0) {
        updatedReasons = ["The uploaded sources contain related information, though the exact phrasing may differ."];
      }
      
      // Diagnostics (A3.5.12)
      const matchTypes = [...new Set(searchResult.hits.map(h => h.matchType))];
      console.log(`[DIAG] A3.5.12: Prevented absence claim - corpusSearch found matches`);
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    } else {
      // Corpus search found no matches - absence language MAY be used
      // But ensure it explicitly refers to uploaded sources
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        const lower = reason.toLowerCase();
        
        // Ensure absence language explicitly refers to uploaded sources
        if (/not mentioned/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not mentioned/i, "not found in the uploaded memo after review");
        }
        if (/not specified/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not specified/i, "not found in the uploaded memo after review");
        }
        if ((/not supported/i.test(lower) || /no support/i.test(lower)) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/(?:not supported|no support)/i, "not found in the uploaded memo after review");
        }
        if (/not found/i.test(lower) && !/uploaded/i.test(lower) && !/memo/i.test(lower)) {
          return reason.replace(/not found/i, "not found in the uploaded memo after review");
        }
        
        return reason;
      });
      
      // Ensure at least one reason explicitly mentions uploaded sources
      const hasUploadedReference = updatedReasons.some((r) => 
        typeof r === "string" && (/uploaded/i.test(r) || /memo/i.test(r))
      );
      
      if (!hasUploadedReference && updatedReasons.length > 0) {
        // Prepend a reason that explicitly references uploaded sources
        updatedReasons = [
          "Not found in the uploaded memo after review.",
          ...updatedReasons,
        ].slice(0, 4);
      }
      
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
  });
}

function enforceAnchorCitationsAndAmbiguity(statements, uploadedSources, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) return statements;
  
  // Format uploaded docs for corpusSearch
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) return statements;
  
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  // Find memo reference ID (id=1 for first uploaded source)
  const memoReferenceId = 1;
  const memoReference = unifiedReferences.find(ref => ref?.id === memoReferenceId && ref?.type === "uploaded");
  
  let checked = 0;
  let foundNoCite = 0;
  let injected = 0;
  let foundButNotInjected = 0;
  
  const updatedStatements = statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    // A3.5.18: Collect existing citations from both locations (merge for idempotency)
    const existingAssessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
    // Merge all existing citations (use Set to dedupe)
    const existingCitationsSet = new Set([...existingAssessmentCitations, ...existingTopLevelCitations]);
    const existingCitations = Array.from(existingCitationsSet);
    const hasEmptyCitations = existingCitations.length === 0;
    
    // Check if this is a WORLD_FACT or contains anchor terms
    const classification = getUtils().classifyStatementAndProvenance(stmt, unifiedReferences);
    const isWorldFact = classification.category === "WORLD_FACT";
    
    // Check for anchor terms: Series A|pre-money|valuation|fully diluted|ownership|secondary purchase|%
    const hasAnchorTerms = /(series\s+[a-z]|pre-money|post-money|valuation|fully\s+diluted|ownership|secondary\s+purchase|%)/i.test(text);
    
    // Fix 2: Count ALL anchor-heavy statements for accurate summary (even if they already have citations)
    if (isWorldFact || hasAnchorTerms) {
      checked++;
    }
    
    // Check if should enforce (only if empty citations)
    const shouldEnforce = (isWorldFact || hasAnchorTerms) && hasEmptyCitations;
    
    if (!shouldEnforce) return stmt;
    
    // Run corpusSearch (with error handling)
    let searchResult;
    try {
      searchResult = getUtils().corpusSearch(text, uploadedDocs);
    } catch (searchErr) {
      console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] corpusSearch failed for idx=${idx}:`, searchErr);
      return stmt; // Continue without injection if search fails
    }
    
    if (searchResult && searchResult.found) {
      // Check if has number match or keyword match
      const hasNumberMatch = searchResult.debug && 
        Array.isArray(searchResult.debug.normalizedNumbersFound) && 
        searchResult.debug.normalizedNumbersFound.length > 0;
      const hasKeywordMatch = searchResult.debug && 
        Array.isArray(searchResult.debug.keywordsMatched) && 
        searchResult.debug.keywordsMatched.length > 0;
      
      // Fix 3: Inject citation if FOUND, even if extraction fails
      if (hasNumberMatch || hasKeywordMatch) {
        foundNoCite++;
        
        try {
          // A3.5.18: Inject memo citation - merge with existing (idempotent)
          // Ensure memoReferenceId is included but don't duplicate
          const citationSet = new Set(existingCitations);
          citationSet.add(memoReferenceId);
          const injectedCitations = Array.from(citationSet).sort((a, b) => a - b);
          
          // Build evidence - merge with existing evidence and build for all citations (idempotent)
          const existingEvidence = Array.isArray(stmt.evidence) ? stmt.evidence : 
                                   (Array.isArray(assessment.evidence) ? assessment.evidence : []);
          const evidenceSet = new Map();
          
          // Add existing evidence to set (keyed by title to avoid duplicates)
          existingEvidence.forEach(ev => {
            const key = ev?.title || ev?.url || String(ev);
            if (key && !evidenceSet.has(key)) {
              evidenceSet.set(key, ev);
            }
          });
          
          // Build evidence for all citations from unifiedReferences
          injectedCitations.forEach(citationId => {
            const citationKey = citationId != null ? String(citationId) : null;
            if (citationKey) {
              const ref = unifiedReferences.find(r => String(r?.id) === citationKey);
              if (ref) {
                const refEvidence = {
                  title: ref.title || "Untitled source",
                  url: ref.url || null,
                  sourceType: ref.type || (ref.url ? "web" : "uploaded"),
                };
                const refKey = refEvidence.title || refEvidence.url || citationKey;
                if (!evidenceSet.has(refKey)) {
                  evidenceSet.set(refKey, refEvidence);
                }
              }
            }
          });
          
          const evidence = Array.from(evidenceSet.values());
          
          // Remove absence reasons
          const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
          let updatedReasons = reasons.filter((reason) => {
            if (typeof reason !== "string") return false;
            const lower = reason.toLowerCase();
            return !(
              /not found in memo/i.test(lower) ||
              /does not mention/i.test(lower) ||
              /no citations provided/i.test(lower) ||
              /cannot be confirmed from provided text/i.test(lower) ||
              /not mentioned/i.test(lower) ||
              /not supported/i.test(lower) ||
              /not found/i.test(lower)
            );
          });
          
          // A3.5.14b Patch 3: Check for ambiguity (multiple figures/ranges) - with error handling
          let isAmbiguous = false;
          try {
            const hasRange = /(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)\s*[-–—]\s*(\$[\d,]+(?:\.\d+)?\s*(?:mm|million|m|billion|b|thousand|k)?)/i.test(text);
            let _detectAnchorAmbiguity3;
            try { _detectAnchorAmbiguity3 = detectAnchorAmbiguity; } catch (_) { _detectAnchorAmbiguity3 = undefined; }
            const ambiguityResult = (typeof _detectAnchorAmbiguity3 !== "function")
              ? (console.log("[DIAG][A3.8.181][MISSING_DETECT_ANCHOR_AMBIGUITY_FN]", { name: "detectAnchorAmbiguity" }), { isAmbiguous: false, anchorType: null, values: [] })
              : _detectAnchorAmbiguity3(text, uploadedDocs);
            isAmbiguous = (ambiguityResult.isAmbiguous && ambiguityResult.values.length >= 2) || hasRange;
            
            if (isAmbiguous) {
              // A3.5.14b Patch 3: Use ambiguity template
              const anchorTypeLabel = ambiguityResult.anchorType === "valuation" 
                ? "valuation figures"
                : ambiguityResult.anchorType === "funding"
                ? "funding amounts"
                : "numeric values";
              
              const valueList = ambiguityResult.values && ambiguityResult.values.length >= 2
                ? ambiguityResult.values.slice(0, 2).map(v => v.humanForm).join(" and ")
                : "multiple values";
              
              const ambiguityReason = `The memo contains related ${anchorTypeLabel}; the statement's exact value may be ambiguous relative to multiple memo values. Verify which applies.`;
              updatedReasons = [ambiguityReason, ...updatedReasons].slice(0, 4);
              
              console.log(`[DIAG][AMBIGUITY] idx=${idx} trigger=${hasRange ? "RANGE" : "MULTI_MATCH"} numsInStmt=${JSON.stringify(extractNumericValues(text))} numsInMemo=${JSON.stringify(ambiguityResult.values?.map(v => v.value) || [])}`);
            } else {
              // A3.5.14b Patch 2: Use standard enforcement reason
              updatedReasons = ["Memo contains related support; citation added via invariant enforcement.", ...updatedReasons].slice(0, 4);
            }
          } catch (ambiguityErr) {
            // If ambiguity detection fails, use standard enforcement reason
            console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] ambiguity detection failed for idx=${idx}:`, ambiguityErr);
            updatedReasons = ["Memo contains related support; citation added via invariant enforcement.", ...updatedReasons].slice(0, 4);
          }
          
          injected++;
          
          const beforeState = {
            assessCites: existingCitations.length,
            topCites: existingTopLevelCitations.length,
            evidenceCount: (Array.isArray(assessment.evidence) ? assessment.evidence.length : 0) + (Array.isArray(stmt.evidence) ? stmt.evidence.length : 0)
          };
          
          // A3.5.18 Fix 3: Fix negative removedAbsenceReasons counter
          const removedCount = Math.max(0, reasons.length - updatedReasons.length);
          console.log(`[DIAG][ANCHOR_ENFORCE] idx=${idx} before=${JSON.stringify(beforeState)} after={assessCites:${injectedCitations.length},topCites:${injectedCitations.length},evidenceCount:${evidence.length}} removedAbsenceReasons=${removedCount}`);
          
          return {
            ...stmt,
            citations: injectedCitations,
            evidence: evidence,
            assessment: {
              ...assessment,
              citations: injectedCitations,
              evidence: evidence,
              reasons: updatedReasons,
            },
          };
        } catch (injectionErr) {
          console.error(`[DIAG][ANCHOR_ENFORCE][ERROR] citation injection failed for idx=${idx}:`, injectionErr);
          foundButNotInjected++;
          return stmt; // Continue without injection if it fails
        }
      } else {
        foundButNotInjected++;
      }
    }
    
    return stmt;
  });
  
  console.log(`[DIAG][ANCHOR_ENFORCE][SUMMARY] checked=${checked} foundNoCite=${foundNoCite} injected=${injected} foundButNotInjected=${foundButNotInjected}`);
  
  return updatedStatements;
}

function backfillCitations(statements, uploadedSources, unifiedReferences, runId = null, reqSig = null) {
  const log = (runId && reqSig) ? (...args) => getUtils().diag(runId, reqSig, ...args) : console.log;
  
  if (!Array.isArray(statements) || !Array.isArray(uploadedSources)) {
    return { statements, attempted: 0, injected: 0, skippedShort: 0 };
  }
  
  // Format uploaded docs for corpusSearch
  const docsWithFullText = uploadedSources.filter(s => 
    typeof s.text === "string" && s.text.trim().length > 0
  );
  
  if (docsWithFullText.length === 0) {
    return { statements, attempted: 0, injected: 0, skippedShort: 0 };
  }
  
  const uploadedDocs = docsWithFullText.map(s => ({
    id: s.id || s.name || `doc_${Math.random()}`,
    title: s.name || s.title || "Untitled source",
    text: s.text || "",
  }));
  
  // Find memo reference ID (id=1 for first uploaded source)
  const memoReferenceId = 1;
  const memoReference = unifiedReferences.find(ref => ref?.id === memoReferenceId && ref?.type === "uploaded");
  
  let attempted = 0;
  let injected = 0;
  let skippedShort = 0;
  const maxAttempts = 3; // Cap backfill attempts
  
  const updatedStatements = statements.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    // Skip if we've already attempted max times
    if (attempted >= maxAttempts) return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    
    // Skip very short statements (< 40 chars) - should have been merged/dropped
    if (text.trim().length < 40) {
      skippedShort++;
      return stmt;
    }
    
    // Check if citations are missing
    const existingAssessmentCitations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const existingTopLevelCitations = Array.isArray(stmt.citations) ? stmt.citations : [];
    const existingCitationsSet = new Set([...existingAssessmentCitations, ...existingTopLevelCitations]);
    const hasEmptyCitations = existingCitationsSet.size === 0;
    
    // Check if evidence is missing
    const existingEvidence = Array.isArray(stmt.evidence) ? stmt.evidence : 
                             (Array.isArray(assessment.evidence) ? assessment.evidence : []);
    const hasEmptyEvidence = existingEvidence.length === 0;
    
    // Only attempt if both citations and evidence are empty
    if (!hasEmptyCitations || !hasEmptyEvidence) {
      return stmt;
    }
    
    attempted++;
    
    // Run corpusSearch (already does fuzzy matching by default)
    let searchResult;
    try {
      searchResult = getUtils().corpusSearch(text, uploadedDocs);
    } catch (searchErr) {
      log(`[CITE_BACKFILL] corpusSearch failed for idx=${idx}:`, searchErr);
      return stmt;
    }
    
    if (searchResult && searchResult.found) {
      // Inject citation
      const citationSet = new Set(existingCitationsSet);
      citationSet.add(memoReferenceId);
      const injectedCitations = Array.from(citationSet).sort((a, b) => a - b);
      
      // Build evidence
      const evidenceSet = new Map();
      existingEvidence.forEach(ev => {
        const key = ev?.title || ev?.url || String(ev);
        if (key && !evidenceSet.has(key)) {
          evidenceSet.set(key, ev);
        }
      });
      
      injectedCitations.forEach(citationId => {
        const citationKey = citationId != null ? String(citationId) : null;
        if (citationKey) {
          const ref = unifiedReferences.find(r => String(r?.id) === citationKey);
          if (ref) {
            const refEvidence = {
              title: ref.title || "Untitled source",
              url: ref.url || null,
              sourceType: ref.type || (ref.url ? "web" : "uploaded"),
            };
            const refKey = refEvidence.title || refEvidence.url || citationKey;
            if (!evidenceSet.has(refKey)) {
              evidenceSet.set(refKey, refEvidence);
            }
          }
        }
      });
      
      const evidence = Array.from(evidenceSet.values());
      
      // Add reason note
      const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      const updatedReasons = [...reasons, "Memo contains related support; citation added via backfill."];
      
      injected++;
      
      return {
        ...stmt,
        citations: injectedCitations,
        evidence: evidence,
        assessment: {
          ...assessment,
          citations: injectedCitations,
          evidence: evidence,
          reasons: updatedReasons
        }
      };
    }
    
    return stmt;
  });
  
  log(`[CITE_BACKFILL] attempted=${attempted} injected=${injected} skippedShort=${skippedShort}`);
  
  return { statements: updatedStatements, attempted, injected, skippedShort };
}

function computeExtractionQuality(statements, extractionCandidates, rejectedCount = 0, fallbackCount = 0, incompleteNumericFragmentCount = 0, recombinedCount = 0, fragmentDropped = 0, fragmentMerged = 0, dealDedupDropped = 0, qualityPatch = {}, runId = null, reqSig = null) {
  // A3.6.72: Don't fail if statements exist (even if from best-effort fallback)
  if (!Array.isArray(statements) || statements.length === 0) {
    return { quality: "failed", reasons: ["no_statements"] };
  }
  
  let hasTruncation = false;
  let hasUnbalancedParens = false;
  let hasIncompleteNumeric = false;
  let repairedNumericFragmentCount = 0;
  
  for (const stmt of statements) {
    const text = typeof stmt.text === "string" ? stmt.text : "";
    if (!text) continue;
    
    // A3.6.12: Skip repaired numeric fragments from quality checks
    if (stmt.__repairedNumericFragment === true) {
      repairedNumericFragmentCount++;
      continue; // Do not count repaired statements as incomplete
    }
    
    // A3.5.17 Fix 3: Check for incomplete numeric fragments in final output
    if (/\$\d+(?:,\d+)*(?:\.\d+)?\s*$/.test(text) && !/[.?!]\s*$/.test(text)) {
      hasIncompleteNumeric = true;
    } else if (/\b(implying|approximately|at|to|of)\s+(?:an?\s+)?\$\d+(?:,\d+)*(?:\.\d+)?\s*$/i.test(text)) {
      hasIncompleteNumeric = true;
    }
    
    // Fix 4: Use same truncation detection as SEG_GUARD
    // Check for mid-word end (truncation) - STRICT: only flag if strong evidence
    const lastChar = text[text.length - 1];
    const endsWithLetter = /[a-zA-Z]/.test(lastChar);
    const hasTerminalPunct = /[.?!\"'')]\]\s*$/.test(text);
    
    if (endsWithLetter && !hasTerminalPunct) {
      const lastWord = text.split(/\s+/).pop() || "";
      
      // Legitimate endings to preserve: acronyms, entity endings
      // Check for acronyms first (all caps, 2+ chars like APIs, SMBs, etc.)
      const isAcronym = /^[A-Z]{2,}$/.test(lastWord);
      // Check for common entity endings (case-insensitive)
      const legitimateEndings = /^(inc|ltd|corp|llc|plc|gmbh|sas|sa|nv|bv|ab|oy|as|ag|spa|srl|pty|co|llp|pc|pa|lp|p\.?c\.?|l\.?l\.?c\.?|l\.?t\.?d\.?|i\.?n\.?c\.?)$/i;
      const isLegitimateEnding = legitimateEndings.test(lastWord);
      
      // Only flag if very short fragment (< 2 chars) that's not legitimate
      const isVeryShortFragment = lastWord.length < 2 && !isAcronym && !isLegitimateEnding;
      const isSuspiciouslyShort = text.length < 30 && lastWord.length < 3 && !isAcronym && !isLegitimateEnding;
      
      if (isVeryShortFragment || isSuspiciouslyShort) {
        hasTruncation = true;
        console.log(`[DIAG][QUALITY] truncation detected: textPreview="${text.substring(0, 60)}..." lastWord="${lastWord}"`);
      }
    }
    
    // Check for unbalanced parentheses
    const openParens = (text.match(/\(/g) || []).length;
    const closeParens = (text.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      hasUnbalancedParens = true;
    }
  }
  
  // Fix 3: Use actual rejected/fallback counts from SEG_GUARD
  // A3.5.17 Fix 3: Include incomplete_numeric_fragment and recombined counts
  // A3.5.27: Include fragment_dropped and fragment_merged counts
  // A3.6.12: Exclude repaired numeric fragments from incomplete_numeric_fragments count
  // A3.6.62: Extract repair counts from qualityPatch
  const numericFragmentRepairCount = qualityPatch.numericFragmentRepairCount || 0;
  const earlyDanglingRepairCount = qualityPatch.earlyDanglingRepairCount || 0;
  const finalDanglingRepairCount = qualityPatch.finalDanglingRepairCount || 0;
  const numericFragmentFallbackCount = qualityPatch.numericFragmentFallbackCount || 0;
  // A3.6.64: Extract rejectedByReasonIncompleteNumericFragment from qualityPatch
  const rejectedByReasonIncompleteNumericFragment = qualityPatch.rejectedByReasonIncompleteNumericFragment || 0;
  
  // A3.6.65: Build initial reasons array (will be normalized later)
  // A3.6.72: Add seg_guard_fallback_error if segGuardFallback was used, or seg_guard_error if segGuardError occurred
  const rawReasons = [];
  const segGuardFallback = qualityPatch.segGuardFallback === true;
  const segGuardError = qualityPatch.segGuardError === true;
  if (segGuardError) {
    rawReasons.push("seg_guard_error");
  } else if (segGuardFallback) {
    rawReasons.push("seg_guard_fallback_error");
  }
  if (hasTruncation) rawReasons.push("truncation");
  if (hasUnbalancedParens) rawReasons.push("unbalanced_parens");
  
  // A3.6.64: Handle rejected_candidates - check if all rejections were due to incomplete_numeric_fragment and were repaired
  let rejectedResolved = false;
  const allRejectionsWereNumericFragment = rejectedCount > 0 && rejectedCount === rejectedByReasonIncompleteNumericFragment;
  if (rejectedCount > 0) {
    if (allRejectionsWereNumericFragment && numericFragmentRepairCount > 0) {
      // All rejections were due to incomplete_numeric_fragment and were repaired
      rawReasons.push(`rejected_candidates_resolved_by_repair=1`);
      rejectedResolved = true;
    } else {
      // Some rejections were from other reasons, or not repaired - keep degradation
      rawReasons.push(`rejected_candidates=${rejectedCount}`);
    }
  }
  
  // A3.6.62: Handle fallback - if it was due to incomplete_numeric_fragment and was repaired, mark as resolved
  let fallbackResolved = false;
  if (fallbackCount > 0) {
    if (numericFragmentFallbackCount > 0 && numericFragmentRepairCount > 0) {
      // Fallback was due to incomplete_numeric_fragment and was repaired
      rawReasons.push(`fallback_resolved_by_repair=1`);
      fallbackResolved = true;
    } else {
      rawReasons.push(`fallback=${fallbackCount}`);
    }
  }
  
  // A3.6.64: Handle incomplete_numeric_fragments - will be normalized later to remove if repaired
  const unrepairedIncompleteCount = Math.max(0, incompleteNumericFragmentCount - repairedNumericFragmentCount);
  if (unrepairedIncompleteCount > 0) {
    rawReasons.push(`incomplete_numeric_fragments=${unrepairedIncompleteCount}`);
  }
  // A3.6.64: Add resolved reason if rejections were due to incomplete_numeric_fragment and were repaired
  if (rejectedByReasonIncompleteNumericFragment > 0 && numericFragmentRepairCount > 0) {
    rawReasons.push(`incomplete_numeric_fragments_repaired=${rejectedByReasonIncompleteNumericFragment}`);
  }
  if (numericFragmentRepairCount > 0) {
    rawReasons.push(`numeric_fragments_repaired=${numericFragmentRepairCount}`);
  }
  
  if (recombinedCount > 0) rawReasons.push(`recombined_fragments=${recombinedCount}`);
  if (fragmentDropped > 0) rawReasons.push(`fragment_dropped=${fragmentDropped}`);
  if (fragmentMerged > 0) rawReasons.push(`fragment_merged=${fragmentMerged}`);
  // A3.6.61: Log dedup_dropped but do NOT include in quality degradation
  if (dealDedupDropped > 0) rawReasons.push(`dedup_dropped=${dealDedupDropped}`);
  
  // A3.6.65: Parse reasons into structured format
  const reasonMap = new Map();
  for (const reasonStr of rawReasons) {
    const parsed = getUtils().parseReason(reasonStr);
    if (parsed) {
      reasonMap.set(parsed.key, parsed);
    }
  }
  
  // A3.6.65: Apply repair overrides - remove stale incomplete_numeric_fragments if repaired
  if (rejectedByReasonIncompleteNumericFragment > 0 && numericFragmentRepairCount > 0) {
    // Remove stale incomplete_numeric_fragments (will be replaced by incomplete_numeric_fragments_repaired)
    reasonMap.delete("incomplete_numeric_fragments");
    // Ensure incomplete_numeric_fragments_repaired is present
    reasonMap.set("incomplete_numeric_fragments_repaired", {
      key: "incomplete_numeric_fragments_repaired",
      value: rejectedByReasonIncompleteNumericFragment
    });
  }
  
  // A3.6.65: Ensure numeric_fragments_repaired is present if repairs occurred
  if (numericFragmentRepairCount > 0) {
    reasonMap.set("numeric_fragments_repaired", {
      key: "numeric_fragments_repaired",
      value: numericFragmentRepairCount
    });
  }
  
  // A3.6.65: Rebuild reasons array from normalized map
  const reasons = Array.from(reasonMap.values())
    .map(getUtils().formatReason)
    .filter(r => r !== null);
  
  // A3.6.65: Diagnostic logging for normalization
  const log = (runId && reqSig) ? (...args) => getUtils().diag(runId, reqSig, ...args) : console.log;
  const normalizedKeys = Array.from(reasonMap.keys());
  const incompleteNumericRemoved = rawReasons.some(r => r.startsWith("incomplete_numeric_fragments=")) &&
    !reasons.some(r => r && r.startsWith("incomplete_numeric_fragments="));
  log(`[A3.6.65][QUALITY_NORMALIZE] beforeReasons=${JSON.stringify(rawReasons)} normalizedKeys=${JSON.stringify(normalizedKeys)} afterReasons=${JSON.stringify(reasons)} incompleteNumericFragmentsRemoved=${incompleteNumericRemoved}`);
  
  // A3.6.62: Quality classification - repaired/resolved reasons do NOT degrade
  // A3.6.60: Quality must degrade if incomplete_numeric_fragment was NOT repaired
  // Repaired fragments are excluded from quality degradation
  // A3.6.60: Deal dedup drops are NOT counted as degraded (they're intentional deduplication)
  // A3.6.60: If statements dropped ONLY due to deal-term dedup, do NOT mark as degraded
  let quality = "ok";
  
  // A3.6.62: Final dangling repair should still degrade (indicates early pass failed)
  const hasFinalDanglingRepair = finalDanglingRepairCount > 0;
  
  // A3.6.65: Define explicit degrading vs non-degrading reason keys
  const nonDegradingKeys = new Set([
    "rejected_candidates_resolved_by_repair",
    "fallback_resolved_by_repair",
    "incomplete_numeric_fragments_repaired",
    "numeric_fragments_repaired",
    "dedup_dropped"
  ]);
  
  // A3.6.65: Determine degrading reasons (all reasons except non-degrading ones)
  const degradingReasons = Array.from(reasonMap.values())
    .filter(r => !nonDegradingKeys.has(r.key))
    .map(r => r.key);
  
  // A3.6.65: Quality classification based on degrading reasons
  if (hasTruncation || hasUnbalancedParens || hasIncompleteNumeric) {
    quality = "failed";
  } else if (hasFinalDanglingRepair) {
    // A3.6.62: Final pass repair indicates early pass didn't work
    quality = "degraded";
  } else if (degradingReasons.length > 0) {
    // A3.6.65: Only degrade if there are actual degrading reasons
    quality = "degraded";
  } else {
    // A3.6.65: All reasons are non-degrading, quality remains "ok"
    quality = "ok";
  }
  
  // A3.6.65: Diagnostic logging for grading
  log(`[A3.6.65][QUALITY_GRADE] degradingKeysDetected=${JSON.stringify(degradingReasons)} extractionQuality=${quality}`);
  console.log(`[DIAG][QUALITY] extractionQuality=${quality} reasons=${JSON.stringify(reasons)}`);
  
  // A3.6.60: Return both quality and reasons
  return { quality, reasons };
}

function fixAnchorFactReasons(statements, unifiedReferences) {
  if (!Array.isArray(statements) || !Array.isArray(unifiedReferences)) return statements;
  
  // Build a map of reference text for searching (we'll use titles and any available content)
  // Note: We don't have full source text here, but we can check if reasons incorrectly claim absence
  // The model should have access to sources, so we're fixing post-hoc incorrect claims
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const text = typeof stmt.text === "string" ? stmt.text : "";
    
    // Check if statement contains anchor facts
    const anchorFacts = getUtils().extractAnchorFacts(text);
    if (anchorFacts.length === 0) return stmt; // Not an anchor fact statement
    
    // Normalize citations
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    const hasCitations = citations.length > 0;
    
    // Detect false "not mentioned" claims for anchor facts
    const falseAbsencePatterns = [
      /(?:neither|nor).*(?:mention|state|reference|cite).*(?:valuation|funding|revenue|figure|amount)/i,
      /(?:no|not).*(?:source|sources|memo|document).*(?:mention|state|reference|cite)/i,
      /(?:not mentioned|not stated|not referenced|not cited)/i,
      /(?:no independent source|no source).*(?:found|mentions|states)/i,
    ];
    
    const hasFalseAbsenceClaim = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      // Check if reason claims absence for an anchor fact
      if (!falseAbsencePatterns.some((pattern) => pattern.test(reason))) return false;
      // Check if it's about a numeric anchor
      return anchorFacts.some((fact) => {
        const factValue = fact.value;
        // Check if reason mentions a similar value (within reasonable range)
        const valuePattern = new RegExp(`\\$${Math.round(factValue / 1e6)}[^\\d]|\\$${Math.round(factValue / 1e6)}m|${Math.round(factValue / 1e6)}\\s*million`, "i");
        return valuePattern.test(reason) || reason.includes("valuation") || reason.includes("funding");
      });
    });
    
    if (hasFalseAbsenceClaim && hasCitations) {
      // This is suspicious - we have citations but reason says "not mentioned"
      // This suggests the model may have missed a semantic match
      // We'll update the reason to be more cautious/ambiguous rather than claiming absence
      
      let updatedReasons = reasons.map((reason) => {
        if (typeof reason !== "string") return reason;
        
        if (falseAbsencePatterns.some((pattern) => pattern.test(reason))) {
          // Replace absolute absence claim with ambiguity language
          const anchorFact = anchorFacts[0];
          const valueText = anchorFact.value >= 1e6 
            ? `$${Math.round(anchorFact.value / 1e6)} million`
            : `$${Math.round(anchorFact.value / 1e3)} thousand`;
          
          // Check if reason mentions specific value
          if (reason.match(new RegExp(valueText.replace(/\$/g, "\\$").replace(/million/g, "(?:million|mm|m)"), "i"))) {
            return `The sources may reference ${valueText} ${anchorFact.type} figures, but the specific context or timing creates ambiguity as to which applies here.`;
          } else {
            return `The sources reference ${anchorFact.type} figures, but there may be ambiguity as to which specific value applies to this claim.`;
          }
        }
        
        return reason;
      });
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
    
    // Check for multiple anchor values that might cause ambiguity
    // This is a heuristic - we check if reasons mention multiple values
    const multipleValuePattern = /(\$\d+(?:\.\d+)?\s*(?:million|mm|m|billion|b))\s+.*(\$\d+(?:\.\d+)?\s*(?:million|mm|m|billion|b))/i;
    const hasMultipleValues = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return multipleValuePattern.test(reason);
    });
    
    if (hasMultipleValues && hasCitations) {
      // Extract the values mentioned
      const valueMatches = reasons
        .filter((r) => typeof r === "string")
        .flatMap((r) => {
          const matches = r.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(million|mm|m|billion|b)/gi);
          return Array.from(matches).map((m) => {
            const num = parseFloat(m[1].replace(/,/g, ""));
            const unit = m[2].toLowerCase();
            const multiplier = unit === "b" || unit === "billion" ? 1e9 : 1e6;
            return num * multiplier;
          });
        });
      
      const uniqueValues = [...new Set(valueMatches)].sort((a, b) => a - b);
      
      if (uniqueValues.length > 1) {
        // Multiple values exist - ensure reason explicitly mentions ambiguity
        const hasAmbiguityLanguage = reasons.some((r) => 
          typeof r === "string" && (r.includes("ambiguity") || r.includes("unclear") || r.includes("multiple"))
        );
        
        if (!hasAmbiguityLanguage) {
          const valueTexts = uniqueValues.map((v) => 
            v >= 1e6 ? `$${Math.round(v / 1e6)} million` : `$${Math.round(v / 1e3)} thousand`
          ).join(" and ");
          
          const anchorFact = anchorFacts[0];
          const ambiguityReason = `The sources reference multiple ${anchorFact.type} figures (${valueTexts}), creating ambiguity as to which applies here.`;
          
          // Add ambiguity reason if not already present
          let updatedReasons = [...reasons];
          if (!updatedReasons.some((r) => typeof r === "string" && r.includes("ambiguity"))) {
            updatedReasons.push(ambiguityReason);
          }
          
          return {
            ...stmt,
            assessment: {
              ...assessment,
              reasons: updatedReasons.slice(0, 4),
            },
          };
        }
      }
    }
    
    return stmt;
  });
}

function applyFinalPostCheck(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const score = typeof assessment.reliabilityScore === "number" ? assessment.reliabilityScore : 30;
    
    // Use centralized classification
    const classification = getUtils().classifyStatementAndProvenance(stmt, unifiedReferences);
    const { provenance, resolvedCitations, memoReference, category } = classification;
    
    // DIAGNOSTIC: Log final post-check for high scores
    if (score > 35) {
    }
    
    // Allow >35 only if provenance is valid (CITED_OK or MEMO_OK)
    const canBeHighMedium = provenance === "CITED_OK" || provenance === "MEMO_OK";
    
    // If score >35 but no valid provenance, force Low
    if (score > 35 && !canBeHighMedium) {
      console.log(`[DIAG] applyFinalPostCheck: clamping High/Medium to Low:`, {
        text: text.substring(0, 60),
        originalScore: score,
        provenance,
        resolvedCitations,
        category,
      });
      const forcedScore = Math.min(score, 35);
      let updatedReasons = [...reasons];
      const verificationReason = "No verifiable sources cited.";
      
      // Ensure verification reason is present
      if (!updatedReasons.some((r) => r && r.includes("No verifiable sources"))) {
        updatedReasons = [verificationReason, ...updatedReasons].slice(0, 4);
      }
      
      console.log(`[Review] Final clamp: forced Low (${forcedScore}) for statement with score ${score} (provenance: ${provenance}): "${text.substring(0, 50)}..."`);
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityLabel: "Low",
          reliabilityScore: forcedScore,
          reasons: updatedReasons.length > 0 ? updatedReasons : [verificationReason],
          citations: [], // Ensure empty
        },
      };
    }
    
    // For MEMO_OK document-descriptive statements without citations, ensure memo citation is present
    if (provenance === "MEMO_OK" && resolvedCitations.length === 0 && memoReference) {
      const injectedId = memoReference.id;
      const idExists = unifiedReferences.some(r => r.id === injectedId);
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          citations: [injectedId], // Inject memo citation for evidence rendering
        },
      };
    }
    
    return stmt;
  });
}

function applyNonAnchorCalibration(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const hasCitations = citations.length > 0;
    const isAnchor = getUtils().isAnchorFact(text);
    const isUncertain = getUtils().isUncertaintyReason(reasons);
    
    // Skip anchor facts (already handled by anchor gating)
    if (isAnchor) return stmt;
    
    // Skip statements with citations (respect model scoring)
    if (hasCitations) return stmt;
    
    // Skip statements forced Low by dual-axis verification gate
    // Check if reasons indicate this was forced Low due to missing provenance
    const hasVerificationReason = reasons.some((r) => 
      r && (r.includes("No verifiable sources") || r.includes("could not be verified against provided sources"))
    );
    if (hasVerificationReason) return stmt; // Already forced Low by dual-axis gate
    
    // Only process non-anchor, uncited statements that weren't forced Low
    // These should only be document-descriptive with memo support (which passed dual-axis)
    let score = typeof assessment.reliabilityScore === "number"
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30;
    let label = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
    
    if (isUncertain) {
      // Keep Low if uncertain (do not inflate)
      if (score > 35) {
        score = 35;
        label = "Low";
      }
    } else {
      // Not uncertain: raise to Medium default if too low
      if (score < 55) {
        score = 65;
        label = "Medium";
      } else if (score >= 60 && label !== "High" && label !== "Medium") {
        // Ensure label matches score if already in Medium/High range
        label = score >= 80 ? "High" : "Medium";
      }
      
      // Add calibrated note only if reasons are empty
      let updatedReasons = [...reasons];
      if (updatedReasons.length === 0) {
        updatedReasons = ["No supporting source was cited; assessment reflects internal consistency of the draft."];
      }
      updatedReasons = updatedReasons.slice(0, 4); // Cap at 4
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityScore: score,
          reliabilityLabel: label,
          reasons: updatedReasons,
        },
      };
    }
    
    // If uncertain, return with adjusted score/label
    return {
      ...stmt,
      assessment: {
        ...assessment,
        reliabilityScore: score,
        reliabilityLabel: label,
      },
    };
  });
}

function applyParaphraseTolerance(statements, unifiedReferences) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    let score = typeof assessment.reliabilityScore === "number"
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30;
    let label = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
    
    // Normalize citations from both locations
    const citations = 
      (Array.isArray(stmt?.citations) && stmt.citations.length > 0) ? stmt.citations :
      (Array.isArray(assessment?.citations) && assessment.citations.length > 0) ? assessment.citations :
      [];
    
    // Check if statement has resolved citations/evidence
    const hasResolvedCitations = citations.length > 0;
    
    // Use centralized classification to get provenance
    const classification = getUtils().classifyStatementAndProvenance(stmt, unifiedReferences);
    const { provenance, category } = classification;
    
    // Only apply to statements with citations and valid provenance
    if (!hasResolvedCitations || (provenance !== "CITED_OK" && provenance !== "MEMO_OK")) {
      return stmt;
    }
    
    // Detect phrase-mismatch penalty patterns in reasons
    const phraseMismatchPatterns = [
      /does not use the exact phrase/i,
      /exact phrase.*missing/i,
      /exact wording.*not found/i,
      /phrase.*does not appear/i,
      /wording.*differs/i,
    ];
    
    const hasPhraseMismatchPenalty = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      return phraseMismatchPatterns.some((pattern) => pattern.test(reason));
    });
    
    // Detect if reasons indicate missing facts vs just phrase mismatch
    const missingFactPatterns = [
      /not (?:explicitly )?(?:stated|mentioned|found|present|supported)/i,
      /(?:lacks?|missing|absent|no evidence for|unsupported).*(?:fact|claim|element|detail|information)/i,
      /cannot (?:be )?(?:verified|confirmed|validated|corroborated)/i,
    ];
    
    const hasMissingFactPenalty = reasons.some((reason) => {
      if (typeof reason !== "string") return false;
      // Exclude phrase-mismatch reasons from missing-fact detection
      if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) return false;
      return missingFactPatterns.some((pattern) => pattern.test(reason));
    });
    
    // Detect evaluative/interpretive framing phrases in statement
    const evaluativePhrases = [
      /\binvestment thesis (?:rests on|is based on)/i,
      /\battractive (?:unit economics|position|prospects)/i,
      /\bpositioned to (?:consolidate|dominate|succeed)/i,
      /\bdifferentiated/i,
      /\bcompelling/i,
      /\bstrong (?:thesis|position|advantage)/i,
    ];
    
    const hasEvaluativeFraming = evaluativePhrases.some((pattern) => pattern.test(text));
    
    // Detect bundled claims (multiple sub-claims)
    const bundledClaimIndicators = [
      /,.*and/i,  // comma followed by "and"
      / and /i,   // standalone "and"
      / with /i,  // "with"
      / which /i, // "which"
      / under /i, // "under"
    ];
    
    const isBundledClaim = bundledClaimIndicators.some((pattern) => pattern.test(text));
    
    // Track if we need to update the statement
    let needsUpdate = false;
    let updatedReasons = [...reasons];
    
    // Invariant 1: If only phrase mismatch penalty exists (no missing facts), adjust score upward
    if (hasPhraseMismatchPenalty && !hasMissingFactPenalty && hasResolvedCitations) {
      // Apply modest score uplift for phrase mismatch alone
      // Only if current score is below what it should be for supported substance
      if (score < 70 && category === "DOCUMENT_DESCRIPTIVE") {
        // For document-descriptive with phrase mismatch only, raise to Medium-High range
        score = Math.min(75, score + 15);
        label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
        needsUpdate = true;
        
        // Replace phrase-mismatch reasons with accurate explanation
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support the underlying facts but not the exact phrasing used in the statement.";
          }
          return reason;
        });
      } else if (score < 60 && category !== "DOCUMENT_DESCRIPTIVE") {
        // For world-fact with phrase mismatch only, raise modestly
        score = Math.min(70, score + 10);
        label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
        needsUpdate = true;
        
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support the underlying facts but not the exact phrasing used in the statement.";
          }
          return reason;
        });
      }
    }
    
    // Invariant 2: For bundled claims, assess support coverage
    if (isBundledClaim && hasResolvedCitations) {
      // Count sub-claims (rough heuristic: count conjunctions and commas)
      const conjunctionCount = (text.match(/\b(and|with|which|under)\b/gi) || []).length;
      const commaCount = (text.match(/,/g) || []).length;
      const estimatedSubClaims = Math.max(2, Math.min(5, conjunctionCount + commaCount / 2));
      
      // Check if reasons indicate unsupported sub-claims
      const unsupportedElementCount = updatedReasons.filter((reason) => {
        if (typeof reason !== "string") return false;
        // Count reasons that mention unsupported elements (excluding phrase mismatch)
        if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) return false;
        return missingFactPatterns.some((pattern) => pattern.test(reason));
      }).length;
      
      // Estimate support coverage
      const supportedSubClaims = estimatedSubClaims - unsupportedElementCount;
      const coverageRatio = supportedSubClaims / Math.max(1, estimatedSubClaims);
      
      // Adjust score based on coverage
      if (coverageRatio >= 0.8 && score < 75) {
        // High coverage: raise to High-Medium range
        score = Math.min(80, Math.max(score, 70));
        label = score >= 80 ? "High" : "Medium";
        needsUpdate = true;
        
        // Add coverage explanation if not already present
        const hasCoverageExplanation = updatedReasons.some((r) => 
          typeof r === "string" && (r.includes("coverage") || r.includes("sub-claims") || r.includes("elements"))
        );
        if (!hasCoverageExplanation) {
          updatedReasons = ["Most sub-claims are directly supported by sources.", ...updatedReasons].slice(0, 4);
        }
      } else if (coverageRatio >= 0.5 && score < 60) {
        // Medium coverage: raise to Medium range
        score = Math.min(70, Math.max(score, 55));
        label = "Medium";
        needsUpdate = true;
        
        // Add coverage explanation if not already present
        const hasCoverageExplanation = updatedReasons.some((r) => 
          typeof r === "string" && (r.includes("coverage") || r.includes("sub-claims") || r.includes("elements"))
        );
        if (!hasCoverageExplanation) {
          updatedReasons = ["Some sub-claims are supported, but others are inferential or not explicitly stated.", ...updatedReasons].slice(0, 4);
        }
      }
      // Low coverage: keep existing score (likely already Low)
    }
    
    // Invariant 3: For evaluative framing, only penalize if sources don't support it
    if (hasEvaluativeFraming && hasResolvedCitations) {
      // If score is Low but only due to evaluative framing (not missing facts), raise to Medium
      if (score < 60 && !hasMissingFactPenalty && hasPhraseMismatchPenalty) {
        score = Math.min(65, score + 10);
        label = "Medium";
        needsUpdate = true;
        
        // Update reasons to reflect evaluative framing issue
        updatedReasons = updatedReasons.map((reason) => {
          if (typeof reason !== "string") return reason;
          if (phraseMismatchPatterns.some((pattern) => pattern.test(reason))) {
            return "Sources support underlying facts but not the evaluative framing or strength of conclusion.";
          }
          return reason;
        });
      }
    }
    
    // Return updated statement if any adjustments were made
    if (needsUpdate) {
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityScore: score,
          reliabilityLabel: label,
          reasons: updatedReasons.slice(0, 4),
        },
      };
    }
    
    return stmt;
  });
}


// A3.8.192: CommonJS exports (no export keyword)
module.exports = {
  setImplUtils,
  normalizeTextForSearch,
  applyNonAnchorCalibration,
  applyParaphraseTolerance,
  applyFinalPostCheck,
  fixAnchorFactReasons,
  enforceCorpusVerificationBeforeAbsence,
  detectAnchorAmbiguity,
  computeExtractionQuality,
  enforceAnchorCitationsAndAmbiguity,
  backfillCitations,
  __A3_8_192_HELPERS_OK: true
};
