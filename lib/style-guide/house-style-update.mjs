/**
 * A house style save. Choices are checked against the style guide.
 * One account's row is never written onto another account's row.
 */
import { STYLE_GUIDE } from "./guide.mjs";
import { choicesFromAccountRow, normaliseBannedWords, resolveStyleChoices } from "./render.mjs";

function allowedValues() {
  const map = new Map();
  for (const entry of STYLE_GUIDE) {
    if (!entry.choice || entry.choice.id === "bannedWords") continue;
    map.set(entry.choice.id, new Set(entry.choice.options.map((option) => option.id)));
  }
  return map;
}

/**
 * @param {object|null} current resolved choices or an account row
 * @param {{ reset?: boolean, choices?: object, bannedWords?: string[] }} body
 */
function asChoices(current) {
  if (current && typeof current === "object" && current.style_choices && typeof current.style_choices === "object") {
    return choicesFromAccountRow(current);
  }
  return resolveStyleChoices(current);
}

export function applyHouseStyleUpdate(current, body) {
  const row = asChoices(current);
  if (body?.reset === true) {
    return { ok: true, choices: { ...resolveStyleChoices(null), bannedWords: row.bannedWords } };
  }
  const incoming = body?.choices && typeof body.choices === "object" ? body.choices : null;
  if (!incoming && !Array.isArray(body?.bannedWords)) {
    return { ok: false, error: "invalid_house_style" };
  }
  const allowed = allowedValues();
  const next = { ...row };
  if (incoming) {
    for (const [key, value] of Object.entries(incoming)) {
      const options = allowed.get(key);
      if (!options || !options.has(value)) return { ok: false, error: "invalid_house_style", field: key };
      next[key] = value;
    }
  }
  if (Array.isArray(body?.bannedWords)) next.bannedWords = normaliseBannedWords(body.bannedWords);
  return { ok: true, choices: resolveStyleChoices(next) };
}

export function rowAfterHouseStyleUpdate(row, body) {
  const applied = applyHouseStyleUpdate(row, body);
  if (!applied.ok) return applied;
  return {
    ok: true,
    row: {
      ...(row && typeof row === "object" ? row : {}),
      spelling: applied.choices.spelling,
      thousands: applied.choices.thousands,
      style_choices: applied.choices,
    },
    choices: applied.choices,
  };
}
