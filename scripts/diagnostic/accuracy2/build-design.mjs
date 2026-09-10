#!/usr/bin/env node
/**
 * Build corpus 2 fixtures and design.json from design-inputs. No LLM.
 *
 *   node scripts/diagnostic/accuracy2/build-design.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
export const INPUTS_DIR = path.join(__dirname, "design-inputs");
export const FIXTURES_DIR = path.join(__dirname, "fixtures");
export const DESIGN_PATH = path.join(__dirname, "design.json");
export const SOURCES_PREFIX = "scripts/diagnostic/accuracy2/sources";

const SOURCE_FILES = {
  K1: `${SOURCES_PREFIX}/press-release-fy25-highlights.txt`,
  K2: `${SOURCES_PREFIX}/press-release-fy25-highlights.clean.txt`,
  K3: `${SOURCES_PREFIX}/kelvedge-half-year-update.txt`,
  K4: `${SOURCES_PREFIX}/kelvedge-ic-memo-fennovar.txt`,
  C1: `${SOURCES_PREFIX}/fund-factsheet-march-2026.txt`,
  C2: `${SOURCES_PREFIX}/fund-factsheet-march-2026.clean.txt`,
  C3: `${SOURCES_PREFIX}/cravenford-q1-2026-letter.txt`,
};

const FIXTURE_META = [
  { id: "01", draftId: "K-D1", label: "k_d1_fy2025_results", eventType: "portfolio_update" },
  { id: "02", draftId: "K-D2", label: "k_d2_fy2025_client_letter", eventType: "portfolio_update" },
  { id: "03", draftId: "K-D3", label: "k_d3_half_year", eventType: "portfolio_update" },
  { id: "04", draftId: "K-D4", label: "k_d4_fennovar_note", eventType: "new_investment" },
  { id: "05", draftId: "K-D5", label: "k_d5_fennovar_followon", eventType: "follow_on" },
  { id: "06", draftId: "K-D6", label: "k_d6_grulden_note", eventType: "portfolio_update" },
  { id: "07", draftId: "C-D1", label: "c_d1_cpif_summary", eventType: "fund_update" },
  { id: "08", draftId: "C-D2", label: "c_d2_cpif_quarterly", eventType: "fund_update" },
  { id: "09", draftId: "C-D3", label: "c_d3_q1_2026", eventType: "fund_update" },
  { id: "10", draftId: "C-D4", label: "c_d4_fund_position", eventType: "fund_update" },
  { id: "11", draftId: "C-D5", label: "c_d5_adviser_commentary", eventType: "fund_update" },
  { id: "12", draftId: "C-D6", label: "c_d6_holdings", eventType: "fund_update" },
];

const TWIN_SHAPES = {
  "K-D1": ["S16", "S14", "S01", "S04", "S15"],
  "K-D2": ["S03", "S08", "S09", "S12"],
  "C-D1": ["S02", "S13"],
  "C-D2": ["S07"],
};

const SHAPE_EXPECTED = {
  S01: "X",
  S02: "X",
  S03: "X",
  S04: "X",
  S05: "X",
  S06: "X",
  S07: "notConfirmed",
  S08: "X",
  S09: "X",
  S10: "X",
  S11: "P",
  S12: "P",
  S13: "P",
  S14: "P",
  S15: "P",
  S16: "P",
  S17: "notConfirmed",
  S18: "notConfirmed",
};

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function parseDraftFile(md) {
  const drafts = [];
  const chunks = String(md ?? "").split(/^## /m).slice(1);
  for (const chunk of chunks) {
    const header = chunk.split("\n")[0].trim();
    const idMatch = header.match(/^(K-D\d|C-D\d)/);
    if (!idMatch) continue;
    const draftId = idMatch[1];
    const title = header.slice(draftId.length).trim();
    const srcLine = chunk.match(/^SOURCES:\s*(.+)$/m);
    const sources = (srcLine?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const preFence = chunk.split("```")[0];
    const statements = [];
    for (const line of preFence.split("\n")) {
      const m = line.match(/^(\d+)\.\s+(.+)$/);
      if (m) statements.push({ n: Number(m[1]), text: m[2].trim() });
    }
    const fence = chunk.split("```")[1] ?? "";
    const tags = [];
    let current = null;
    const tierRe = /(?:^|\s)([CPX-])\s+(ugly|clean(?:\s+twin)?)/i;
    for (const line of fence.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(S\d{2}|D\d{2})\b(.*)$/);
      if (m) {
        if (current) tags.push(current);
        const rest = m[3];
        const train = /TRAIN/i.test(rest);
        const expectedMatch = rest.match(tierRe);
        const tierRaw = (expectedMatch?.[2] ?? "").toLowerCase();
        let sourceTier = "clean";
        if (tierRaw.includes("twin")) sourceTier = "cleantwin";
        else if (tierRaw.includes("ugly")) sourceTier = "ugly";
        let expected = expectedMatch?.[1] ?? "";
        if (expected === "-") expected = "notConfirmed";
        current = {
          stmt: Number(m[1]),
          shape: m[2],
          rest: rest.trim(),
          train,
          expected,
          sourceTier,
        };
      } else if (current && line.trim() && !/^\s*\d+\s+(S\d{2}|D\d{2})\b/.test(line)) {
        const cont = line.match(tierRe);
        if (!/^[A-Z]/.test(line.trim().slice(0, 8)) || cont) {
          current.rest += ` ${line.trim()}`;
          if (/TRAIN/i.test(line)) current.train = true;
          if (cont) {
            const tierRaw = cont[2].toLowerCase();
            if (tierRaw.includes("twin")) current.sourceTier = "cleantwin";
            else if (tierRaw.includes("ugly")) current.sourceTier = "ugly";
            else current.sourceTier = "clean";
            current.expected = cont[1] === "-" ? "notConfirmed" : cont[1];
          }
        }
      }
    }
    if (current) tags.push(current);
    drafts.push({ draftId, title, sources, statements, tags });
  }
  return drafts;
}

function replaceStatement(draft, n, text) {
  const row = draft.statements.find((s) => s.n === n);
  if (!row) throw new Error(`${draft.draftId} missing statement ${n}`);
  row.text = text;
}

function upsertTag(draft, n, shape, extra = {}) {
  draft.tags = draft.tags.filter((t) => !(t.stmt === n && t.shape === extra.replaceShape));
  const existing = draft.tags.find((t) => t.stmt === n && t.shape === shape);
  const row = {
    stmt: n,
    shape,
    rest: extra.why ?? "",
    train: extra.train ?? false,
    expected: extra.expected ?? SHAPE_EXPECTED[shape] ?? "C",
    sourceTier: extra.sourceTier ?? "clean",
  };
  if (existing) Object.assign(existing, row);
  else draft.tags.push(row);
}

function removeTag(draft, n, shape) {
  draft.tags = draft.tags.filter((t) => !(t.stmt === n && t.shape === shape));
}

export function applyCorrections(drafts) {
  const byId = Object.fromEntries(drafts.map((d) => [d.draftId, d]));
  const kd1 = byId["K-D1"];
  if (kd1.statements.length === 18) {
    kd1.statements.push(
      {
        n: 19,
        text: "The Group ended the year with net debt of £771 million.",
      },
      {
        n: 20,
        text: "Total dividend for FY2025 was 73.0 pence per share.",
      }
    );
    upsertTag(kd1, 19, "D04", {
      why: "D04 FAITHFUL PARAPHRASE of the year-end net debt figure.",
      expected: "C",
      sourceTier: "ugly",
    });
    upsertTag(kd1, 20, "D02", {
      why: "D02 APPROXIMATION of the stated total dividend.",
      expected: "C",
      sourceTier: "ugly",
    });
  }
  const kd1s14 = kd1.tags.find((t) => t.stmt === 5);
  if (kd1s14) {
    kd1s14.shape = "S14";
    kd1s14.expected = "P";
    kd1s14.sourceTier = "ugly";
    kd1s14.train = false;
    kd1s14.rest =
      "S14 INCOMPLETE ATTRIBUTION. The press release names Grulden primarily, then Skaldwick, then several other portfolio companies.";
  }
  const cd3 = byId["C-D3"];
  const t5 = cd3.tags.find((t) => t.stmt === 5);
  if (t5) {
    t5.shape = "S14";
    t5.expected = "P";
    t5.sourceTier = "clean";
    t5.train = false;
    t5.rest = "S14 incomplete attribution: the named cause is real and two others are dropped.";
  }
  const cd4 = byId["C-D4"];
  removeTag(cd4, 9, "S09");
  replaceStatement(
    cd4,
    12,
    "The continuation vehicle valuation has been completed and is included in the March figures."
  );
  removeTag(cd4, 12, "S03");
  removeTag(cd4, 12, "S18");
  upsertTag(cd4, 12, "S09", {
    why: "S09 STATUS INFLATION. The letter says it will now fall into the second quarter.",
    expected: "X",
    sourceTier: "clean",
  });
  replaceStatement(cd4, 14, "The firm's total assets under management were $161.0 million.");
  upsertTag(cd4, 14, "S04", {
    why: "S04 WRONG UNIT. The factsheet says $161.0 billion.",
    expected: "X",
    sourceTier: "clean",
  });

  const cd6 = byId["C-D6"];
  replaceStatement(cd6, 4, "Piquesta Tire rose to 3.6% of the portfolio during the quarter.");
  upsertTag(cd6, 4, "S06", {
    why: "S06 CROSS-SOURCE. Twin confirms 3.6%; the letter says Piquesta Tire was held flat.",
    expected: "X",
    sourceTier: "cleantwin",
  });
  replaceStatement(
    cd6,
    8,
    "Direct deals include both co-investments and single asset continuation deals."
  );
  removeTag(cd6, 8, "S14");
  replaceStatement(cd6, 16, "The seeded portfolio was acquired at attractive prices.");
  removeTag(cd6, 16, "D02");
  upsertTag(cd6, 16, "S11", {
    why: "S11 STRIPPED HEDGE. The letter says we remain of the view that.",
    expected: "P",
    sourceTier: "cleantwin",
  });
  replaceStatement(
    cd6,
    17,
    "The unnamed co-investment is the largest position because it was the Fund's first investment."
  );
  upsertTag(cd6, 17, "S15", {
    why: "S15 UNSUPPORTED CAUSE. No source gives any reason for its size.",
    expected: "P",
    sourceTier: "cleantwin",
  });
  replaceStatement(cd6, 20, "The Fund's net asset value at 31 March 2026 was $653.0 million.");
  upsertTag(cd6, 20, "S05", {
    why: "S05 SUPERSEDED FIGURE. The letter finalises NAV at $661.4 million.",
    expected: "X",
    sourceTier: "cleantwin",
  });

  const cd5 = byId["C-D5"];
  upsertTag(cd5, 5, "S17", {
    why: "S17 pair with statement 6: same class and figure, two periods, only one can be right.",
    expected: "notConfirmed",
    sourceTier: "clean",
  });
  upsertTag(cd5, 6, "S17", {
    why: "S17 pair with statement 5.",
    expected: "notConfirmed",
    sourceTier: "clean",
  });
  upsertTag(cd6, 1, "S17", {
    why: "S17 pair: statements 1 and 2 swap the same two percentages.",
    expected: "notConfirmed",
    sourceTier: "cleantwin",
  });
  upsertTag(cd6, 2, "S17", {
    why: "S17 pair with statement 1.",
    expected: "notConfirmed",
    sourceTier: "cleantwin",
  });
  const cd1 = byId["C-D1"];
  removeTag(cd1, 9, "S18");
  upsertTag(cd1, 9, "D02", {
    why: "D02 APPROXIMATION. Class A one-year and since-inception both 3.35% because the class launched April 2025.",
    expected: "C",
    sourceTier: "ugly",
  });
  replaceStatement(cd1, 13, "Class A returned -1.06% in January 2026.");
  removeTag(cd1, 13, "D11");
  upsertTag(cd1, 13, "S18", {
    why: "S18 TABLE CELL, resting on the stranded class letter. Must not return confirmed.",
    expected: "notConfirmed",
    sourceTier: "ugly",
  });
  return drafts;
}

function uniqueSpan(text, statements) {
  const t = String(text ?? "").trim();
  const others = statements.map((s) => s.text);
  const hit = (slice) => others.filter((o) => o.includes(slice)).length;
  if (hit(t) === 1) {
    for (let len = Math.min(28, t.length); len <= t.length; len += 1) {
      for (let i = 0; i + len <= t.length; i += 1) {
        const slice = t.slice(i, i + len);
        if (hit(slice) === 1) return slice;
      }
    }
  }
  return t;
}

function sourceTierFor(draft, tag) {
  if (tag.sourceTier && ["ugly", "clean", "cleantwin"].includes(tag.sourceTier)) return tag.sourceTier;
  if (draft.sources.includes("C2") || draft.sources.includes("K2")) return "cleantwin";
  if (draft.sources.every((s) => s === "K1" || s === "C1")) return "ugly";
  return "clean";
}

function joinDraft(statements) {
  const chunks = [];
  for (let i = 0; i < statements.length; i += 5) {
    chunks.push(
      statements
        .slice(i, i + 5)
        .map((s) => s.text)
        .join(" ")
    );
  }
  return chunks.join("\n\n");
}

function taggedKeys(draft) {
  const set = new Set();
  for (const t of draft.tags) {
    if (/^S\d{2}$/.test(t.shape) || /^D\d{2}$/.test(t.shape)) set.add(t.stmt);
  }
  return set;
}

function fillDecoys(drafts) {
  const decoyCounts = new Map();
  for (let i = 1; i <= 14; i += 1) decoyCounts.set(`D${String(i).padStart(2, "0")}`, 0);
  for (const d of drafts) {
    for (const t of d.tags) {
      if (t.shape.startsWith("D")) decoyCounts.set(t.shape, (decoyCounts.get(t.shape) || 0) + 1);
    }
  }
  const untagged = [];
  for (const d of drafts) {
    const used = taggedKeys(d);
    for (const s of d.statements) {
      if (d.draftId === "C-D6" && s.n === 8) continue;
      if (!used.has(s.n)) untagged.push({ draft: d, stmt: s.n });
    }
  }
  const short = [...decoyCounts.entries()].filter(([, n]) => n < 3).map(([k]) => k);
  let u = 0;
  for (const shape of short) {
    while ((decoyCounts.get(shape) || 0) < 3 && u < untagged.length) {
      const row = untagged[u];
      u += 1;
      upsertTag(row.draft, row.stmt, shape, {
        why: `Correct statement. Decoy ${shape} instance to meet the corpus decoy target.`,
        expected: "C",
        sourceTier: sourceTierFor(row.draft, { sourceTier: "" }),
      });
      decoyCounts.set(shape, (decoyCounts.get(shape) || 0) + 1);
    }
  }
  let total = 0;
  for (const d of drafts) total += d.tags.filter((t) => t.shape.startsWith("D")).length;
  while (total < 56 && u < untagged.length) {
    const row = untagged[u];
    u += 1;
    upsertTag(row.draft, row.stmt, "D04", {
      why: "Correct statement. D04 FAITHFUL PARAPHRASE fill to the 56-decoy target.",
      expected: "C",
      sourceTier: sourceTierFor(row.draft, { sourceTier: "" }),
    });
    total += 1;
  }
}

function assignSplits(entries) {
  const byShape = new Map();
  for (const e of entries) {
    const list = byShape.get(e.shape) || [];
    list.push(e);
    byShape.set(e.shape, list);
  }
  for (const [, list] of byShape) {
    const marked = list.find((e) => e._train);
    const train = marked ?? list[0];
    for (const e of list) {
      e.split = e === train ? "training" : "heldout";
      delete e._train;
    }
  }
}

function whyFrom(tag) {
  const rest = String(tag.rest ?? "").replace(/\s+/g, " ").trim();
  return rest.slice(0, 280) || `${tag.shape} planted in the design-inputs.`;
}

export function buildCorpus(drafts) {
  fillDecoys(drafts);
  const fixtures = [];
  const designEntries = [];
  const fixtureByDraft = {};
  for (const meta of FIXTURE_META) {
    const draft = drafts.find((d) => d.draftId === meta.draftId);
    if (!draft) throw new Error(`missing draft ${meta.draftId}`);
    if (draft.statements.length !== 20) {
      throw new Error(`${meta.draftId} has ${draft.statements.length} statements, expected 20`);
    }
    const sources = draft.sources.map((code) => SOURCE_FILES[code]).filter(Boolean);
    const fixture = {
      id: meta.id,
      label: meta.label,
      sources,
      draft: joinDraft(draft.statements),
      config: {
        outputType: "reporting_commentary",
        requiredVersion: "complete",
        eventType: meta.eventType,
      },
      notes: `${meta.draftId} ${draft.title}. Sources: ${draft.sources.join(", ")}.`,
    };
    fixtures.push(fixture);
    fixtureByDraft[meta.draftId] = { meta, draft, fixture };
  }

  const pairSeen = new Set();
  for (const meta of FIXTURE_META) {
    const { draft, fixture } = fixtureByDraft[meta.draftId];
    const statements = draft.statements;
    for (const tag of draft.tags) {
      if (tag.shape === "S17") {
        const key = `${meta.draftId}:S17`;
        if (pairSeen.has(key)) continue;
        pairSeen.add(key);
        const halves = draft.tags.filter((t) => t.shape === "S17").sort((a, b) => a.stmt - b.stmt);
        const a = statements.find((s) => s.n === halves[0].stmt);
        const b = statements.find((s) => s.n === halves[1]?.stmt) ?? a;
        designEntries.push({
          id: `${meta.draftId}-${tag.shape}`,
          fixtureId: meta.id,
          span: uniqueSpan(a.text, statements),
          spanB: uniqueSpan(b.text, statements),
          quotedFrom: `scripts/diagnostic/accuracy2/fixtures/${meta.id}_${meta.label}.json draft`,
          why: whyFrom(tag),
          shape: "S17",
          owningShape: "S17",
          secondaryShapes: [],
          falsifiable: false,
          sourceTier: sourceTierFor(draft, tag),
          expected: "notConfirmed",
          kind: "draft_internal_pair",
          _train: tag.train || halves.some((h) => h.train),
        });
        continue;
      }
      if (!/^S\d{2}$/.test(tag.shape) && !/^D\d{2}$/.test(tag.shape)) continue;
      const stmt = statements.find((s) => s.n === tag.stmt);
      if (!stmt) continue;
      const secondary = tag.shape === "S01" && meta.draftId === "C-D6" && tag.stmt === 2;
      if (secondary) continue;
      const owning = tag.shape;
      const secondaryShapes = [];
      if (meta.draftId === "C-D6" && tag.shape === "S01" && tag.stmt === 1) secondaryShapes.push("S17");
      if (meta.draftId === "C-D5" && tag.shape === "S03" && tag.stmt === 6) secondaryShapes.push("S17");
      designEntries.push({
        id: `${meta.draftId}-${tag.shape}-s${tag.stmt}`,
        fixtureId: meta.id,
        span: uniqueSpan(stmt.text, statements),
        quotedFrom: `scripts/diagnostic/accuracy2/fixtures/${meta.id}_${meta.label}.json draft`,
        why: whyFrom(tag),
        shape: tag.shape,
        owningShape: owning,
        secondaryShapes,
        falsifiable: tag.shape === "S07" || tag.shape === "S18" ? false : tag.shape.startsWith("D") ? true : true,
        sourceTier: sourceTierFor(draft, tag),
        expected: tag.shape.startsWith("D") ? "C" : tag.expected || SHAPE_EXPECTED[tag.shape],
        kind: "statement",
        _train: tag.train,
      });
    }
  }

  for (const [draftId, shapes] of Object.entries(TWIN_SHAPES)) {
    const { meta, draft, fixture } = fixtureByDraft[draftId];
    for (const shape of shapes) {
      const tag = draft.tags.find((t) => t.shape === shape);
      if (!tag) throw new Error(`twin subset missing ${draftId} ${shape}`);
      const stmt = draft.statements.find((s) => s.n === tag.stmt);
      designEntries.push({
        id: `${draftId}-${shape}-twin`,
        fixtureId: meta.id,
        span: uniqueSpan(stmt.text, draft.statements),
        quotedFrom: `${fixture.sources.find((s) => s.endsWith(".clean.txt")) ?? "clean twin"}`,
        why: `Twin subset: the ${shape} ugly-source sentence, word for word, against the clean twin.`,
        shape,
        owningShape: shape,
        secondaryShapes: [],
        falsifiable: shape === "S07" || shape === "S18" ? false : true,
        sourceTier: "cleantwin",
        expected: SHAPE_EXPECTED[shape],
        kind: "twin",
        _train: false,
      });
    }
  }

  for (let i = 1; i <= 16; i += 1) {
    const shape = `S${String(i).padStart(2, "0")}`;
    const rows = designEntries.filter((e) => e.shape === shape && e.kind === "statement");
    if (rows.length <= 3) continue;
    const score = (e) => (e._train ? 8 : 0) + (e.sourceTier === "ugly" ? 4 : 0) + (e.sourceTier === "cleantwin" ? 2 : 0);
    rows.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    const keep = new Set(rows.slice(0, 3).map((e) => e.id));
    for (let j = designEntries.length - 1; j >= 0; j -= 1) {
      const e = designEntries[j];
      if (e.shape === shape && e.kind === "statement" && !keep.has(e.id)) designEntries.splice(j, 1);
    }
  }

  assignSplits(designEntries);
  const design = {
    writtenAt: "2026-09-09",
    protocol:
      "A statement joins Group A if its text contains the design span. Spans are quoted from the fixture draft. No verdict, classification, excerpt, or commentary fields. Membership never reads a pipeline verdict.",
    seed: 20260909,
    labelBudget: 240,
    groupACap: 60,
    faults: designEntries,
  };
  return { fixtures, design, drafts };
}

export async function writeCorpus() {
  const kelvedge = await readFile(path.join(INPUTS_DIR, "drafts-kelvedge.md"), "utf8");
  const cravenford = await readFile(path.join(INPUTS_DIR, "drafts-cravenford.md"), "utf8");
  const drafts = applyCorrections([...parseDraftFile(kelvedge), ...parseDraftFile(cravenford)]);
  const { fixtures, design } = buildCorpus(drafts);
  await mkdir(FIXTURES_DIR, { recursive: true });
  for (let i = 0; i < fixtures.length; i += 1) {
    const meta = FIXTURE_META[i];
    const filePath = path.join(FIXTURES_DIR, `${meta.id}_${meta.label}.json`);
    await writeFile(filePath, `${JSON.stringify(fixtures[i], null, 2)}\n`, "utf8");
  }
  await writeFile(DESIGN_PATH, `${JSON.stringify(design, null, 2)}\n`, "utf8");
  return { fixtures, design };
}

async function main() {
  const result = await writeCorpus();
  console.log(`wrote ${result.fixtures.length} fixtures and ${result.design.faults.length} design entries`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
