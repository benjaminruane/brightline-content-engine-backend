// api/lib/webSearch.js
// Safe stub version – no real web calls yet.

export async function webSearch({
  company,
  sector,
  geography,
  dealType,
  maxResults = 4,
}) {
  console.log("[webSearch] STUB called with:", {
    company,
    sector,
    geography,
    dealType,
    maxResults,
  });

  // No external calls; return an empty list so callers behave as before.
  return [];
}
