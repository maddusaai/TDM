# TDM Anonymization Tool — Architecture

Context document for working on this codebase (upload to Claude for future tasks).
It describes the system as it currently stands, not its history.

## What it is

A **Test Data Management (TDM)** prototype/MVP: generate or upload datasets, classify
columns for PII, configure masking rules, and run anonymization jobs scoped to isolated
"sandboxes," with **metadata-version registration** and **schema-drift gating** before
execution. There is also an **agentic layer** (Claude) that can configure masking
autonomously. It is a demo for pitching agentic AI + governance on top of a masking tool.

## Stack

- **Backend:** Python, FastAPI (run with `uvicorn main:app --host 127.0.0.1 --port 8000`).
  Persistence is plain JSON files on disk (no database). Some state is in-memory.
- **Frontend:** React (single large `App.jsx`), Vite dev server (port 5173), Tailwind CSS,
  axios. `API_BASE_URL = "http://127.0.0.1:8000"`.
- **LLM:** Anthropic Claude via the `anthropic` SDK (`claude-sonnet-4-6`).

## Repository layout

```
backend/
  main.py                # FastAPI app: all endpoints, in-memory registries, helpers
  masking_engine.py      # the masking transforms (Hash, Fake Value, Partial Mask, Date Shift)
  test_data_generator.py # synthetic data generators (customer, account, claims, employee, ...)
  agent.py               # agentic masking-configuration layer (Claude tool use)
  schema_drift.py        # introspection-based schema drift detection
  data/                  # JSON persistence (RUNTIME STATE — machine-specific)
    datasets_registry.json
    sandboxes/sandboxes.json
    metadata_versions/metadata_versions.json
    rules/admin_locked_rules.json
    generated/           # generated/uploaded CSV files
  CLAUDE.md              # project handoff notes
frontend/
  src/App.jsx            # entire React app (~7k+ lines, all pages/components)
```

## Core domain model

- **Dataset** (`datasets` dict in `main.py`, persisted to `datasets_registry.json`):
  one CSV table. Key fields: `dataset_id`, `filename`, `table_name`, `source_type`,
  `input_path`, `output_path`, `sandbox_id`, `columns`, optional `schema_baseline`.
  Each column: `{name, type, pii, ai_suggested_rule, rule, override_allowed}`.
- **Sandbox** (`sandboxes.json`): an isolated schema for a user/project/environment.
  Holds `active_metadata_version_id`, `linked_metadata_versions`, source info.
- **Metadata version** (`metadata_versions.json`): a *registered schema snapshot* of one
  or more source tables — `metadata_snapshot = {table_name: [{name, type, suggested_rule}]}`.
  Versions are labeled (`V1`, `V2`…), can have successors, and one is "active" per sandbox.
  This is the **source of truth** schema (Tonic "workspace schema" analog).
- **Admin-locked rules** (`admin_locked_rules.json`): compliance rules a developer cannot
  override; enforced server-side via `apply_admin_locked_rules(dataset, rules, role)`.
- **Job** (`jobs` in-memory dict): a completed anonymization run with preview + audit.
- **MOCK_DATABRICKS_METADATA** (in `main.py`): a fake Databricks catalog used to seed
  metadata versions / simulate a source catalog.

## Components & responsibilities

### `masking_engine.py` — the actual masking
Deterministic, format-preserving, referentially consistent transforms (pure functions of
`(secret, value)`, so the same input always maps to the same output — joins survive):
- `hash_value` — keyed HMAC-SHA256, 16 hex chars.
- `fake_value(value, column_name=None)` — Faker seeded from the value; column-aware
  (address→address, first/last name, etc.).
- `partial_mask` — reveals only the last 2 chars, keeps separators (`***-**-**89`).
- `shift_date(value, shift_days=None)` — one deterministic offset for all dates (preserves
  intervals + format).
- `apply_rule(value, rule, column_name=None)` → `apply_masking_rules(df, rules)` →
  `run_local_anonymization(input_path, output_path, rules)` returns `(preview, audit)`.
- Determinism keyed by env `TDM_MASKING_SECRET` (defaulted for the demo).

### `agent.py` — agentic masking configuration
A self-correcting "Level 3" agent using Claude tool use. It **drives existing functions**,
never reimplements masking. Tools: `inspect_dataset` (read columns), `check_coverage`
(dry-run `apply_admin_locked_rules`, report exposed PII), `finalize_configuration` (run
`run_local_anonymization`). Loop: perceive → propose → check → revise → finalize, with a
hard iteration cap; the model only ever sees column names/types, never real values.
Supports conversational follow-ups (`messages` + `user_message`). Returns a `transcript`
(the pitch artifact) and a round-trippable `messages` list. Requires `ANTHROPIC_API_KEY`.

### `schema_drift.py` + drift logic in `main.py` — governance gate
Real, introspection-based drift (Tonic-style), unified with the metadata registry:
- Baseline = a dataset's sandbox's **active metadata version** table (`dataset.table_name`).
- `introspect_schema(csv_path)` infers value-based logical types; `normalize_type` maps
  catalog + inferred types to one vocabulary; `types_compatible` treats families
  (date↔datetime, integer↔float) as equal to avoid false positives.
- `diff_schema` / `classify_drift` → NO_DRIFT / ADDITIVE (new cols, allowed) / BREAKING
  (removed or cross-family type change, blocked).
- `main.py`: `get_registered_schema(dataset)`, `scan_dataset_schema_drift(dataset)`
  (falls back to a per-dataset auto baseline for ad-hoc datasets), and
  `validate_schema_drift_gate(dataset_ids)` (blocks runs on breaking drift).
- **Resolution = create a successor metadata version** and set it active (reuses
  `create_metadata_version_record` / `attach_metadata_version_to_sandbox`).

## Key request flows

**Generate/upload → configure → run:**
1. Generate synthetic data (`test_data_generator`) or upload a CSV → registered in
   `datasets`, columns detected, `suggest_rule_for_column` assigns default rules, PII flagged.
2. (Optional) Create a sandbox and a metadata version (registered schema), set it active.
3. Configure masking rules per column (manually in the UI, or via the agent).
4. Run a job: `POST /jobs/run` (or `/jobs/run-multiple`) →
   - pre-run validation (`/agents/pre-run-validation` logic),
   - **schema-drift gate** (`validate_schema_drift_gate`): blocks on breaking drift
     (`error_type: "SCHEMA_DRIFT_BLOCKED"`),
   - `apply_admin_locked_rules` (compliance guardrail enforced server-side),
   - `run_local_anonymization` (the masking), producing preview + audit + a `Job`.

**Schema drift loop:** `GET /datasets/{id}/schema-drift` (live file vs active version) →
if drift, `POST .../schema-drift/resolve` (assign rules to new columns, accept removals/
type changes) → creates successor version → back to NO_DRIFT. (`.../simulate-change` is a
DEMO-only endpoint that really edits a CSV to produce drift.)

## API surface (representative)

- Auth/session: `GET /` (backend session id), demo login (`DEMO_USERS`).
- Data: `GET /datasets`, `POST /upload`, test-data generation endpoints.
- Sandboxes & metadata: `GET/POST /sandboxes`, `GET /metadata/versions`,
  `POST /metadata/versions/...`, `POST /metadata/versions/{id}/create-successor`.
- Drift: `GET /datasets/{id}/schema-drift`, `POST /datasets/{id}/schema-drift/resolve`,
  `POST /datasets/{id}/schema-drift/simulate-change`.
- Execution: `POST /jobs/run`, `POST /jobs/run-multiple`, `GET /jobs/{id}/status|preview|audit`,
  `GET /jobs/history`.
- Agent: `POST /agent/configure-masking`, `POST /agents/pre-run-validation`.

## Frontend structure (`App.jsx`)

Single-file React app, all pages/components in one module.
- **Navigation:** `navGroups` array (Main / Data Inventory / Configure / Execute / Admin /
  Help). Active page via `activePage` state + `renderPage()` switch. Collapsible groups.
- **Pages** (functions): `DashboardPage`, `DataInventoryPage`, `MetadataVersionsPage`
  (Central Metadata Registry — **also hosts the `SchemaDriftSection`** drift UI),
  `WorkspacesPage`, `CreatePipelinePage` (multi-step: Sandbox & Source → Rule Config →
  Run/Review, where `RunStep` shows a read-only live Schema Drift Check), `MaskingRulesPage`,
  `SourceConnectionsPage`, `DataClassificationPage`, job monitor / data preview, etc.
- **Styling:** Tailwind utility classes; shared `Card`/`CardContent`/`Button`/`PageHeader`/
  `MetricCard` components; status pills via small badge helpers.
- **API:** axios against `API_BASE_URL`; pattern is `try/catch` with loading + error state.

## Important constraints & gotchas

- **Two permission allowlists** gate every page in `App.jsx`: one in `EnterpriseSideMenu`
  (controls visibility) and one in the main App (`if (!permissions.includes(activePage))
  setActivePage("dashboard")`). A new page key must be added to **both** or it silently
  bounces to the dashboard. (That guard also runs `setActivePage` during render — the
  source of "Maximum update depth exceeded" warnings; ideally move it into a `useEffect`.)
- **Do not port `backend/data/*`** to another machine — it is runtime state.
- **Auth is demo-grade:** `user_role` is client-supplied (spoofable), `DEMO_USERS` are
  plaintext; no real server-side token. Treat as a prototype, not production security.
- **Audit labels say "Databricks Jobs API orchestration"** while masking actually runs
  locally in pandas; the Databricks layer is `MOCK_DATABRICKS_METADATA` (mock).
- **Build on top of existing code; reuse functions as tools.** The agent and drift layers
  are thin decision/governance layers over the existing masking/registry functions — no
  duplicate masking logic.
- A legacy simulated drift "what-if" tool (`validate_metadata_version_drift`,
  `simulate_current_metadata_snapshot`) still exists in the registry but is **not** used by
  execution; the real introspection-based gate is authoritative.

## Running locally

```bash
# backend
cd backend && python -m venv venv && venv/Scripts/python -m pip install -r requirements.txt  # or: fastapi uvicorn pandas faker anthropic
venv/Scripts/python -m uvicorn main:app --host 127.0.0.1 --port 8000
# frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
# agent (optional)
export ANTHROPIC_API_KEY=sk-ant-...
```
