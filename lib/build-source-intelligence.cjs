// lib/build-source-intelligence.cjs
// A4.14–A4.16: Source Intelligence (role, distance, independence) — additive meta only.
// Sync, deterministic, read-only. Never throw; on error return safe neutral object.

const ROLES = Object.freeze([
  "authoritative_primary",
  "corporate_disclosure",
  "observational_primary",
  "analytical_secondary",
  "narrative_secondary",
  "unknown",
]);

const DISTANCE_BY_ROLE = Object.freeze({
  authoritative_primary: "direct",
  corporate_disclosure: "near",
  observational_primary: "near",
  analytical_secondary: "interpretive",
  narrative_secondary: "narrative",
  unknown: "interpretive",
});

function safeDomain(ref) {
  try {
    const url = ref?.url;
    if (url == null || typeof url !== "string" || url.trim() === "") return null;
    const u = new URL(url);
    return (u.hostname || "").toLowerCase();
  } catch (_) {
    return null;
  }
}

/** A4.19.1: Registrable domain — lowercase, no port, last two labels. Safe fallback if malformed. */
function getRegistrableDomain(hostname) {
  if (hostname == null || typeof hostname !== "string") return hostname;
  try {
    const lower = hostname.toLowerCase().trim();
    const withoutPort = lower.replace(/:[\d]*$/, "");
    const labels = withoutPort.split(".").filter(Boolean);
    if (labels.length === 0) return hostname;
    const lastTwo = labels.slice(-2);
    return lastTwo.join(".");
  } catch (_) {
    return hostname;
  }
}

/** A4.19.2: Corporate family key — registrable domain (investor/newsroom/etc subdomains collapse to same root). */
function getCorporateFamilyKey(hostname) {
  if (hostname == null || typeof hostname !== "string") return null;
  try {
    return getRegistrableDomain(hostname);
  } catch (_) {
    return getRegistrableDomain(hostname);
  }
}

function normalizeIssuerToken(str) {
  if (str == null || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[.,\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A4.20.1: Issuer key for statement — deterministic, from canonicalClaims.company or meta corpus/entity company. Internal only. */
function getIssuerKey(stmt, refsForStmt) {
  try {
    if (stmt == null || typeof stmt !== "object") return null;
    const claims = Array.isArray(stmt.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];
    const companyTokens = [];
    for (const c of claims) {
      if (c != null && c.company != null && String(c.company).trim() !== "") {
        companyTokens.push(normalizeIssuerToken(String(c.company).trim()));
      }
    }
    const unique = [...new Set(companyTokens)].filter(Boolean);
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) return null;
    if (stmt.meta != null && typeof stmt.meta === "object") {
      const metaCompany = stmt.meta.corpusTupleEntityCompany ?? stmt.meta.entityCompany ?? null;
      if (metaCompany != null && String(metaCompany).trim() !== "") {
        const t = normalizeIssuerToken(String(metaCompany).trim());
        if (t !== "") return t;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

function combinedText(ref) {
  const title = ref?.title != null ? String(ref.title) : "";
  const url = ref?.url != null ? String(ref.url) : "";
  const id = ref?.id != null ? String(ref.id) : "";
  return [title, url, id].join(" ").toLowerCase();
}

/** A4.17: Normalize for phrase detection — underscores/hyphens to space, collapse whitespace, trim. */
function normalizedTextForPhraseDetection(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text, phrases) {
  if (typeof text !== "string") return false;
  const t = text.toLowerCase();
  for (const p of phrases) {
    if (typeof p !== "string") continue;
    if (t.includes(p.toLowerCase())) return true;
  }
  return false;
}

/** Press release: corporate_disclosure, distance near. A4.17: raw + normalized text, filename-friendly phrases. */
function isPressRelease(ref) {
  const text = combinedText(ref);
  const normalized = normalizedTextForPhraseDetection(text);
  const domain = safeDomain(ref) || "";
  const pressPhrases = [
    "press release", "media release", "news release",
    "announces", "announcement",
    "press_release", "newsroom", "media_release", "news_release", "pressrelease",
  ];
  if (hasPhrase(text, pressPhrases)) return true;
  if (hasPhrase(normalized, pressPhrases)) return true;
  if (/\bnewsroom\b|\bpress\b|\bmedia\b/.test(domain)) return true;
  return false;
}

/** Role classification (deterministic, metadata only). Order: press release first, then authoritative, observational, analytical, narrative, unknown. */
function classifyRole(ref) {
  if (ref == null || typeof ref !== "object") return "unknown";
  const text = combinedText(ref);
  const domain = safeDomain(ref) || "";

  if (isPressRelease(ref)) return "corporate_disclosure";

  const authPhrases = [
    "capital call", "distribution notice", "notice of", "drawdown",
    "10-k", "10q", "20-f", "prospectus", "annual report", "form ",
    "audited", "financial statements",
  ];
  if (hasPhrase(text, authPhrases)) return "authoritative_primary";

  const obsPhrases = ["dashboard", "kpi", "metrics", "data extract"];
  if (hasPhrase(text, obsPhrases)) return "observational_primary";

  const analPhrases = [
    "equity research", "initiation", "analyst report",
    "mckinsey", "bcg", "bain", "strategy deck",
  ];
  if (hasPhrase(text, analPhrases)) return "analytical_secondary";

  const newsDomains = ["reuters", "bloomberg", "wsj", "ft", "economist", "theeconomist"];
  const newsPhrases = ["reuters", "bloomberg", "wsj", "ft", "the economist"];
  if (newsPhrases.some((p) => text.includes(p)) || newsDomains.some((d) => domain.includes(d))) return "narrative_secondary";
  if (/news\.|\.news\b|wire\.|press\./i.test(domain)) return "narrative_secondary";

  return "unknown";
}

function distanceFromFact(role) {
  return DISTANCE_BY_ROLE[role] || "interpretive";
}

/** A4.21.1: Per-source role confidence (internal). Additive; does not change role assignment. */
function getRoleConfidence(role) {
  if (role === "authoritative_primary" || role === "corporate_disclosure") return "high";
  if (role === "analytical_secondary" || role === "narrative_secondary" || role === "observational_primary") return "medium";
  return "low";
}

/** A4.21.3: Deterministic role order for tie-break (higher index = higher precedence). */
const ROLE_TIEBREAK_ORDER = Object.freeze({
  authoritative_primary: 5,
  corporate_disclosure: 4,
  observational_primary: 3,
  analytical_secondary: 2,
  narrative_secondary: 1,
  unknown: 0,
});
const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 };

/** A4.22.1: Topology strength from stmt.meta.supportTopology (internal). Missing → null (no ceiling). */
function getTopologyStrength(stmt) {
  try {
    const topo = stmt?.meta?.supportTopology;
    if (topo == null || typeof topo !== "object") return null;
    const spread = typeof topo.supportSpread === "string" ? topo.supportSpread.trim().toLowerCase() : "";
    const density = typeof topo.evidenceDensity === "string" ? topo.evidenceDensity.trim().toLowerCase() : "";
    const agreement = typeof topo.agreementStrength === "string" ? topo.agreementStrength.trim().toLowerCase() : "";
    if (spread !== "multi_source") return "weak";
    const densityAtLeastMedium = density === "medium" || density === "thick";
    const agreementStrong = agreement === "strong";
    if (densityAtLeastMedium && agreementStrong) return "strong";
    if (density === "thin" || agreement === "weak") return "moderate";
    return "weak";
  } catch (_) {
    return null;
  }
}

/** A4.19.3 + A4.20.3: Independence — priority: same sourceId → neutral; same _issuerKey → related; same familyKey → related; same registrableDomain → related; else independent. */
function classifyIndependenceForSource(sourceIndex, perSourceList) {
  const s = perSourceList[sourceIndex];
  if (s?.role === "unknown") return "neutral";
  if (perSourceList.length <= 1) return "neutral";
  const myId = s?.sourceId;
  const myIssuer = s?._issuerKey;
  const myFamily = s?._corporateFamilyKey;
  const myReg = s?._registrableDomain;
  for (let j = 0; j < perSourceList.length; j++) {
    if (j === sourceIndex) continue;
    const other = perSourceList[j];
    if (other?.sourceId === myId) return "neutral";
  }
  for (let j = 0; j < perSourceList.length; j++) {
    if (j === sourceIndex) continue;
    const other = perSourceList[j];
    if (myIssuer != null && myIssuer === other?._issuerKey) return "related";
  }
  for (let j = 0; j < perSourceList.length; j++) {
    if (j === sourceIndex) continue;
    const other = perSourceList[j];
    if (myFamily != null && myFamily === other?._corporateFamilyKey) return "related";
  }
  for (let j = 0; j < perSourceList.length; j++) {
    if (j === sourceIndex) continue;
    const other = perSourceList[j];
    if (myReg != null && myReg === other?._registrableDomain) return "related";
  }
  return "independent";
}

/** independenceBand per statement. A4.21.2: All unknown → medium; single/multi unknown support → medium. */
function computeIndependenceBand(perSource) {
  if (!Array.isArray(perSource) || perSource.length === 0) {
    return "low";
  }
  const allUnknown = perSource.every((s) => (s.role || "unknown") === "unknown");
  if (allUnknown) return "medium";

  const independentCount = perSource.filter((s) => s.independenceContribution === "independent").length;
  const hasAuthOrCorp = perSource.some(
    (s) => s.role === "authoritative_primary" || s.role === "corporate_disclosure"
  );
  const onlyAnalyticalOrNarrative = perSource.every(
    (s) => s.role === "analytical_secondary" || s.role === "narrative_secondary"
  );
  const allRelated = perSource.every((s) => s.independenceContribution === "related");
  const singleSource = perSource.length === 1;
  const thatOne = perSource[0];

  if (independentCount >= 2 && hasAuthOrCorp) return "high";
  if (singleSource && (thatOne.role === "authoritative_primary" || thatOne.role === "corporate_disclosure")) return "medium";
  if (singleSource && onlyAnalyticalOrNarrative) return "low";
  if (allRelated) return "low";
  if (hasAuthOrCorp) return "medium";
  if (onlyAnalyticalOrNarrative) return "low";
  return "medium";
}

/** evidenceQualityBand: A4.21.2/4.21.3 — all unknown → medium; mixed: ignore unknown, best by confidence then role order. */
function computeEvidenceQualityBand(perSource, independenceBand) {
  if (!Array.isArray(perSource) || perSource.length === 0) return "low";
  const allUnknown = perSource.every((s) => (s.role || "unknown") === "unknown");
  if (allUnknown) return "medium";

  const knownRoleSources = perSource.filter((s) => (s.role || "unknown") !== "unknown");
  let bestRole = "unknown";
  if (knownRoleSources.length > 0) {
    let bestConf = 0;
    let bestOrder = -1;
    for (const s of knownRoleSources) {
      const r = s.role || "unknown";
      const conf = CONFIDENCE_ORDER[s._roleConfidence] ?? CONFIDENCE_ORDER.low;
      const order = ROLE_TIEBREAK_ORDER[r] ?? -1;
      if (conf > bestConf || (conf === bestConf && order > bestOrder)) {
        bestConf = conf;
        bestOrder = order;
        bestRole = r;
      }
    }
  }
  let band;
  if (bestRole === "authoritative_primary") band = "high";
  else if (bestRole === "corporate_disclosure") band = independenceBand !== "low" ? "high" : "medium";
  else if (bestRole === "observational_primary" || bestRole === "analytical_secondary") band = "medium";
  else if (bestRole === "narrative_secondary") band = "low";
  else band = "medium";

  if (independenceBand === "high" && (bestRole === "authoritative_primary" || bestRole === "corporate_disclosure")) band = "high";
  if (independenceBand === "low" && (bestRole === "analytical_secondary" || bestRole === "narrative_secondary")) band = "low";
  return band;
}

/**
 * Build source intelligence meta for a statement (per-source role, distance, independence + statement bands).
 * @param {Object} stmt - Statement object (read-only); uses stmt.meta.supportingReferences.supportingReferenceIds or stmt.assessment.citations
 * @param {Map<string, Object>} refById - Map from reference id to { id, title?, url?, ... }
 * @returns {{ perSource: Array<{ sourceId, role, distanceFromFact, independenceContribution }>, independenceBand: string, evidenceQualityBand: string }}
 */
function buildSourceIntelligence(stmt, refById) {
  const safe = {
    perSource: [],
    independenceBand: "low",
    evidenceQualityBand: "low",
  };
  try {
    if (stmt == null || typeof stmt !== "object") return safe;
    if (refById == null || typeof refById.get !== "function") return safe;

    const ids = Array.isArray(stmt.meta?.supportingReferences?.supportingReferenceIds)
      ? stmt.meta.supportingReferences.supportingReferenceIds
      : Array.isArray(stmt.assessment?.citations)
        ? stmt.assessment.citations
        : [];
    const normId = (x) => (x != null && (typeof x === "string" || typeof x === "number")) ? String(x) : null;
    const uniqueIds = [...new Set(ids.map(normId).filter(Boolean))];

    // A4.18: Explicit early return when no supporting references (same outputs as downstream empty-guards).
    if (!Array.isArray(uniqueIds) || uniqueIds.length === 0) {
      return { perSource: [], independenceBand: "low", evidenceQualityBand: "low" };
    }

    const refsForStmt = uniqueIds.map((id) => refById.get(id));
    const _issuerKey = getIssuerKey(stmt, refsForStmt);
    const _topologyStrength = getTopologyStrength(stmt);

    const perSourceRaw = [];
    for (const id of uniqueIds) {
      const ref = refById.get(id);
      const role = classifyRole(ref);
      const distanceFromFactVal = distanceFromFact(role);
      const domain = ref != null ? safeDomain(ref) : null;
      const _registrableDomain = domain != null ? getRegistrableDomain(domain) : null;
      const _corporateFamilyKey = domain != null ? getCorporateFamilyKey(domain) : null;
      const _roleConfidence = getRoleConfidence(role);
      perSourceRaw.push({
        sourceId: id,
        role,
        distanceFromFact: distanceFromFactVal,
        domain,
        _registrableDomain,
        _corporateFamilyKey,
        _issuerKey,
        _roleConfidence,
        independenceContribution: null,
      });
    }

    for (let i = 0; i < perSourceRaw.length; i++) {
      perSourceRaw[i].independenceContribution = classifyIndependenceForSource(i, perSourceRaw);
    }

    const perSource = perSourceRaw.map((s) => ({
      sourceId: s.sourceId,
      role: s.role,
      distanceFromFact: s.distanceFromFact,
      independenceContribution: s.independenceContribution,
    })); // _registrableDomain, _corporateFamilyKey, _issuerKey, _roleConfidence internal only — not exposed

    let independenceBand = computeIndependenceBand(perSourceRaw);
    if (independenceBand === "high" && (_topologyStrength === "weak" || _topologyStrength === "moderate")) {
      independenceBand = "medium";
    }
    const evidenceQualityBand = computeEvidenceQualityBand(perSourceRaw, independenceBand);

    return {
      perSource,
      independenceBand,
      evidenceQualityBand,
    };
  } catch (_) {
    return safe;
  }
}

module.exports = { buildSourceIntelligence };
