/**
 * B547. Drafting follows the account's spelling, not the source's.
 * The pairs are the ones a source commonly copies across.
 */
const UK_TO_US = [
  ["neighbours", "neighbors"],
  ["neighbour", "neighbor"],
  ["organised", "organized"],
  ["organising", "organizing"],
  ["organisation", "organization"],
  ["organisations", "organizations"],
  ["recognised", "recognized"],
  ["recognising", "recognizing"],
  ["favour", "favor"],
  ["favours", "favors"],
  ["favourite", "favorite"],
  ["colour", "color"],
  ["colours", "colors"],
  ["labour", "labor"],
  ["honour", "honor"],
  ["behaviour", "behavior"],
  ["centre", "center"],
  ["centres", "centers"],
  ["defence", "defense"],
  ["labelled", "labeled"],
  ["travelled", "traveled"],
  ["modelling", "modeling"],
  ["litre", "liter"],
  ["litres", "liters"],
  ["programme", "program"],
  ["programmes", "programs"],
  ["realisation", "realization"],
  ["realisations", "realizations"],
  ["realise", "realize"],
  ["realised", "realized"],
  ["realising", "realizing"],
];

function swapCase(from, to, text) {
  const pattern = new RegExp(`\\b${from}\\b`, "gi");
  return text.replace(pattern, (match) => {
    if (match[0] === match[0].toUpperCase()) return to[0].toUpperCase() + to.slice(1);
    return to;
  });
}

/** Leave quoted spans untouched; apply spelling only to the unquoted body. */
function mapOutsideQuotes(text, mapFn) {
  const parts = String(text).split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  return parts.map((part, index) => {
    if (index % 2 === 1) return part;
    return mapFn(part);
  }).join("");
}

export function applyAccountSpelling(text, spelling) {
  if (typeof text !== "string" || (spelling !== "US" && spelling !== "UK")) return text;
  return mapOutsideQuotes(text, (chunk) => {
    let out = chunk;
    for (const [uk, us] of UK_TO_US) {
      if (spelling === "US") out = swapCase(uk, us, out);
      else out = swapCase(us, uk, out);
    }
    return out;
  });
}
