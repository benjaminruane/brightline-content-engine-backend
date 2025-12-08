## 🚀 *Brightline Content Engine — Unified Product & Development Roadmap (v6.x → v8.x+)*

> Vision: Enable investment writers to **produce, review, and govern institutional-grade content with speed, auditability, and confidence.**

### 📌 Current Foundation — v6.x (Completed)

* Core drafting workflow stable (Generate → Rewrite → Review → Ask AI → Versions)
* UI layout modernised — Output Types moved to RHS stack
* Versions moved to drawer, cleaner workspace
* Ask AI now web-powered with markdown scrub & tool-based search
* Auto-scrolling + UX optimisations
* Reliability scoring functional (light heuristic)
* FE/BE renamed cleanly under **brightline-content-engine-frontend / backend**
* Release **v6.0.0** published

---

## 🟢 Phase 1 — UX/Polish & Core Stability (Near-term, low-effort wins)

| Goal                      | Deliverables                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Improve ergonomics & flow | Auto-scroll refine (align exactly with Draft panel), minor visual polish                  |
| Output formatting         | Improve Ask-AI readability formatting (bullet expansion + paragraph shaping)              |
| Input ergonomics          | Smarter handling of multi-source ingest (dedupe, preview collapse, drag-drop refinements) |
| Word limits               | Model-guided word-constrained drafting (soft target + completion termination tuning)      |
| Better panel behaviour    | Headers clickable to expand/collapse (Statements & Ask AI)                                |

Status: 🚧 In progress — some completed in v6, some pending final scroll refinement.

---

## 🟡 Phase 2 — Functional Power-Ups (Moderate development)

| Theme                                  | Features                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 🧾 Draft Completeness & Accountability | **Source Contribution Table** → which facts came from where, incl. public search snippets |
| ✍️ Input Expansion                     | Add **Investment Name, Reference Date, Reference Docs**, potential lookup hooks later     |
| 🎯 Quality Engine 2.0                  | Reliability scoring refinement, rubric transparency, sentence-level grading               |
| 📄 Real file processing                | PDF/Word/Excel/PPT ingestion → text extraction & cleansing pipeline                       |
| 🌐 Multilingual                        | **Draft Translation** (input or output)                                                   |
| 🔍 Statement Compliance Layer          | Risk flags: forward-looking language, selective disclosure, non-attribution               |

Outcome: Makes the tool suitable for **institutional reporting, compliance-aware editing, public comms**.

---

## 🔵 Phase 3 — Advanced Capability (High-value enhancements)

| Theme                         | Features                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| 🔁 Review Mode (new module)   | Upload drafted text → system reviews it, highlights risks, proposes fixes              |
| 🎛 Prompt Recipes             | Customisable drafting style modules per **team, brand, output type**                   |
| 🧠 Knowledge memory retrieval | Org document embeddings → private corpus grounding                                     |
| 📦 Export Packager            | Generate full bundle: draft + source trace + statement table + Q&A log + version trail |
| 🧭 Guided revision            | Stepwise editing suggestions → structured improve cycles                               |

Outcome: Becomes a **drafting + reviewing suite**, not just a generator.

---

## 🟣 Phase 4 — Enterprise & Integrations

| Theme                         | Features                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| 🏢 Enterprise connectors      | eFront/OneSource/SharePoint/Teams/Outlook/Drive                      |
| 🔐 Private data governance    | No-public-domain safety setting, approval chain, audit trail logging |
| 📊 Collaboration & Governance | Multi-user accounts, reviewer comments, approvals, link-share        |
| 🌍 Managed hosting            | Customer tenant deployment, compliance mode (non-web search option)  |

Outcome: Enterprise-grade product.

---

### Release Milestones

| Release               | Target Contents                                                     |
| --------------------- | ------------------------------------------------------------------- |
| **v6.x (current)**    | UI polish, Versions drawer, Ask-AI web search, structural stability |
| **v7.0 (next major)** | Translation, File ingestion, Source table w/ grounding trace        |
| **v8.0+**             | Review Module, Rubric 2.0, Export Packager                          |
| **Enterprise Track**  | Knowledge base retrieval + compliance suite                         |

---

### Implementation Order Suggestion

1. 🟢 Phase 1 finishing touches
2. 🟡 Source Attribution Table + File Ingest
3. 🟡 Compliance Layer + Translation
4. 🔵 Review Module (major UX addition)
5. 🔵 Export Packager
6. 🟣 Enterprise layer + multi-user infra

