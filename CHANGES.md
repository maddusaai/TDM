# TDM Prototype — Changes Log

All frontend changes made to the TDM-Prototype codebase during this session.

---

## 1. Shared State — ConnectorsContext

**New file:** `frontend/src/context/ConnectorsContext.jsx`

- Created `ConnectorsContext` using React Context API
- `ConnectorsProvider` initialises connector state from `blueprintConnections`
- Exposes `connectors`, `addConnector(connector)`, and `updateConnectorStatus(name, status)`
- `useConnectors()` hook for consuming the context
- Replaces per-page local connector state so any connector added anywhere is immediately visible everywhere

---

## 2. Shared State — WorkspacesContext

**New file:** `frontend/src/context/WorkspacesContext.jsx`

- Created `WorkspacesContext` using React Context API
- `WorkspacesProvider` initialises workspace state from `blueprintWorkspaces`
- Exposes `workspaces` and `addWorkspace(workspace)`
- `useWorkspaces()` hook for consuming the context
- Fixes the bug where a newly created workspace was not visible in `WorkspaceDetailPage` (which previously read from static data)

---

## 3. App.jsx — Provider Wrappers

**File:** `frontend/src/App.jsx`

- Added `ConnectorsProvider` and `WorkspacesProvider` imports
- Wrapped `AppRoutes` in both providers so all pages share the same connector and workspace state:
  ```
  <AuthProvider>
    <ConnectorsProvider>
      <WorkspacesProvider>
        <AppRoutes />
      </WorkspacesProvider>
    </ConnectorsProvider>
  </AuthProvider>
  ```

---

## 4. Shared Constants

**File:** `frontend/src/lib/constants.js`

- Added `wsSlug(name)` helper — converts workspace name to URL slug (`name.toLowerCase().replace(/\s+/g, '-')`)
- Added `ENV_BADGE` map — colour classes for environment labels (PROD, QA, DEV, etc.)
- Added `WS_NAV` array — workspace-scoped sidebar nav items shared between Admin and Developer layouts
- Added `TEST_CONNECTOR_STRINGS` — 3 test connection strings for demo use:
  - `test-retail.tdm.local:1433/RetailDB`
  - `test-finance.tdm.local:1521/FinanceDB`
  - `test-hr-catalog.tdm.local/hr_schema`
- Added `connectorTableData` — maps each test connection string to an array of tables with dummy column data and sample rows, used by `WorkspaceDetailPage` and `CreatePipelinePage`

---

## 5. AdminLayout — Workspace-Scoped Slide-In Sidebar

**File:** `frontend/src/components/layout/AdminLayout.jsx`

- Added `useLocation` and `useEffect` imports
- Imports `wsSlug`, `ENV_BADGE`, `WS_NAV` from `lib/constants`
- Added URL detection: when the current path matches `/admin/workspaces/:wsId/*`, the active workspace slug is extracted
- `useEffect` auto-collapses the main sidebar to icon-only mode when a workspace URL is active, and re-expands it when leaving
- Added a second `<aside>` panel that slides in beside the collapsed main sidebar when a workspace is active — this panel mirrors the Developer layout's workspace-scoped nav (using the shared `WS_NAV` constant)
- Top bar title dynamically shows "Workspace View" or "Admin View" depending on the active URL

---

## 6. DeveloperLayout — Refactor to Use Shared Constants

**File:** `frontend/src/components/layout/DeveloperLayout.jsx`

- Removed local definitions of `wsSlug`, `ENV_BADGE`, and `WS_NAV`
- Imports them from `../../lib/constants` instead (single source of truth)

---

## 7. WorkspacesPage — Row Click Navigation + 3-Step Create Modal

**File:** `frontend/src/pages/WorkspacesPage.jsx`

### Row click navigation
- Added `useNavigate` import
- Workspace table row `onClick` now calls `navigate('/admin/workspaces/' + wsSlug(workspace.name))`, triggering the Admin workspace sidebar automatically

### Context migration
- Removed local `[workspaces, setWorkspaces]` state
- Uses `{ workspaces, addWorkspace }` from `useWorkspaces()` context
- Uses `{ connectors, addConnector }` from `useConnectors()` context

### 3-Step Create Workspace Modal
Converted the single-step modal into a 3-step flow:

**Step 1 — Basic Details**
- Name, Created By, Description, Business Owner, Environment
- `validateStep1()` checks name is non-empty and not a duplicate

**Step 2 — Connector Selection**
- Checklist of all connectors from `useConnectors()`
- "Add New Connector" toggle reveals an inline form (Name, Type, Connection String)
- `addNewConnector()` calls `addConnector()` from context — new connector immediately visible in Source Connections page
- Selected connector names stored in `selectedConnectorNames` state

**Step 3 — Member Assignment (optional)**
- Shows org member list with checkboxes
- "Skip & Create" creates workspace with `members: []`
- "Create Workspace" creates workspace with selected members

### Post-creation
- `finishCreateWorkspace()` calls `addWorkspace()` and navigates to `/admin/workspaces`
- New workspace appears immediately in the workspaces list

---

## 8. WorkspaceDetailPage — Context + Test Data

**File:** `frontend/src/pages/WorkspaceDetailPage.jsx`

- Replaced `blueprintWorkspaces.find(...)` with `workspaces.find(...)` from `useWorkspaces()` context — newly created workspaces are now found correctly
- Added `connectorTableData` import from constants
- `ConnectorsTab` now accepts a `workspace` prop and filters connectors by `workspace.connectors` array (only shows connectors assigned to that workspace)
- Added `ConnectorTablePreview` sub-component: for each connector, shows an expandable list of tables with dummy row data from `connectorTableData`

---

## 9. SourceConnectionsPage — Context + Test Connectors

**File:** `frontend/src/pages/SourceConnectionsPage.jsx`

- Rewrote to use `useConnectors()` context instead of local state
- Added expandable "Test Connectors" reference card — shows 3 test connection strings admins can copy-paste
- "Add Connection" form now has three fields: Name, Type, Connection String
- Auto-detects test connection strings — status set to `Connected` immediately on add
- `testConnection()` calls `updateConnectorStatus()` from context
- Connection Catalog table now shows a "Tables" column derived from `connectorTableData`

---

## 10. DashboardPage — "My Workspaces" Navigation

**File:** `frontend/src/pages/DashboardPage.jsx`

- Changed "My Workspaces" heading from a plain `<h2>` to a `<button>`
- Clicking it navigates to `${basePath}/workspaces` (works for both admin and developer base paths)

---

## 11. CreatePipelinePage — Cleanup and Simplification

**File:** `frontend/src/pages/CreatePipelinePage.jsx`

Reduced from **1,451 lines to ~480 lines**.

### Removed
- `framer-motion` dependency entirely
- `WorkflowProgress` component (redundant progress bar above the Stepper)
- `SandboxSummaryCard` sticky component
- Quick CSV upload card
- Entire Sandbox Manager section (create sandbox, select sandbox, sandbox metadata card, existing sandbox datasets table)
- Databricks Unity Catalog hardcoded source connection dropdown
- All backend calls to `/sandboxes`, `/datasets`, `/source-metadata/databricks/*` in SourceStep
- "Pipeline Navigation" bar at the bottom
- `datasetId` and `detectedColumns` state from main component (no longer needed)

### Rewritten — SourceStep
- Now uses `useConnectors()` to list available connectors
- Uses `connectorTableData` to show tables per connector — no backend calls needed
- User picks connector → selects tables → sets row count per table
- Auto-detects PII columns by name pattern (`name`, `email`, `phone`, `ssn`, `dob`, `address`)
- On proceed: builds a datasets array and passes it to `onMultipleDatasetsGenerated`

### Simplified — RunStep
- Removed sandbox_id requirement check (no sandbox concept in the new flow)
- Removed sandbox schema display from Pre-Run Summary card
- Replaced `motion.div` progress bar with a plain CSS animated div

### Simplified — Main Component
- Tracks only `activeStep`, `maskingRules`, `selectedDatasets`, `currentJobId`
- Added a "Reset" button in the page header instead of a separate navigation card
- Step transition uses a plain `<div key={activeStep}>` instead of `motion.div`

### Unchanged
- `Stepper` component
- `MultiTableRulesStep` (masking rule assignment per column)
- `PreRunValidationAgentCard` (collapsible pre-run validation)
- `PreviewTable` (before/after preview table)
- `ReviewStep` (fetches job preview and audit from backend)

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `frontend/src/context/ConnectorsContext.jsx` | Shared connector state across all pages |
| `frontend/src/context/WorkspacesContext.jsx` | Shared workspace state across all pages |

## Summary of Modified Files

| File | Key Change |
|------|-----------|
| `frontend/src/App.jsx` | Wrapped app in `ConnectorsProvider` and `WorkspacesProvider` |
| `frontend/src/lib/constants.js` | Added `wsSlug`, `ENV_BADGE`, `WS_NAV`, test connector data |
| `frontend/src/components/layout/AdminLayout.jsx` | Workspace-scoped slide-in sidebar |
| `frontend/src/components/layout/DeveloperLayout.jsx` | Use shared constants instead of local definitions |
| `frontend/src/pages/WorkspacesPage.jsx` | Row click navigation + 3-step create modal |
| `frontend/src/pages/WorkspaceDetailPage.jsx` | Context-based workspace lookup + test data preview |
| `frontend/src/pages/SourceConnectionsPage.jsx` | Context-based connectors + test connector reference |
| `frontend/src/pages/DashboardPage.jsx` | "My Workspaces" heading navigates to workspaces tab |
| `frontend/src/pages/CreatePipelinePage.jsx` | Full cleanup — removed sandbox/CSV/Databricks complexity |
