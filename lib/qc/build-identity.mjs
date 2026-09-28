/**
 * Backend git identity from Vercel system env. Never throw. Never guess a
 * local git sha when Vercel did not supply one.
 */

export function readBuildIdentity(env = process.env) {
  try {
    const sha = String(env?.VERCEL_GIT_COMMIT_SHA ?? "").trim();
    const ref = String(env?.VERCEL_GIT_COMMIT_REF ?? "").trim();
    if (!sha && !ref) {
      return { commit: "unavailable", ref: "unavailable", source: "unavailable" };
    }
    return {
      commit: sha ? sha.slice(0, 7) : "unavailable",
      ref: ref || "unavailable",
      source: "vercel-env",
    };
  } catch {
    return { commit: "unavailable", ref: "unavailable", source: "unavailable" };
  }
}
