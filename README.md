# TDM Data Anonymization MVP

A demo-ready **Test Data Management (TDM) Data Anonymization MVP** built to demonstrate a more scalable, modular, and enterprise-style alternative to a Streamlit-based anonymization tool.

The application supports CSV extraction, synthetic test data generation, AI-assisted schema classification, AI-suggested masking rules, user overrides, anonymization execution, audit review, job monitoring, role-based access, enterprise-style navigation, and masked CSV download.

---

## Project Objective

The goal of this MVP is to show how a TDM anonymization platform can be designed using a modern separated architecture.

```text
React Frontend
        ↓
FastAPI Backend
        ↓
Pandas + Faker Local Anonymization Engine
        ↓
Masked CSV Output + Audit Summary
```

This MVP currently runs locally, but the architecture is designed so the local Pandas engine can later be replaced with:

```text
FastAPI
        ↓
Databricks Jobs API
        ↓
PySpark Anonymization Engine
        ↓
Delta Tables / Enterprise Output Layer
```

---

## Why This Improves the Older Streamlit Approach

The older Streamlit-based implementation combined UI, session handling, data processing, masking, preview, and output handling inside the same app process.

This MVP improves that by separating:

- React frontend for user interaction
- FastAPI backend for orchestration
- Separate anonymization engine for processing
- Dedicated APIs for upload, test data generation, job execution, preview, audit, and download
- Role-based access for Admin and Developer users
- Enterprise-style navigation and workflow structure
- AI-assisted masking rule suggestion with user override support

---

## Current Features

### Authentication & Role-Based Access

The application includes a demo login page with two roles:

| Role | Access |
|---|---|
| Admin | Full access to all pages including admin/configuration pages |
| Developer | Limited access to workflow, classification, masking, monitoring, preview, and help pages |

Demo credentials:

```text
Admin:
admin@tdm.com
Admin@123

Developer:
developer@tdm.com
Dev@123
```

> Note: Authentication is demo-only and not production-secure.

---

## Enterprise Navigation

The app includes a collapsible left-side navigation menu with grouped sections.

```text
Main
- Dashboard
- Data Inventory
- Workspaces

Configure
- Source Connections
- Data Classification
- Masking Rules
- Subsetting Rules

Execute
- Create Pipeline
- Existing Pipelines
- Job Monitor
- Data Preview & Validation

Admin
- User Access & Roles
- Configuration

Help
- Documentation
```

The menu is role-based:

- Admin can see all sections.
- Developer can only see permitted workflow and monitoring sections.

The menu also supports:

- Parent category expand/collapse
- Full menu view
- Collapsed icon-only view

---

## Create Pipeline Flow

The main anonymization workflow is available under:

```text
Execute → Create Pipeline
```

Pipeline steps:

```text
1. Source Selection
2. AI-Assisted Masking Rule Assignment
3. Run Anonymization Job
4. Review Output
```

Users can:

- Upload a CSV file
- Generate synthetic test data
- Select from existing uploaded/generated datasets
- Review detected schema
- Review AI-suggested masking rules
- Override suggested rules
- Run anonymization
- Preview before/after output
- Download masked CSV output

---

## AI-Assisted Masking Suggestion

The MVP currently uses rule-based AI-assisted detection from column names and schema patterns.

Example suggestions:

| Column | AI Suggested Rule |
|---|---|
| full_name | Fake Value |
| email | Fake Value |
| phone_number | Fake Value |
| ssn | Partial Masking |
| date_of_birth | Date Shift |
| customer_id | Hash |
| account_balance | No Masking |

The user can override the AI-suggested rule before running the anonymization job.

The Rules screen shows:

```text
Column
Detected Type
AI Classification
AI Suggested Rule
Final Rule / Override
Override Status
```

Override status can be:

```text
AI Accepted
User Overridden
```

---

## Supported Masking Rules

```text
Fake Value
Partial Masking
No Masking
Date Shift
Hash
```

### Rule Behavior

| Rule | Description |
|---|---|
| Fake Value | Replaces original values with synthetic values using Faker |
| Partial Masking | Masks part of the value while keeping limited visible characters |
| No Masking | Leaves the value unchanged |
| Date Shift | Shifts date values by a random safe offset |
| Hash | Applies irreversible SHA-based hashing |

---

## Synthetic Test Data Generation

The app can generate synthetic datasets for testing and demos.

Supported templates:

```text
Customer Data
Account Data
Claims Data
Employee Data
```

Generated datasets are treated like uploaded datasets and can be:

- Classified
- Masked
- Previewed
- Downloaded
- Tracked in job history

---

## Data Classification

The **Data Classification** page shows a blueprint-style classification table.

Fields shown:

```text
Table / Dataset Name
Column Name
Detected Data Type
AI Assigned Classification
AI Assisted Masking Rule
Override
Assigned Tag
```

Current classification is rule-based and uses column names and schema patterns.

Future classification can be upgraded using:

```text
GenAI
Presidio
Sample-value scanning
Business glossary metadata
Data catalog context
```

---

## Masking Rules Page

The **Masking Rules** page includes enterprise-style sections for:

```text
Global Masking Rules
Table / Column Rule Assignment
Conditional Transform Rules
```

Example rule types:

```text
Default Email Masking
Default Identifier Hashing
Default Date Shift
US SSN Conditional Mask
Minor DOB Protection
VIP Customer Identifier
High Balance Suppression
```

> Note: Conditional rules are currently represented in the UI as blueprint examples. Backend persistence and actual conditional execution can be added in a future phase.

---

## Dashboard

The Dashboard shows high-level job and output status.

Summary cards include:

```text
Total Jobs
Latest Status
Latest Rows
Masked Output Available
```

---

## Data Inventory

The Data Inventory page shows uploaded and generated datasets available in the current backend session.

For each dataset, the page displays:

```text
Dataset name
Source type
Upload/generated timestamp
Detected columns
Suggested masking rules
PII tags
```

---

## Job Monitor

The Job Monitor page displays recent anonymization jobs.

Job history includes:

```text
Job ID
Dataset Name
Source Type
Status
Created At
Rows Processed
Columns Masked
Execution Mode
```

---

## Data Preview & Validation

After a pipeline run, the user can review:

```text
Before anonymization preview
After anonymization preview
Audit summary
Download masked CSV
```

Audit summary includes:

```text
Total rows processed
Tables processed
PII columns masked
Rules applied
Output target
Run status
Execution mode
```

---

## Tech Stack

### Frontend

```text
React
Vite
Tailwind CSS
Axios
Lucide React
Framer Motion
```

### Backend

```text
Python
FastAPI
Uvicorn
Pandas
Faker
python-multipart
Pydantic
```

---

## Folder Structure

```text
TDM-anonymization-mvp/
├── backend/
│   ├── main.py
│   ├── masking_engine.py
│   ├── test_data_generator.py
│   └── data/
│       ├── uploads/
│       ├── generated/
│       └── outputs/
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── README.md
└── .gitignore
```

Runtime-generated folders are ignored by Git:

```text
backend/data/uploads/
backend/data/generated/
backend/data/outputs/
```

---

## Prerequisites

Install these before running the project:

```text
Git
Node.js 22+
npm
Python 3.10+
pip
VS Code, optional
```

Check versions:

```bash
git --version
node -v
npm -v
python3 --version
pip3 --version
```

---

## Clone the Repository

```bash
git clone https://github.com/Mohith-Prasanna-07/TDM-anonymization-mvp.git
cd TDM-anonymization-mvp
```

---

## Backend Setup

Open a terminal from the project root:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-multipart pandas faker
uvicorn main:app --reload --port 8000
```

Backend runs at:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Frontend Setup

Open a second terminal from the project root:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

---

## How to Test the App

1. Start the backend.
2. Start the frontend.
3. Open:

```text
http://localhost:5173
```

4. Login as Admin or Developer.
5. Go to:

```text
Execute → Create Pipeline
```

6. Upload a CSV or generate test data.
7. Continue to AI-assisted masking rule assignment.
8. Review AI-suggested masking rules.
9. Override rules if needed.
10. Run anonymization.
11. Review before/after output.
12. Download the masked CSV.
13. Check Dashboard, Data Inventory, Data Classification, Masking Rules, Job Monitor, and Data Preview pages.

---

## Sample CSV for Testing

Create a file called:

```text
sample_pii_data.csv
```

Use this content:

```csv
name,email,ssn,date_of_birth,customer_id,account_balance
Mohith Prasanna,mohith@example.com,123-45-6789,1998-04-12,CUST1001,25000
Ravi Kumar,ravi@example.com,987-65-4321,1995-09-20,CUST1002,18000
Anita Sharma,anita@example.com,456-78-9123,1999-01-15,CUST1003,32000
```

Expected AI suggestions:

```text
name → Fake Value
email → Fake Value
ssn → Partial Masking
date_of_birth → Date Shift
customer_id → Hash
account_balance → No Masking
```

---

## Common Commands

### Run Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Run Frontend

```bash
cd frontend
npm run dev
```

### Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Install Backend Dependencies

```bash
cd backend
source venv/bin/activate
pip install fastapi uvicorn python-multipart pandas faker
```

---

## Git Ignore Notes

The following should not be committed:

```text
backend/venv/
frontend/node_modules/
backend/data/uploads/
backend/data/generated/
backend/data/outputs/
.env files
logs
cache files
```

Recommended `.gitignore` entries:

```gitignore
# React / Node
frontend/node_modules/
frontend/dist/
frontend/.env
frontend/.env.local

# Python / FastAPI
backend/venv/
backend/__pycache__/
backend/*.pyc
backend/.env
backend/.env.local

# Generated / uploaded runtime data
backend/data/masked_output.csv
backend/data/uploads/
backend/data/outputs/
backend/data/generated/

# Cache files
.pytest_cache/
.mypy_cache/
.ruff_cache/
.cache/

# Mac / system files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

---

## Current Limitations

This is an MVP/demo project.

Current limitations:

- Uses in-memory metadata for jobs and datasets
- Job history disappears when the backend restarts
- Uses local CSV files instead of enterprise databases
- Uses local Pandas instead of Spark
- Uses rule-based AI-assisted detection instead of a real LLM or Presidio engine
- Authentication is demo-only and not production-secure
- Conditional transform rules are UI examples only
- No persistent rule storage yet
- No saved pipeline versioning yet

---

## Future Enhancements

Planned upgrades:

```text
Persistent metadata using SQLite/PostgreSQL
Backend rule management APIs
Saved pipeline configurations
Conditional rule execution engine
Multi-table batch anonymization
Workspace-level access control
Source connection management
Presidio-based PII detection
GenAI-assisted classification and rule recommendation
Databricks Jobs API integration
PySpark anonymization engine
Delta table output support
Production authentication and RBAC
Docker-based deployment
Cloud deployment
```

---

## Project Status

Current status:

```text
MVP working locally
Role-based login added
Enterprise menu added
Collapsible side navigation added
Dataset upload/generation working
Existing dataset selection working
AI-assisted rule suggestion working
User override supported
Anonymization execution working
Before/after preview working
Masked CSV download working
Dashboard working
Data Inventory page working
Data Classification page working
Masking Rules blueprint page added
Job Monitor working
```

---

## Suggested Demo Flow

Use this flow when demoing the MVP:

```text
1. Login as Admin
2. Open Dashboard
3. Go to Execute → Create Pipeline
4. Generate Customer Data
5. Continue to AI-assisted masking rules
6. Show AI suggested rules
7. Override one rule manually
8. Run anonymization job
9. Review before/after output
10. Download masked CSV
11. Open Data Inventory
12. Open Data Classification
13. Open Masking Rules
14. Open Job Monitor
15. Login as Developer to show limited access
```

---

## Notes for Teammates

First-time setup requires running backend and frontend separately.

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-multipart pandas faker
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```





  ┌─────────────────┬────────────┬───────────────────────────────────────┐
  │      Name       │    Type    │   Connection String (paste exactly)   │
  ├─────────────────┼────────────┼───────────────────────────────────────┤
  │ TEST_RETAIL_DB  │ SQL Server │ test-retail.tdm.local:1433/RetailDB   │
  ├─────────────────┼────────────┼───────────────────────────────────────┤
  │ TEST_FINANCE_DB │ Oracle     │ test-finance.tdm.local:1521/FinanceDB │
  ├─────────────────┼────────────┼───────────────────────────────────────┤
  │ TEST_HR_DB      │ Databricks │ test-hr-catalog.tdm.local/hr_schema   │
  └─────────────────┴────────────┴───────────────────────────────────────┘