// api/lib/webSearch.js
// Minimal safe stub so routes can call webSearch without errors.

export async function webSearch({
  company,
  sector,
  geography,
  dealType,
  maxResults = 4,
}) {
  console.log("[webSearch] called with:", {
    company,
    sector,
    geography,
    dealType,
    maxResults,
  });

  // For now, do NOT call any external APIs.
  // Just return an empty list so behaviour is unchanged.
  return [];
}
