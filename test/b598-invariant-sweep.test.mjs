/**
 * B599. Permanent invariant sweep over EVERY committed fixture, re-stamped.
 * Asserts zero I1, I2, I3, I4 and I8 on stamped runs. I6 number-word noise is
 * listed separately by the diagnostic sweep and is not a product fault.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { cutLineEllipsis, passageWithLineRef } from "../lib/export/passage-cut.mjs";
import {
  filterPresentGaps,
  gapAppearsInLines,
  shownSourceLines,
  tokenizeForOverlap,
} from "../lib/qc/reason-evidence-check.mjs";
import { matcherNamedGaps } from "../lib/qc/b595-card-rules.mjs";
import {
  displayedComplianceConcerns,
  displayedEditorialConcerns,
  displayedHouseStyleConcerns,
} from "../lib/qc/review-summary.mjs";
import { proposalChangesAttribution } from "../lib/qc/attribution-safe-proposals.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIX_ROOT = path.join(ROOT, "fixtures");

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function loadFixtureBodies() {
  // Every committed review fixture under test/fixtures, re-stamped.
  const out = [];
  if (!existsSync(FIX_ROOT)) return out;
  for (const entry of readdirSync(FIX_ROOT)) {
    const dir = path.join(FIX_ROOT, entry);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const body = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
        if (Array.isArray(body?.statements) && body.statements.some((row) => row?.qcCard)) {
          out.push({ name: `${entry}/${name}`, body });
        }
      } catch {
        // skip
      }
    }
  }
  return out;
}

function toneOf(card) {
  const tone = card?.combinedVerdict?.tone;
  if (tone === "none") return "green";
  if (tone === "red" || tone === "amber" || tone === "green" || tone === "grey") return tone;
  return "";
}

function reasonOf(card) {
  return clean(card?.shownReason) || clean(card?.evidenceSummary);
}

function specificElement(reason, sentence) {
  const body = clean(reason);
  if (!body) return false;
  if (/\b(recommend|decision|gross|net|qualifier|table|confirm the decision)\b/i.test(body)) return true;
  if (tokenizeForOverlap(body).some((t) => /^\d/.test(t) || /^(usd|eur|gbp)/.test(t))) return true;
  const s = new Set(tokenizeForOverlap(sentence));
  return tokenizeForOverlap(body).some((t) => t.length > 3 && s.has(t));
}

function extractClaimedGaps(reason) {
  const body = clean(reason);
  const out = [];
  const differ = body.match(/\bdiffer(?:s|ed|ing)? on (.+?)(?:\.|$)/i);
  if (differ) out.push(differ[1]);
  const missing = body.match(/\b(?:missing|does not (?:state|mention|address|give|use)|not in the source|omits?)[:\s]+(.+?)(?:\.|$)/i);
  if (missing) out.push(missing[1]);
  return out.map(clean).filter((gap) => {
    if (!gap) return false;
    if (/^(this claim|the claim about|the claim)\b/i.test(gap)) return false;
    return tokenizeForOverlap(gap).length >= 2;
  });
}

test("stamped fixtures: zero I1 I2 I3 I4 I8 on every saved run", () => {
  const fixtures = loadFixtureBodies();
  assert.ok(fixtures.length >= 3, "expected committed fixtures");
  const flags = [];
  let stampedRuns = 0;

  for (const { name, body } of fixtures) {
    let stamped;
    try {
      stamped = restampAnalyseResponse(body);
    } catch (err) {
      flags.push({ name, index: "", inv: "LOAD", detail: String(err?.message || err).slice(0, 120) });
      continue;
    }
    if (!stamped.statements?.[0]?.qcCard?.stampAuthority && !stamped.statements?.[0]?.qcCard?.stampGate) {
      continue;
    }
    stampedRuns += 1;
    const summary = stamped.meta?.reviewSummary || {};
    let editorialShown = 0;
    let complianceShown = 0;
    let houseShown = 0;

    stamped.statements.forEach((row, index) => {
      const card = row.qcCard || {};
      const sentence = clean(row.text || card.statement || "");
      const tone = toneOf(card);
      const reason = reasonOf(card);
      const label = clean(card.sentenceLabel) || clean(card.combinedVerdict?.label);
      editorialShown += displayedEditorialConcerns(card).length;
      complianceShown += displayedComplianceConcerns(card).length;
      houseShown += displayedHouseStyleConcerns(card).length;

      // I1
      if (tone === "green" && /\b(differ|missing|not in the source|conflicts?)\b/i.test(reason)
        && !/Transaction status as set by you/i.test(reason)) {
        flags.push({ name, index, inv: "I1", detail: reason.slice(0, 120) });
      }
      if (tone === "amber" || tone === "red") {
        if (!specificElement(reason, sentence) && !/Confirm its status below|transaction status is set to/i.test(reason)) {
          flags.push({ name, index, inv: "I1", detail: `no element: ${reason.slice(0, 80)}` });
        }
        if (/\b(supports?|confirms?|is consistent with)\b/i.test(reason)
          && !/\b(differ|missing|does not|conflict|beyond|omit|qualifier|recommend|drop|but|however|while|instead|expected|was complete|completed on|Confirm its status|set to)\b/i.test(reason)) {
          flags.push({ name, index, inv: "I1", detail: `support-only: ${reason.slice(0, 80)}` });
        }
        if (/Needs a look against the source/i.test(reason)) {
          flags.push({ name, index, inv: "I1", detail: `generic look: ${reason.slice(0, 80)}` });
        }
      }

      // I2
      for (const gap of extractClaimedGaps(reason)) {
        if (gapAppearsInLines(gap, shownSourceLines(card))) {
          flags.push({ name, index, inv: "I2", detail: gap.slice(0, 80) });
        }
      }

      // I3
      if (/differ on [A-Z]/.test(reason)) flags.push({ name, index, inv: "I3", detail: reason.slice(0, 80) });
      if ((reason.match(/(?:^|[.!?]\s+)The sentence\b/g) || []).length >= 2) {
        flags.push({ name, index, inv: "I3", detail: "repeated The sentence" });
      }
      if (/\b(?:the )?evidence check\b|\bthe matcher\b|\bthe reader\b|\bthe second check\b|\bthe check\b|\breading note\b|\bunmatchedElements\b/i.test(reason)) {
        flags.push({ name, index, inv: "I3", detail: "internal voice" });
      }
      if ((tone === "amber" || tone === "red") && !reason) {
        flags.push({ name, index, inv: "I3", detail: "empty reason" });
      }

      // I8
      const combinedLabel = clean(card.combinedVerdict?.label);
      if (combinedLabel && label && combinedLabel !== label) {
        flags.push({ name, index, inv: "I8", detail: `${label} vs ${combinedLabel}` });
      }
    });

    // I4
    if ((summary.editorial?.concerns ?? 0) !== editorialShown) {
      flags.push({ name, index: "", inv: "I4", detail: `editorial ${summary.editorial?.concerns} vs ${editorialShown}` });
    }
    // Summary counts cards with a compliance concern; complianceShown tallies items.
    const complianceCards = stamped.statements.reduce(
      (n, row) => n + (displayedComplianceConcerns(row.qcCard || {}).length > 0 ? 1 : 0),
      0,
    );
    if (
      (summary.compliance?.concerns ?? 0) !== complianceShown
      && (summary.compliance?.concerns ?? 0) !== complianceCards
    ) {
      flags.push({ name, index: "", inv: "I4", detail: `compliance ${summary.compliance?.concerns} vs ${complianceShown}` });
    }
    if ((summary.houseStyle?.concerns ?? 0) !== houseShown) {
      flags.push({ name, index: "", inv: "I4", detail: `house ${summary.houseStyle?.concerns} vs ${houseShown}` });
    }
  }

  assert.ok(stampedRuns >= 3, `expected stamped runs, got ${stampedRuns}`);
  const product = flags.filter((f) => ["I1", "I2", "I3", "I4", "I8", "LOAD"].includes(f.inv));
  if (product.length) {
    const sample = product.slice(0, 30).map((f) => `${f.inv} ${f.name} S${f.index === "" ? "—" : Number(f.index) + 1}: ${f.detail}`).join("\n");
    assert.equal(product.length, 0, `stamped flags:\n${sample}`);
  }
});
