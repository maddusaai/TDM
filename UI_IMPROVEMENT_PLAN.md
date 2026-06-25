# TDM Schema Drift Story — UI Improvement Plan

## Context

The goal is to create a coherent end-to-end story in the TDM product: from workspace/connector setup → masking rules → pipeline creation → schema drift detection → versioned re-runs. The backend already has significant infrastructure (schema_drift.py, versioning endpoints in main.py, MetadataVersionsPage.jsx) but the UI story is fragmented and doesn't match the intended flow. This plan restructures the frontend to tell the story seamlessly.

---

## The Structured Story

| Act | Step | Status |
|-----|------|--------|
| 1 | Admin creates workspace, adds connectors, invites members | Exists |
| 2 | Admin defines masking rules per connector (AI-suggested, overridable) | Needs redesign |
| 3 | User creates pipeline — connector → tables → gate if unmasked → rule config → run → review | Needs gate + sub-window |
| 4 | Pipeline runs successfully | Exists |
| 5 | Source DB schema changes (columns deleted) — auto-detected | Backend exists, no UI |
| 6 | Pipeline re-run prompts version selection | Needs UI |
| 7 | Source Connectors tab shows version dropdown + schema diagram per version | Needs addition |

---

## Act 2 — Masking Rules Tab Redesign

**File:** `frontend/src/pages/MaskingRulesPage.jsx`

**Current problem:** Dataset dropdown shows one flat table at a time. No connector-level grouping. No AI suggestions. No completion tracking.

**Changes:**
1. Replace dataset dropdown with **connector accordion cards** at the top level. Each card shows the connector name, type, and a completion badge ("8/12 columns configured" or "Complete ✓").
2. Expand a connector → see all its tables as sub-accordions.
3. Expand a table → see columns with **AI Suggested Rule** (already exists in pipeline Step 2 — reuse `MultiTableRulesStep` logic here) and a **Final Rule** dropdown the admin can override.
4. Add a top-level **"Configure All via AI"** button that auto-populates suggestions for all connectors.
5. Admin-locked rules section stays as-is below the connector accordion.
6. When all columns in a connector are configured → show a green "Masking Complete" badge on that connector card.

**Versioning trigger decision:** Store **Version 1 (V1) when the admin saves masking rules for a connector for the first time.** This is the semantically correct baseline — the schema is "known and reviewed" at this point. Call `POST /metadata/versions/from-sandbox` at save time.

---

## Act 3 — Pipeline Creation Changes

**File:** `frontend/src/pages/CreatePipelinePage.jsx`

### Step 1 — Source Selection (SourceStep)
- After connector is selected, **check masking completion status** for that connector.
- If masking is incomplete: show a **yellow warning banner** — "Masking rules are not fully configured for [Connector Name]. Complete them to ensure data is protected."
  - Banner has two CTAs: "Configure Now" (opens sub-window modal) and "Continue Anyway" (for admin override).
- The sub-window modal renders a compact version of the Masking Rules accordion for just that connector. On save, it marks the connector complete and closes.

### Step 2 — Rule Configuration (MultiTableRulesStep)
- **Keep as pipeline-specific override layer.** Pre-populate from the masking rules defined in Act 2.
- If any selected table has no masking rules at all → open the same sub-window modal inline.
- Status badges remain: Locked, Overridden, AI Accepted.

### Steps 3 & 4 — Run Job & Review Output
- Keep as-is. These are appropriate.

---

## Act 5 & 6 — Schema Drift Detection + Version Picker

**Backend already exists:** `backend/schema_drift.py`, drift endpoints in `backend/main.py`

### Auto-detection
- When the pipeline's Run Job step starts, call `GET /datasets/{dataset_id}/schema-drift` for each selected table before execution.
- If `BREAKING_DRIFT` detected: **block the run** and show a drift resolution modal.
- If `ADDITIVE_DRIFT`: detected: **block the run** and show a drift resolution modal.
- If `NO_DRIFT`: proceed silently.

### Drift Resolution Modal (new component)
Shown when breaking drift is detected before a pipeline run:
- Summary: "2 columns were removed from [table_name] since V1 was created."
- Option A: **"Run with V1 (original schema)"** — uses the stored snapshot, ignores live schema.
- Option B: **"Update to V2 (new schema)"** — calls `POST /datasets/{dataset_id}/schema-drift/resolve` to create a successor version, then runs with new schema.
- Show a side-by-side diff: removed columns highlighted in red, added columns in green.

### Pipeline Version Selector
- In Step 1 (Source Selection), add a **"Schema Version"** dropdown next to the connector selector.
- Populated from `GET /metadata/versions` filtered by connector/sandbox.
- Defaults to latest ACTIVE version. Admin can select an older version to run against a historical schema snapshot.

### Edge Case — Selecting a Newer Version with Unmasked Columns (ADDITIVE_DRIFT)
When the user selects V2 (or any version with newly added columns), the system must check if all columns in that version have masking rules assigned.

- If unmasked new columns exist: **block progression** and open `MaskingSubWindow.jsx` scoped to only the new/unmasked columns.
  - Header: "New columns detected in V2 — configure masking rules before proceeding."
  - Shows only the columns added in this version (diff from prior version), not all columns.
  - On save → rules are stored → sub-window closes → pipeline proceeds.
- If all columns in the selected version are masked: proceed silently.
- This reuses the same `MaskingSubWindow.jsx` component from Act 3 — no new component needed.

---

## Act 7 — Source Connectors Tab: Version Dropdown + Schema Diagram

**File:** `frontend/src/pages/SourceConnectionsPage.jsx`

**Changes to Connection Catalog table:**
1. Add a **"Schema Version"** column. Each connector row shows a dropdown (V1, V2, V3... from `GET /metadata/versions`).
2. Add a **"View Schema"** button per row. Clicking it opens a side panel or modal.
3. The side panel shows the schema for the selected version as a **visual card layout**: one card per table, each card lists columns with their types and masking rule assignments. Use CSS grid cards (no new library needed — keep it consistent with existing Card components).
4. If drift is detected on a connector, show a **red "Drift Detected"** badge in the Status column with a "Resolve" CTA.

**ER Diagram approach:** Since no diagramming library is installed, use a **card-based schema viewer** (table name as card header, columns as rows with type + masking rule chips). This is consistent with the existing design system and avoids a new dependency. Can upgrade to React Flow later if needed.

---

## Gaps Identified in the Original Story

1. **Masking Rules are defined per connector but pipelines can span multiple connectors.** Current pipeline flow is single-connector. Clarify if multi-connector pipelines are in scope.
2. **Who gets notified on schema drift?** Admin only, or all workspace members? Suggest: admin gets a notification badge in the sidebar next to "Source Connections."
3. **V1 creation timing is now defined** (first masking save), but what about connectors added before this feature ships? Suggest: auto-create V1 on next pipeline run for legacy connectors.

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/pages/MaskingRulesPage.jsx` | Connector accordion, AI suggestions, completion badge, V1 trigger on save |
| `frontend/src/pages/CreatePipelinePage.jsx` | Masking gate in Step 1, sub-window modal, schema version dropdown, drift check before run |
| `frontend/src/pages/SourceConnectionsPage.jsx` | Version dropdown column, schema viewer side panel, drift badge |
| New: `frontend/src/components/MaskingSubWindow.jsx` | Reusable modal for inline masking rule configuration |
| New: `frontend/src/components/DriftResolutionModal.jsx` | Version picker + diff view when breaking drift detected |
| New: `frontend/src/components/SchemaVersionPanel.jsx` | Card-based schema viewer for connector version side panel |

---

## Verification

1. Add a connector → save masking rules → confirm V1 is created in `GET /metadata/versions`
2. Create a pipeline with an unmasked connector → confirm warning banner appears → configure via sub-window → confirm gate clears
3. Simulate drift via `POST /datasets/{dataset_id}/schema-drift/simulate-change` → re-run pipeline → confirm drift modal appears with version picker
4. In Source Connectors tab → select a version from dropdown → confirm schema panel shows correct columns for that version
