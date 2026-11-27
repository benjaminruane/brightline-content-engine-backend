/**
 * B613. Source badges are letters: A, B, ... Z, then AA, AB.
 * index is 0-based. number is 1-based.
 */

export function sourceLetter(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) {
    console.warn("[sourceLetter] index is missing");
    return "";
  }
  let value = n;
  let out = "";
  do {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}

export function sourceLetterFromNumber(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) return "";
  return sourceLetter(n - 1);
}
