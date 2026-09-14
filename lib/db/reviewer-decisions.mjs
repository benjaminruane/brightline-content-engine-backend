export const DECISION_KINDS = Object.freeze(["source_governance", "source_override"]);
export const LIST_LIMIT = 200;

function exec(sql, text, params = []) {
  return sql.query(text, params);
}

function asText(value) {
  if (typeof value !== "string") return "";
  return value;
}

/**
 * Payload a year from now must still show what the documents said and what
 * was decided. Labels, figures, and passages — not source indexes.
 * `chosenLabel: null` is neither / leave as written. Omitting the key is
 * not a decision.
 */
export function buildReviewerDecisionPayload(input = {}) {
  const { labelA, labelB, figureA, figureB, passageA, passageB } = input;
  const payload = {
    labelA: asText(labelA),
    labelB: asText(labelB),
    figureA: asText(figureA),
    figureB: asText(figureB),
    passageA: asText(passageA),
    passageB: asText(passageB),
  };
  if (Object.prototype.hasOwnProperty.call(input, "chosenLabel")) {
    payload.chosenLabel = input.chosenLabel == null ? null : String(input.chosenLabel);
  }
  return payload;
}

export function isDecisionKind(kind) {
  return DECISION_KINDS.includes(kind);
}

export async function insertReviewerDecision(
  sql,
  { ownerKey, reviewId, kind, draftHash, statement, payload }
) {
  const rows = await exec(
    sql,
    `insert into reviewer_decisions
       (owner_key, review_id, kind, draft_hash, statement, payload)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     returning id`,
    [
      ownerKey,
      reviewId,
      kind,
      typeof draftHash === "string" && draftHash.trim() ? draftHash.trim() : null,
      typeof statement === "string" ? statement : null,
      JSON.stringify(payload),
    ]
  );
  const saved = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const rawId = saved?.id;
  const id = typeof rawId === "number" ? rawId : rawId != null ? String(rawId) : null;
  return { ok: true, id };
}

export async function listReviewerDecisions(sql, { ownerKey, reviewId, limit = LIST_LIMIT }) {
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, LIST_LIMIT) : LIST_LIMIT;
  const rows = await exec(
    sql,
    `select id, review_id, decided_at, kind, draft_hash, statement, payload
       from reviewer_decisions
      where owner_key = $1 and review_id = $2
      order by decided_at desc, id desc
      limit $3`,
    [ownerKey, reviewId, cap]
  );
  return Array.isArray(rows) ? rows : [];
}
