/** Monthly allowance. Month is the calendar month in UTC. */

export const DEFAULT_ALLOWANCE_USD = 50;

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function monthStart(now = new Date()) {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

/** First day of next month, as an ISO date. */
export function resetsOnIso(now = new Date()) {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/**
 * A stored number wins, including zero.
 * Otherwise the env value, otherwise 50.
 */
export function resolveAllowanceUsd(stored, envValue) {
  if (stored != null && stored !== "") {
    const n = Number(stored);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (typeof envValue === "number" && Number.isFinite(envValue) && envValue >= 0) return envValue;
  if (typeof envValue === "string" && envValue.trim()) {
    const n = Number(envValue);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_ALLOWANCE_USD;
}

export function usedFraction(spent, allowance) {
  const used = money(spent);
  const limit = money(allowance);
  if (!(limit > 0)) return used > 0 ? 1 : 0;
  return Math.min(1, used / limit);
}

export function allowanceBlocks({ spent, allowance, isAdmin, authOn }) {
  if (!authOn || isAdmin) return false;
  return money(spent) >= money(allowance);
}
