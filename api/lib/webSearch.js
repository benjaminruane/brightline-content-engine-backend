// api/lib/webSearch.js
// Minimal, safe stub to keep /api/query working.

export async function webSearch({
  company,
  sector,
  geography,
  dealType,
  maxResults = 4,
}) {
  // For now, log and return an empty list.
  // This guarantees no external calls and no build errors.
  console.log("[webSearch] called with:", {
    company,
    sector,
    geography,
    dealType,
    maxResults,
  });

  return [];
}
