/**
 * Direction-shape-aware follow scorer for B122.
 *
 * Replacement for author-confusion-sweep.mjs scoreDirective. That function
 * stays untouched so the 29/42 and 30/42 numbers remain reproducible.
 *
 * Zero model calls. No production imports.
 */

const MARKER_RE = /\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g;

export function stripMarkers(s) {
  return String(s ?? "").replace(MARKER_RE, "$1");
}

export function normalizeQuotes(s) {
  return String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/** Lowercase, straighten quotes, drop light punctuation so a follow is not lost to a comma. */
export function nl(s) {
  return normalizeQuotes(s)
    .toLowerCase()
    .replace(/[.,;:]/g, "");
}

/**
 * Quoted spans that do not close on a possessive or contraction apostrophe.
 * An apostrophe (or typographic apostrophe, already straightened) followed by
 * a letter is treated as inside the span, not as a closer.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractQuotedSpans(text) {
  const s = normalizeQuotes(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const q = s[i];
    if (q !== "'" && q !== '"') {
      i += 1;
      continue;
    }
    let j = i + 1;
    let buf = "";
    let closed = false;
    while (j < s.length) {
      const ch = s[j];
      if (ch === q) {
        const next = s[j + 1];
        if (q === "'" && next && /[A-Za-z]/.test(next)) {
          buf += ch;
          j += 1;
          continue;
        }
        closed = true;
        break;
      }
      buf += ch;
      j += 1;
    }
    if (closed && buf.length > 0) out.push(buf);
    i = closed ? j + 1 : i + 1;
  }
  return out;
}

function present(hay, needle) {
  const n = String(needle ?? "").trim();
  if (!n) return false;
  return nl(hay).includes(nl(n));
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeAll(hay, needle) {
  const n = String(needle ?? "");
  if (!n) return String(hay ?? "");
  return String(hay ?? "").replace(new RegExp(escapeRe(n), "gi"), "");
}

function xOutsideYGone(revised, x, y) {
  return !present(removeAll(revised, y), x);
}

/**
 * @param {string} direction
 * @returns {{
 *   shape: "delete"|"replace"|"replace_and_delete"|"replace_unquoted"|"rewrite_example"|"unscored",
 *   src?: string,
 *   dst?: string,
 *   example?: string,
 *   alsoDelete?: string[],
 *   quotes: string[],
 *   reason?: string,
 * }}
 */
export function classifyDirection(direction) {
  const raw = normalizeQuotes(String(direction ?? "")).trim();
  const quotes = extractQuotedSpans(raw);
  const head = raw;

  if (/^delete\s+['"]/i.test(head)) {
    if (!quotes[0]) {
      return { shape: "unscored", quotes, reason: "delete with no quoted span" };
    }
    return { shape: "delete", src: quotes[0], quotes };
  }

  const suchAs = /\bsuch as\s+['"]/i.test(head);
  if (/^rewrite\b/i.test(head) && suchAs) {
    const example = quotes[quotes.length - 1];
    if (!example) {
      return { shape: "unscored", quotes, reason: "rewrite such as with no quoted example" };
    }
    return { shape: "rewrite_example", example, quotes };
  }

  if (/^replace\s+['"]/i.test(head)) {
    const alsoDelete = [];
    const deleteRe = /\band delete\s+['"]/gi;
    if (deleteRe.test(head) && quotes.length >= 3) {
      return {
        shape: "replace_and_delete",
        src: quotes[0],
        dst: quotes[1],
        alsoDelete: quotes.slice(2),
        quotes,
      };
    }
    if (/\bwith\s+['"]/i.test(head) && quotes.length >= 2) {
      return { shape: "replace", src: quotes[0], dst: quotes[1], quotes, alsoDelete };
    }
    if (quotes[0] && /\bwith\b/i.test(head)) {
      return { shape: "replace_unquoted", src: quotes[0], quotes };
    }
    return { shape: "unscored", quotes, reason: "replace with no usable destination" };
  }

  return { shape: "unscored", quotes, reason: "unrecognised direction shape" };
}

/**
 * @param {{ direction: string, statementText: string, revised: string }} args
 * @returns {{
 *   followed: boolean,
 *   shape: string,
 *   classified: ReturnType<typeof classifyDirection>,
 *   reason: string,
 * }}
 */
export function scoreDirectiveFollow({ direction, statementText, revised }) {
  const plain = stripMarkers(revised);
  const classified = classifyDirection(direction);
  const { shape } = classified;

  if (shape === "unscored") {
    return {
      followed: false,
      shape,
      classified,
      reason: classified.reason || "unscored",
    };
  }

  if (shape === "delete") {
    const gone = !present(plain, classified.src);
    return {
      followed: gone,
      shape,
      classified,
      reason: gone ? "delete target absent" : "delete target still present",
    };
  }

  if (shape === "replace") {
    const yThere = present(plain, classified.dst);
    const xGone = xOutsideYGone(plain, classified.src, classified.dst);
    const followed = yThere && xGone;
    return {
      followed,
      shape,
      classified,
      reason: followed
        ? "replace destination present and source gone outside it"
        : !yThere
          ? "replace destination absent"
          : "replace source remains outside destination",
    };
  }

  if (shape === "replace_and_delete") {
    const yThere = present(plain, classified.dst);
    const xGone = xOutsideYGone(plain, classified.src, classified.dst);
    const extrasGone = (classified.alsoDelete || []).every((z) => !present(plain, z));
    const followed = yThere && xGone && extrasGone;
    return {
      followed,
      shape,
      classified,
      reason: followed
        ? "replace destination present, source gone, extra deletes gone"
        : "replace_and_delete not fully applied",
    };
  }

  if (shape === "replace_unquoted") {
    const gone = !present(plain, classified.src);
    return {
      followed: gone,
      shape,
      classified,
      reason: gone
        ? "named source span absent (unquoted destination, quality not checked)"
        : "named source span still present",
    };
  }

  if (shape === "rewrite_example") {
    const yThere = present(plain, classified.example);
    const originalGone = nl(plain).trim() !== nl(statementText).trim();
    const followed = originalGone || yThere;
    return {
      followed,
      shape,
      classified,
      reason: followed
        ? yThere
          ? "rewrite example present"
          : "original fragment no longer identical"
        : "original fragment unchanged and example absent",
    };
  }

  return { followed: false, shape, classified, reason: "unhandled shape" };
}

/** The old sweep scorer, copied so Part C can disagree without editing the sweep. */
export function scoreDirectiveLegacy({ direction, statementText, revised }) {
  const quoted = /'([^']{6,})'/.exec(String(direction ?? ""));
  const target = quoted ? quoted[1] : null;
  const plain = stripMarkers(revised);
  if (!target) {
    return {
      followed: !nl(plain).includes(nl(statementText)),
      target: null,
      scoredOn: "statement moved",
    };
  }
  return {
    followed: !nl(plain).includes(nl(target)),
    target,
    scoredOn: "span removed",
  };
}
