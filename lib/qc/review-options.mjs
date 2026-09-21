/**
 * B299. An absent review setting is not requested. Never `!== false`.
 * The writer is `resolveReviewOptionsFromBody`. Readers use `asReviewOptions`.
 */

export const REVIEW_OPTION_KEYS = ["evidenceEnabled", "editorialEnabled", "complianceEnabled"];

export function flagEnabled(src, key) {
  return src?.[key] === true;
}

/** Reader. Absent, null, or any non-true value is not requested. */
export function asReviewOptions(src) {
  const o = src && typeof src === "object" ? src : {};
  return {
    evidenceEnabled: o.evidenceEnabled === true,
    editorialEnabled: o.editorialEnabled === true,
    complianceEnabled: o.complianceEnabled === true,
  };
}

function readFlag(body, opts, key) {
  const fromRoot = body?.[key];
  const fromOpts = opts?.[key];
  const raw = fromRoot !== undefined ? fromRoot : fromOpts;
  if (raw === true) return true;
  if (raw === false) return false;
  const how = raw === undefined ? "absent" : `non-boolean (${typeof raw})`;
  console.warn(`[REVIEW_OPTIONS] ${key} is ${how}; treating as not requested`);
  return false;
}

/**
 * Writer. Always returns all three booleans. Logs when a key is missing
 * or not a boolean. P31.
 */
export function resolveReviewOptionsFromBody(body) {
  const opts = body?.options && typeof body.options === "object" ? body.options : {};
  return {
    evidenceEnabled: readFlag(body, opts, "evidenceEnabled"),
    editorialEnabled: readFlag(body, opts, "editorialEnabled"),
    complianceEnabled: readFlag(body, opts, "complianceEnabled"),
  };
}
