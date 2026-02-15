// lib/build-cross-statement-consistency.cjs
// A4.13: Evidence Judgement Phase 2 — cross-statement consistency by claim group.
// Sync, deterministic, read-only on statements. Additive meta only.

const ROBUST_OR_MODERATE = new Set(["robust", "moderate"]);
const FRAGILE_OR_HIGHLY = new Set(["fragile", "highly_fragile"]);

function hashTypeValue(cc) {
  if (cc == null || typeof cc !== "object") return null;
  const type = cc.type != null ? String(cc.type).trim() : "";
  const value = typeof cc.value === "number" && Number.isFinite(cc.value) ? cc.value : "";
  const unit = cc.unit != null ? String(cc.unit) : "";
  const currency = cc.currency != null ? String(cc.currency) : "";
  return [type, value, unit, currency].join("|");
}

/**
 * Build cross-statement consistency and optional root summary.
 * Groups by canonicalClaimId (preferred) or type+value hash; conflict if same group
 * contains both (robust/moderate) and (fragile/highly_fragile).
 * @param {Object[]} statements - Full statements array (read-only)
 * @returns {{ consistencyPerStatement: Array<{ inConflict: boolean, groupKey?: string, conflictReason?: string }>, evidenceJudgementSummary?: { consistentCount: number, inConflictCount: number } }}
 */
function buildCrossStatementConsistency(statements) {
  const consistencyPerStatement = [];
  const defaultConsistency = { inConflict: false };

  try {
    if (!Array.isArray(statements) || statements.length === 0) {
      return {
        consistencyPerStatement: [],
        evidenceJudgementSummary: { consistentCount: 0, inConflictCount: 0 },
      };
    }

    // Initialize per-statement consistency
    for (let i = 0; i < statements.length; i++) {
      consistencyPerStatement.push({ ...defaultConsistency });
    }

    // Group: key -> { bands: Set<fragilityBand>, stmtIndices: Set<number> }
    const groupMap = new Map();

    for (let stmtIdx = 0; stmtIdx < statements.length; stmtIdx++) {
      const stmt = statements[stmtIdx];
      if (stmt == null || typeof stmt !== "object") continue;

      const band = stmt.meta?.evidenceJudgement?.fragilityBand;
      const fragilityBand = typeof band === "string" ? String(band).trim().toLowerCase() : "robust";
      const canonicalClaims = Array.isArray(stmt.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];

      if (canonicalClaims.length === 0) {
        // No claim to group; leave consistency as not in conflict
        continue;
      }

      for (const cc of canonicalClaims) {
        if (cc == null || typeof cc !== "object") continue;
        const groupKey = (cc.id != null && String(cc.id).trim() !== "")
          ? "id:" + String(cc.id).trim()
          : "hash:" + hashTypeValue(cc);
        if (groupKey === "hash:") continue;

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { bands: new Set(), stmtIndices: new Set() });
        }
        const entry = groupMap.get(groupKey);
        entry.bands.add(fragilityBand);
        entry.stmtIndices.add(stmtIdx);
      }
    }

    // Mark groups that have both robust/moderate and fragile/highly_fragile
    const conflictingGroups = new Set();
    for (const [key, entry] of groupMap.entries()) {
      const bands = entry.bands;
      const hasRobustModerate = [...bands].some((b) => ROBUST_OR_MODERATE.has(b));
      const hasFragileHighly = [...bands].some((b) => FRAGILE_OR_HIGHLY.has(b));
      if (hasRobustModerate && hasFragileHighly) {
        conflictingGroups.add(key);
      }
    }

    // Set per-statement consistency for statements in conflicting groups
    for (const [groupKey, entry] of groupMap.entries()) {
      if (!conflictingGroups.has(groupKey)) continue;
      for (const stmtIdx of entry.stmtIndices) {
        if (stmtIdx >= 0 && stmtIdx < consistencyPerStatement.length) {
          consistencyPerStatement[stmtIdx] = {
            inConflict: true,
            groupKey,
            conflictReason: "Same claim group contains both robust/moderate and fragile/highly_fragile evidence.",
          };
        }
      }
    }

    const inConflictCount = consistencyPerStatement.filter((c) => c.inConflict === true).length;
    const consistentCount = statements.length - inConflictCount;

    const evidenceJudgementSummary = {
      consistentCount,
      inConflictCount,
    };

    return {
      consistencyPerStatement,
      evidenceJudgementSummary,
    };
  } catch (_) {
    for (let i = 0; i < statements.length; i++) {
      if (consistencyPerStatement[i] == null) consistencyPerStatement[i] = { ...defaultConsistency };
    }
    return {
      consistencyPerStatement,
      evidenceJudgementSummary: {
        consistentCount: statements.length,
        inConflictCount: 0,
      },
    };
  }
}

module.exports = { buildCrossStatementConsistency };
