# TDM Platform — Target Architecture

## Overview

This document describes the target workspace-oriented, multi-tenant architecture for the TDM (Test Data Management) anonymization platform. It supersedes the current single-file prototype design and is intended as a blueprint for the next phase of development.

---

## Table of Contents

1. [Tenancy Model](#1-tenancy-model)
2. [Core Entity Hierarchy](#2-core-entity-hierarchy)
3. [Entity Definitions](#3-entity-definitions)
4. [Roles & RBAC](#4-roles--rbac)
5. [Connector Scoping](#5-connector-scoping)
6. [Masking Rules Hierarchy](#6-masking-rules-hierarchy)
7. [Admin UI vs Developer UI](#7-admin-ui-vs-developer-ui)
8. [API Structure](#8-api-structure)
9. [Data Isolation Strategy](#9-data-isolation-strategy)
10. [Migration from Prototype](#10-migration-from-prototype)
11. [Future Considerations](#11-future-considerations)

---

## 1. Tenancy Model

The platform is **multi-tenant**. Each tenant is an **Organization**. Organizations are fully isolated from each other — no data, users, connectors, or workspaces are shared across org boundaries.

```
┌─────────────────────────────────────────────┐
│                  Platform                   │
│  ┌──────────────┐    ┌──────────────┐       │
│  │   Org A      │    │   Org B      │       │
│  │  (Tenant 1)  │    │  (Tenant 2)  │  ...  │
│  └──────────────┘    └──────────────┘       │
└─────────────────────────────────────────────┘
```

All API endpoints enforce org isolation. Every database query is filtered by `org_id` derived from the authenticated user's JWT — never from a request parameter.

---

## 2. Core Entity Hierarchy

### Containment Hierarchy

```
Organization (Tenant)
  │
  ├── OrgMembers         (User ↔ OrgRole)
  ├── Org-Locked Rules   (masking rules enforced across all workspaces)
  |── Shared connectors
  └── Workspace
        │
        ├── WorkspaceMembers   (User ↔ WorkspaceRole)
        ├── Connectors         (workspace-scoped or personal)
        ├── Pipelines
        ├── MaskingRules       (workspace-level overrides)
        ├── Jobs
        └── Audit Logs
```

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ORGANIZATION                                      │
│  id · name · slug · plan_tier                                                │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ 1
        ┌──────────┴──────────┐
        │ n                   │ n
┌───────┴────────┐   ┌────────┴──────────────────────────────────────────────┐
│   ORG_MEMBER   │   │                    WORKSPACE                           │
│ ─────────────  │   │  id · org_id · name · environment · created_by        │
│ org_id  (FK)   │   └──┬──────────────────────────────────────────────┬─────┘
│ user_id (FK)   │      │ 1                                            │ 1
│ role           │      │                                              │
└───────┬────────┘      │ n                                            │ n
        │        ┌──────┴────────────┐                    ┌───────────┴──────────┐
        │        │ WORKSPACE_MEMBER  │                    │    MASKING_RULE       │
        │        │ ────────────────  │                    │  ──────────────────   │
        │        │ workspace_id (FK) │                    │  scope (org|workspace)│
        │        │ user_id      (FK) │                    │  org_id         (FK)  │
        │        │ role             │                    │  workspace_id   (FK)  │
        │        └──────┬───────────┘                    │  column_pattern       │
        │               │                                │  rule                 │
        │               │                                │  developer_can_override│
┌───────┴────────┐       │                                └──────────────────────┘
│     USER       │◄──────┘
│  ────────────  │                ┌─────────────────────────────────────────────┐
│  id · email    │                │                CONNECTOR                     │
│  name          │                │  ─────────────────────────────────────────  │
│  password_hash │                │  id · workspace_id (FK) · created_by (FK)  │
└───────┬────────┘                │  scope (workspace|personal)                 │
        │                        │  type (postgres|snowflake|s3|...)            │
        │ triggers                │  credential_ref · config                    │
        │                        └──────────────┬──────────────────────────────┘
        │                                        │ 1
        │                                        │ n
        │                        ┌───────────────┴─────────────────────────────┐
        │                        │                PIPELINE                      │
        │                        │  ─────────────────────────────────────────  │
        │                        │  id · workspace_id (FK) · connector_id (FK) │
        └───────────────────────►│  name · source_config · masking_rules       │
          created_by (FK)        │  created_by (FK)                            │
                                 └──────────────┬──────────────────────────────┘
                                                │ 1
                                                │ n
                                 ┌──────────────┴──────────────────────────────┐
                                 │                  JOB                         │
                                 │  ─────────────────────────────────────────  │
                                 │  id · pipeline_id (FK) · workspace_id (FK)  │
                                 │  triggered_by (FK) · status                 │
                                 │  rows_processed · columns_masked             │
                                 │  audit_log · started_at · completed_at      │
                                 └─────────────────────────────────────────────┘
```

### Connector Scope Hierarchy

```
                    ┌─────────────────────────────────────┐
                    │         CONNECTOR SCOPES             │
                    └─────────────────────────────────────┘

  Future V2              Current V1               Current V1
┌────────────┐        ┌──────────────┐         ┌──────────────────┐
│    ORG     │        │  WORKSPACE   │         │    PERSONAL      │
│ CONNECTOR  │        │  CONNECTOR   │         │   CONNECTOR      │
│ ────────── │        │ ──────────── │         │ ────────────────  │
│ Shared     │        │ Shared with  │         │ Visible only to  │
│ across ALL │        │ all members  │         │ the creator      │
│ workspaces │        │ of that      │         │                  │
│ in the org │        │ workspace    │         │ Created by:      │
│            │        │              │         │ developer+       │
│ Created by:│        │ Created by:  │         │                  │
│ org_admin  │        │ workspace_   │         │ Scoped to one    │
│            │        │ owner /      │         │ workspace        │
│            │        │ org_admin    │         │                  │
└────────────┘        └──────────────┘         └──────────────────┘
  (deferred)             ↑ higher visibility      ↑ lower visibility
                         can be promoted ──────────────────────────►
                         only by workspace_owner or org_admin
```

### Masking Rules Precedence

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  PRIORITY 1 (Highest) — Org-Locked Rules                        │
  │  Set by: org_admin                                              │
  │  Scope: all workspaces in the org                               │
  │  developer_can_override: false → HARD ENFORCED at job runtime   │
  │  developer_can_override: true  → can be overridden below        │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ (if override allowed)
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  PRIORITY 2 — Workspace Rules                                   │
  │  Set by: workspace_owner or org_admin                           │
  │  Scope: all pipelines within one workspace                      │
  │  developer_can_override: false → enforced within workspace      │
  │  developer_can_override: true  → developer can change per job   │
  └────────────────────────────────┬────────────────────────────────┘
                                   │ (if override allowed)
                                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  PRIORITY 3 (Lowest) — Pipeline / Job Rules                     │
  │  Set by: developer (within allowed overrides)                   │
  │  Scope: one pipeline run                                        │
  └─────────────────────────────────────────────────────────────────┘
```

Everything visible to a user is scoped first by `org_id`, then by `workspace_id`. Users only see workspaces they are members of (unless they are an `org_admin`, who sees all).

---

## 3. Entity Definitions

### Organization

```
Organization
  ├── id            UUID, PK
  ├── name          string
  ├── slug          string, unique (used in URLs)
  ├── plan_tier     enum: free | pro | enterprise
  ├── created_at    timestamp
  └── settings      JSON (org-level config)
```

### User

```
User
  ├── id            UUID, PK
  ├── email         string, unique
  ├── name          string
  ├── password_hash string (bcrypt)
  ├── created_at    timestamp
  └── last_login    timestamp
```

Users are global entities. Their access is defined by memberships (OrgMember, WorkspaceMember), not by the user record itself.

### OrgMember

```
OrgMember
  ├── org_id      FK → Organization
  ├── user_id     FK → User
  ├── role        enum: org_admin | org_member
  └── joined_at   timestamp
```

### Workspace

```
Workspace
  ├── id            UUID, PK
  ├── org_id        FK → Organization
  ├── name          string
  ├── environment   enum: DEV | QA | UAT | PROD
  ├── description   string
  ├── created_by    FK → User
  ├── created_at    timestamp
  └── archived      bool
```

Workspaces are created by `org_admin` users. They cannot be created by developers.

### WorkspaceMember

```
WorkspaceMember
  ├── workspace_id  FK → Workspace
  ├── user_id       FK → User
  ├── role          enum: workspace_owner | developer | viewer
  ├── invited_by    FK → User
  └── joined_at     timestamp
```

### Connector

```
Connector
  ├── id              UUID, PK
  ├── workspace_id    FK → Workspace
  ├── created_by      FK → User
  ├── scope           enum: workspace | personal
  ├── name            string
  ├── type            enum: postgres | mysql | sqlserver | snowflake
  │                       | databricks | bigquery | redshift
  │                       | s3 | azure_blob | gcs
  │                       | rest_api | csv_upload
  ├── credential_ref  string  (reference to secrets store; never raw credentials)
  ├── config          JSON    (non-sensitive config: host, port, database, schema, etc.)
  ├── created_at      timestamp
  └── last_tested_at  timestamp
```

**Scope rules:**
- `workspace` — visible to all workspace members; only `workspace_owner` or `org_admin` can create/edit/delete
- `personal` — visible only to `created_by`; any `developer` can create their own

**Credential handling:** Raw credentials (passwords, tokens, keys) are **never stored in the application database**. They are written to a secrets store (e.g., environment-scoped JSON vault for prototype; AWS Secrets Manager / HashiCorp Vault for production). `credential_ref` is the lookup key.

### Pipeline

```
Pipeline
  ├── id              UUID, PK
  ├── workspace_id    FK → Workspace
  ├── connector_id    FK → Connector
  ├── name            string
  ├── source_config   JSON  (selected tables, schema, subsetting rules)
  ├── masking_rules   JSON  (column-level rule assignments)
  ├── created_by      FK → User
  ├── created_at      timestamp
  └── last_run_at     timestamp
```

### Job

```
Job
  ├── id              UUID, PK
  ├── pipeline_id     FK → Pipeline
  ├── workspace_id    FK → Workspace  (denormalized for fast filtering)
  ├── triggered_by    FK → User
  ├── status          enum: queued | running | completed | failed
  ├── started_at      timestamp
  ├── completed_at    timestamp
  ├── rows_processed  int
  ├── columns_masked  int
  └── audit_log       JSON
```

### MaskingRule

```
MaskingRule
  ├── id              UUID, PK
  ├── scope           enum: org | workspace
  ├── org_id          FK → Organization
  ├── workspace_id    FK → Workspace  (null if scope = org)
  ├── column_pattern  string  (exact name or glob pattern, e.g., "*_ssn")
  ├── rule            enum: no_masking | fake_value | partial_masking
  │                       | date_shift | hash | tokenize | nullify
  ├── developer_can_override  bool
  ├── created_by      FK → User
  └── created_at      timestamp
```

---

## 4. Roles & RBAC

### Two-Level Role System

Access is determined by composing the user's **org role** and their **workspace role**.

#### Org-Level Roles

| Role | Capabilities |
|------|-------------|
| `org_admin` | Create/delete/archive workspaces; manage org members; set org-locked masking rules; view all workspaces and their contents; invite users to any workspace |
| `org_member` | No org-level capabilities; access only to workspaces they are explicitly invited to |

> **Rule:** `org_admin` implicitly holds `workspace_owner` rights in every workspace of their org, without needing an explicit `WorkspaceMember` record.

#### Workspace-Level Roles

| Role | Capabilities |
|------|-------------|
| `workspace_owner` | Invite/remove workspace members; manage workspace connectors; configure workspace masking rules; run any pipeline; view all jobs and outputs |
| `developer` | Use workspace connectors; create/manage personal connectors; create and run pipelines; view their own jobs and outputs |
| `viewer` | Read-only access to pipelines, job history, and outputs; cannot run jobs or manage connectors |

#### Permission Matrix

| Action | org_admin | workspace_owner | developer | viewer |
|--------|-----------|-----------------|-----------|--------|
| Create workspace | ✅ | ❌ | ❌ | ❌ |
| Delete/archive workspace | ✅ | ❌ | ❌ | ❌ |
| Invite user to workspace | ✅ | ✅ | ❌ | ❌ |
| Remove user from workspace | ✅ | ✅ | ❌ | ❌ |
| Create workspace connector | ✅ | ✅ | ❌ | ❌ |
| Edit/delete workspace connector | ✅ | ✅ | ❌ | ❌ |
| Use workspace connector (in pipeline) | ✅ | ✅ | ✅ | ❌ |
| Create personal connector | ✅ | ✅ | ✅ | ❌ |
| Create pipeline | ✅ | ✅ | ✅ | ❌ |
| Run pipeline | ✅ | ✅ | ✅ | ❌ |
| View pipeline outputs | ✅ | ✅ | ✅ | ✅ |
| Set org-locked masking rules | ✅ | ❌ | ❌ | ❌ |
| Set workspace masking rules | ✅ | ✅ | ❌ | ❌ |
| Override masking rule (if allowed) | ✅ | ✅ | ✅* | ❌ |
| View all org workspaces | ✅ | ❌ | ❌ | ❌ |

> \* Developers can override a rule only if `developer_can_override = true` on that rule. Org-locked rules with `developer_can_override = false` are enforced at job execution time regardless of UI input.

---

## 5. Connector Scoping

### Two Scopes

```
Workspace Connector
  └── Created by: workspace_owner or org_admin
  └── Visible to: all workspace members
  └── Use case: shared production DB read replica, org's Snowflake instance, etc.

Personal Connector
  └── Created by: any developer (or above)
  └── Visible to: creator only
  └── Use case: developer's own sandbox DB, personal S3 bucket, etc.
```

### Connector Lifecycle

```
org_admin / workspace_owner
  │
  ├── Creates workspace connector
  │     └── All developers in workspace can SELECT it when building a pipeline
  │
developer
  ├── Creates personal connector
  │     └── Only they can see and use it
  │
  └── (Cannot promote personal → workspace; only workspace_owner/org_admin can)
```

### Connector Types (Planned)

| Category | Types |
|----------|-------|
| Relational DB | PostgreSQL, MySQL, SQL Server, Oracle |
| Cloud Data Platforms | Snowflake, Databricks, BigQuery, Redshift |
| File / Object Storage | CSV Upload, AWS S3, Azure Blob, GCS |
| APIs | REST API (with auth config) |

> For the current prototype phase, connectors are mocked. The `type` and `config` fields are defined now so the data model does not need to change when real connections are implemented.

---

## 6. Masking Rules Hierarchy

Rules are evaluated top-down. A lower-level rule can override a higher-level rule only if `developer_can_override = true`.

```
1. Org-locked rules         (set by org_admin; highest priority)
   └── developer_can_override: false → ENFORCED, cannot be changed at any lower level
   └── developer_can_override: true  → can be overridden at workspace or pipeline level

2. Workspace rules          (set by workspace_owner or org_admin)
   └── Apply to all pipelines in the workspace by default
   └── Can override org rules only if org rule allows it

3. Pipeline-level rules     (set when creating/editing a pipeline)
   └── Developer-assigned per column
   └── Can override workspace rules only if workspace rule allows it
```

### Rule Types

| Rule | Description |
|------|-------------|
| `no_masking` | Value passed through unchanged |
| `fake_value` | Replaced with realistic synthetic value (Faker) |
| `partial_masking` | Retain prefix/suffix, mask middle (e.g., SSN: `12****89`) |
| `date_shift` | Shift date by random ±N days within a configurable range |
| `hash` | SHA-256 (truncated), consistent within a job run |
| `tokenize` | Replace with a reversible token (requires token vault) |
| `nullify` | Replace with NULL / empty |

---

## 7. Admin UI vs Developer UI

### Admin UI (`org_admin` view)

```
┌─────────────────────────────────────────────────────────┐
│  Left Sidebar          │  Main Content Area              │
│                        │                                 │
│  [Org Name]            │  (workspace selected)           │
│  ──────────            │                                 │
│  > Workspaces          │  Dashboard                      │
│    • Workspace A    ◄──┤  Members                        │
│    • Workspace B       │  Connectors                     │
│    • Workspace C       │  Pipelines                      │
│    + New Workspace     │  Jobs                           │
│  ──────────            │  Masking Rules                  │
│  Org Settings          │                                 │
│  > Members             │                                 │
│  > Locked Rules        │                                 │
│  > Billing             │                                 │
└─────────────────────────────────────────────────────────┘
```

- Workspace list is always visible in the left sidebar.
- Clicking a workspace loads its context in the main area.
- Org-level sections (Members, Locked Rules, Billing) are accessible from the sidebar independently of any workspace.
- Admin can act as `workspace_owner` in any workspace without needing an explicit invitation.

### Developer UI (`developer` / `viewer` view)

```
┌─────────────────────────────────────────────────────────┐
│  Top Bar:  [Org Name]              User: dev@org.com    │
│─────────────────────────────────────────────────────────│
│  Left Sidebar          │  Main Content Area              │
│                        │  (scoped to active workspace)   │
│  [Org Name]            │                                 │
│  ──────────            │  Dashboard                      │
│  > My Workspaces       │  Data Inventory                 │
│    • Workspace A    ◄──┤  Connectors                     │
│    • Workspace B       │  Pipelines                      │
│    • Workspace C       │  Jobs                           │
│  ──────────            │  Masked Outputs                 │
│  Help                  │  Help                           │
└─────────────────────────────────────────────────────────┘
```

- Workspaces are listed in the left sidebar. The developer sees **only the workspaces they are a member of** — never workspaces they haven't been invited to.
- Clicking a workspace in the sidebar activates it; the entire main content area re-scopes to that workspace.
- The active workspace is visually highlighted in the sidebar. There is no global/unscoped view for developers.
- No org-level sections (Members, Locked Rules, Billing) are visible.
- Connector page shows workspace connectors (read) + the developer's own personal connectors (read/write).

---

## 8. API Structure

### Authentication

All endpoints (except `/auth/*`) require a JWT bearer token. The JWT payload includes:

```json
{
  "user_id": "uuid",
  "org_id": "uuid",
  "email": "user@org.com",
  "org_role": "org_admin | org_member"
}
```

Workspace role is resolved per-request from the `WorkspaceMember` table for endpoints that require it.

### Endpoint Groups

```
/auth
  POST  /auth/login
  POST  /auth/logout
  POST  /auth/invite/accept     (accept workspace or org invitation)

/org
  GET   /org                    (org details; org_admin only)
  GET   /org/members
  POST  /org/members/invite
  DELETE /org/members/{user_id}
  GET   /org/rules              (org-locked masking rules)
  POST  /org/rules
  PUT   /org/rules/{rule_id}
  DELETE /org/rules/{rule_id}

/workspaces
  GET   /workspaces             (org_admin: all; others: member-of only)
  POST  /workspaces             (org_admin only)
  GET   /workspaces/{ws_id}
  PUT   /workspaces/{ws_id}
  DELETE /workspaces/{ws_id}   (org_admin only)

/workspaces/{ws_id}/members
  GET   /members
  POST  /members/invite
  PUT   /members/{user_id}      (change role)
  DELETE /members/{user_id}

/workspaces/{ws_id}/connectors
  GET   /connectors             (workspace + caller's personal)
  POST  /connectors
  GET   /connectors/{conn_id}
  PUT   /connectors/{conn_id}
  DELETE /connectors/{conn_id}
  POST  /connectors/{conn_id}/test  (test connection)

/workspaces/{ws_id}/pipelines
  GET   /pipelines
  POST  /pipelines
  GET   /pipelines/{pipeline_id}
  PUT   /pipelines/{pipeline_id}
  DELETE /pipelines/{pipeline_id}
  POST  /pipelines/{pipeline_id}/run

/workspaces/{ws_id}/jobs
  GET   /jobs
  GET   /jobs/{job_id}
  GET   /jobs/{job_id}/preview
  GET   /jobs/{job_id}/audit
  GET   /jobs/{job_id}/download

/workspaces/{ws_id}/rules
  GET   /rules                  (effective rules: org-locked + workspace)
  POST  /rules
  PUT   /rules/{rule_id}
  DELETE /rules/{rule_id}
```

### Authorization Middleware

Every request goes through two middleware layers in order:

1. **AuthMiddleware** — validates JWT, attaches `user` + `org_id` to request context
2. **WorkspaceAccessMiddleware** — for `/workspaces/{ws_id}/*` routes, verifies the user is a member of that workspace (or is an `org_admin`); attaches `workspace_role` to context

Route handlers then check `workspace_role` (or `org_role`) for operation-specific permissions using a policy function — not inline conditionals scattered across handlers.

---

## 9. Data Isolation Strategy

### Database Level

All core tables include `org_id`. Every query includes a `WHERE org_id = :org_id` condition, enforced by a data access layer (repository pattern), not by individual route handlers.

```
Key tables with org_id:
  workspaces.org_id
  connectors.workspace_id → workspaces.org_id
  pipelines.workspace_id  → workspaces.org_id
  jobs.workspace_id       → workspaces.org_id
  masking_rules.org_id
```

This means even if a bug exposes a `workspace_id` from another org, the `org_id` filter at the DB layer prevents cross-tenant data leakage.

### Credential Isolation

Connector credentials are stored in a secrets store keyed by `{org_id}/{connector_id}`. No credential lookup can cross org boundaries by construction.

### File / Output Isolation

Masked output files and uploaded datasets are stored under an org/workspace-scoped path:

```
/data/{org_id}/{workspace_id}/uploads/
/data/{org_id}/{workspace_id}/outputs/
/data/{org_id}/{workspace_id}/generated/
```

---

## 10. Migration from Prototype

The current prototype is a useful reference implementation. The following table maps prototype concepts to target architecture concepts.

| Prototype | Target Architecture | Notes |
|-----------|--------------------|----|
| Hardcoded `DEMO_USERS` | `User` + `OrgMember` tables | JWT auth; bcrypt passwords |
| `localStorage` developer workspaces | `Workspace` + `WorkspaceMember` tables | Server-side; survive browser clears |
| Admin workspace "blueprints" (UI only) | Real `Workspace` records | Org admin creates them |
| `permission[]` array on user | Derived from `org_role` + `workspace_role` | Computed per request |
| CSV upload "connector" | `Connector` with `type: csv_upload` | Same concept, now typed |
| Databricks mock metadata | `Connector` with `type: databricks` | Real connection when ready |
| `admin_locked_rules.json` | `MaskingRule` with `scope: org` | DB-persisted |
| `datasets = {}` in-memory dict | `Dataset` table + file storage | Survives restarts |
| `jobs = {}` in-memory dict | `Job` table | Full persistence + audit |
| Monolithic `App.jsx` | React Router + feature-folder components | Required before workspace scoping |

### Recommended Implementation Order

1. **Split `App.jsx`** into routed pages (React Router v6, feature folders) — prerequisite for everything else
2. **Add real auth** (JWT, user registration, login) with `User` + `OrgMember` tables
3. **Workspace CRUD** with `WorkspaceMember` and role enforcement middleware
4. **Typed Connectors** (schema only; keep mocking actual connections)
5. **Workspace-scoped Pipelines and Jobs**
6. **Masking Rules hierarchy** (org-locked → workspace → pipeline)
7. **Real connector implementations** (one type at a time)

---

## 11. Future Considerations

### Org-Level Connectors (V2)

If the same production data source needs to be accessible across multiple workspaces (e.g., a shared Snowflake read replica), an `org_connector` scope can be added without changing the workspace connector model:

```
Scope hierarchy:
  org_connector → available to all workspaces in the org
  workspace_connector → available within one workspace
  personal_connector → available to one user
```

This is intentionally deferred for V1 to keep the model simple.

### Audit & Compliance

For enterprise use cases, every data access event (pipeline run, output download, masking rule change) should be written to an immutable audit log with:
- `actor_id`, `org_id`, `workspace_id`
- `action` (enum)
- `resource_type` + `resource_id`
- `timestamp`
- `ip_address`

This is foundational for SOC 2 / HIPAA compliance.

### Workspace Templates

An `org_admin` may want to create new workspaces from a template (pre-configured connectors, rules, pipeline skeletons). This can be modeled as a `WorkspaceTemplate` entity referencing a `Workspace` snapshot — useful for orgs that provision many similar workspaces (e.g., one per client engagement).

### Approval Workflows

For regulated industries, pipeline runs or masking rule changes may require a second approver before execution. This can be layered on top of the Pipeline/Job model as an `ApprovalRequest` entity without restructuring the core model.
