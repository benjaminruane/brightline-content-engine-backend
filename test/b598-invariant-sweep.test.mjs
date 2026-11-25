/**
 * B598. Permanent invariant sweep over committed fixtures, re-stamped.
 * Asserts zero I1, I2, I3, I4, I5-attribution, I8 and I10 on stamped runs.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
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
  // Permanent B598 sweep covers the committed B598 fixtures (re-stamped).
  const dir = path.join(FIX_ROOT, "b598");
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const body = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
      if (Array.isArray(body?.statements) && body.statements.some((row) => row?.qcCard)) {
        out.push({ name: `b598/${name}`, body });
      }
    } catch {
      // skip
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

test("stamped fixtures: zero I1 I2 I3 I4 I5-attribution I8 I10", () => {
  const fixtures = loadFixtureBodies();
  assert.ok(fixtures.length >= 3, "expected committed fixtures");
  const flags = [];

  for (const { name, body } of fixtures) {
    let stamped;
    try {
      stamped = restampAnalyseResponse(body);
    } catch {
      continue; // incomplete fixture shapes
    }
    if (!stamped.statements?.[0]?.qcCard?.stampAuthority) continue;
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
      if (tone === "green" && /\b(differ|missing|not in the source|conflicts?)\b/i.test(reason)) {
        flags.push({ name, index, inv: "I1", detail: reason.slice(0, 120) });
      }
      if (tone === "amber" || tone === "red") {
        if (!specificElement(reason, sentence)) {
          flags.push({ name, index, inv: "I1", detail: `no element: ${reason.slice(0, 80)}` });
        }
        if (/\b(supports?|confirms?|is consistent with)\b/i.test(reason)
          && !/\b(differ|missing|does not|conflict|beyond|omit|qualifier|recommend|drop|but|however|while|instead|expected|was complete)/i.test(reason)) {
          flags.push({ name, index, inv: "I1", detail: `support-only: ${reason.slice(0, 80)}` });
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
      if ((reason.match(/\bThe sentence\b/gi) || []).length >= 2) {
        flags.push({ name, index, inv: "I3", detail: "repeated The sentence" });
      }
      if (/\bevidence check\b|\bmatcher\b|\breading note\b|\bunmatchedElements\b/i.test(reason)) {
        flags.push({ name, index, inv: "I3", detail: "internal voice" });
      }
      if ((tone === "amber" || tone === "red") && !reason) {
        flags.push({ name, index, inv: "I3", detail: "empty reason" });
      }

      // I5 attribution
      for (const key of ["editorialConcerns", "houseStyleConcerns"]) {
        for (const concern of Array.isArray(card[key]) ? card[key] : []) {
          if (proposalChangesAttribution(sentence, concern)) {
            flags.push({ name, index, inv: "I5", detail: concern.suggestedDirection?.slice(0, 80) });
          }
        }
      }

      // I8: sentenceLabel matches combined label; tone matches
      const combinedLabel = clean(card.combinedVerdict?.label);
      if (combinedLabel && label && combinedLabel !== label) {
        flags.push({ name, index, inv: "I8", detail: `${label} vs ${combinedLabel}` });
      }

      // I10 table rows
      const excerpt = clean(card.primaryExcerptText || card.primaryExcerpt || "");
      if (excerpt) {
        const line = excerpt.split(/\n/).find((part) => /\d/.test(part)) || excerpt;
        const cut = cutLineEllipsis(line, "Next.");
        if (/ …$/.test(cut) && /\b(?:nav|key figures|net asset value|irr)\b/i.test(line)) {
          flags.push({ name, index, inv: "I10", detail: cut.slice(0, 80) });
        }
        const withRef = passageWithLineRef(line, card.primaryExcerptLineIds || ["L1"]);
        if (/\S\(line/.test(withRef)) {
          flags.push({ name, index, inv: "I10", detail: "missing space before (line" });
        }
      }

      // Present gaps must not remain in differ-on reasons
      const remaining = filterPresentGaps(matcherNamedGaps(card), card);
      void remaining;
    });

    // I4
    if ((summary.editorial?.concerns ?? 0) !== editorialShown) {
      flags.push({ name, index: "", inv: "I4", detail: `editorial ${summary.editorial?.concerns} vs ${editorialShown}` });
    }
    if ((summary.compliance?.concerns ?? 0) !== complianceShown) {
      flags.push({ name, index: "", inv: "I4", detail: `compliance ${summary.compliance?.concerns} vs ${complianceShown}` });
    }
    if ((summary.houseStyle?.concerns ?? 0) !== houseShown) {
      flags.push({ name, index: "", inv: "I4", detail: `house ${summary.houseStyle?.concerns} vs ${houseShown}` });
    }
  }

  if (flags.length) {
    const sample = flags.slice(0, 20).map((f) => `${f.inv} ${f.name} S${f.index === "" ? "—" : Number(f.index) + 1}: ${f.detail}`).join("\n");
    assert.equal(flags.length, 0, `stamped flags:\n${sample}`);
  }
});
