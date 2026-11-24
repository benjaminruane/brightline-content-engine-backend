/**
 * A short stable reference for one completed review.
 * The same id always returns the same reference. A new id is a new reference.
 */

function hashHex(text) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function reviewReference(reviewId) {
  const id = typeof reviewId === "string" ? reviewId.trim() : "";
  if (!id) throw new Error("review reference: the review id is missing");
  return `R-${hashHex(id).slice(0, 4).toUpperCase()}`;
}
