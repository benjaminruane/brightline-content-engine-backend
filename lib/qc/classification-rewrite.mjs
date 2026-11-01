/**
 * B460. A step that changes a classification keeps its own record.
 * The reviewer does not see it. A later read of a stored card does.
 *
 * { rule, from, to, evidence }
 * evidence is the two figures, the two periods, or the span's passage and class.
 */

export function classificationRewrite(rule, from, to, evidence) {
  const before = typeof from === "string" ? from.trim() : "";
  const after = typeof to === "string" ? to.trim() : "";
  if (!before || !after || before === after) return null;
  const name = typeof rule === "string" ? rule.trim() : "";
  if (!name) return null;
  const detail = typeof evidence === "string" ? evidence.replace(/\s+/g, " ").trim() : "";
  return { rule: name, from: before, to: after, evidence: detail.slice(0, 500) };
}

export function appendRewrite(list, rule, from, to, evidence) {
  const row = classificationRewrite(rule, from, to, evidence);
  const base = Array.isArray(list) ? list.slice() : [];
  if (row) base.push(row);
  return base;
}

export function pushRewrite(list, rule, from, to, evidence) {
  const row = classificationRewrite(rule, from, to, evidence);
  if (row && Array.isArray(list)) list.push(row);
  return row;
}
