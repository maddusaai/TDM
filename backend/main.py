from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import uuid
import os
import pandas as pd
import json
import zipfile
import re

from masking_engine import run_local_anonymization
from test_data_generator import generate_test_data
import schema_drift


app = FastAPI(title="TDM Anonymization MVP Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATASET_REGISTRY_FILE = os.path.join(DATA_DIR, "datasets_registry.json")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
OUTPUT_DIR = os.path.join(DATA_DIR, "outputs")
GENERATED_DIR = os.path.join(DATA_DIR, "generated")
RULES_DIR = os.path.join(DATA_DIR, "rules")
RULES_FILE = os.path.join(RULES_DIR, "admin_locked_rules.json")
SANDBOX_DIR = os.path.join(DATA_DIR, "sandboxes")
SANDBOX_FILE = os.path.join(SANDBOX_DIR, "sandboxes.json")
METADATA_VERSION_DIR = os.path.join(DATA_DIR, "metadata_versions")
METADATA_VERSION_FILE = os.path.join(METADATA_VERSION_DIR, "metadata_versions.json")
DRIFT_INBOX_DIR = os.path.join(DATA_DIR, "drift_inbox")
DRIFT_INBOX_FILE = os.path.join(DRIFT_INBOX_DIR, "drift_inbox.json")

os.makedirs(SANDBOX_DIR, exist_ok=True)
os.makedirs(METADATA_VERSION_DIR, exist_ok=True)
os.makedirs(DRIFT_INBOX_DIR, exist_ok=True)

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)
os.makedirs(RULES_DIR, exist_ok=True)

jobs = {}
datasets = {}

BACKEND_SESSION_ID = str(uuid.uuid4())

class LoginRequest(BaseModel):
    email: str
    password: str

class RunJobRequest(BaseModel):
    dataset_id: str
    masking_rules: dict
    user_role: str = "developer"

class UpdateLockedRuleRequest(BaseModel):
    column: str
    rule: str
    reason: str = ""
    developer_can_override: bool = False
    enabled: bool = True
    user_role: str = "developer"

class GenerateTestDataRequest(BaseModel):
    template: str
    row_count: int

class SourceTableSelection(BaseModel):
    table_name: str
    selected_columns: list[str]
    row_count: int = 100


class MultiDatasetRunItem(BaseModel):
    dataset_id: str
    masking_rules: dict


class RunMultipleJobsRequest(BaseModel):
    datasets: list[MultiDatasetRunItem]
    user_role: str = "developer"


class PreRunValidationDatasetItem(BaseModel):
    dataset_id: str
    masking_rules: dict = {}


class PreRunValidationRequest(BaseModel):
    datasets: list[PreRunValidationDatasetItem]
    user_role: str = "developer"


class SandboxCreateRequest(BaseModel):
    owner: str
    project_id: str
    target_environment: str = "DEV"
    source_system: str = "SQL Server PROD"
    source_database: str = "DDB"
    source_schema: str = "dbo"
    sandbox_schema: str | None = None
    selected_tables: list[str] = []


class SandboxTableUpdateRequest(BaseModel):
    selected_tables: list[str]


class MetadataVersionCreateRequest(BaseModel):
    sandbox_id: str
    source_metadata_database: str = "healthcare_catalog.patient_schema"
    selected_tables: list[str] = []
    version_label: str | None = None
    change_summary: str = "Initial metadata snapshot for project sandbox."


class MetadataDriftValidationRequest(BaseModel):
    drift_mode: str = "no_drift"  # no_drift, additive, breaking


class MetadataVersionSuccessorRequest(BaseModel):
    drift_mode: str = "additive"
    change_summary: str = "Created updated metadata version after schema drift review."


class DriftDetectRequest(BaseModel):
    sandbox_id: str


class DriftInboxApproveRequest(BaseModel):
    accepted_columns: list[str] = []
    new_column_rules: dict[str, str] = {}
    accept_removed: bool = False
    accept_type_changes: bool = False
    change_summary: str


class DriftInboxRejectRequest(BaseModel):
    reason: str


class GenerateFromSourceRequest(BaseModel):
    source: str
    database: str
    tables: list[SourceTableSelection]
    sandbox_id: str | None = None


def load_sandboxes():
    if not os.path.exists(SANDBOX_FILE):
        return {}

    with open(SANDBOX_FILE, "r") as file:
        return json.load(file)


def save_sandboxes(sandboxes):
    with open(SANDBOX_FILE, "w") as file:
        json.dump(sandboxes, file, indent=2)


def normalize_schema_name(value: str):
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9_]+", "_", value)
    value = re.sub(r"_+", "_", value)
    return value.strip("_")


def build_default_sandbox_schema(owner: str, project_id: str, target_environment: str):
    owner_part = normalize_schema_name(owner)
    project_part = normalize_schema_name(project_id)
    env_part = normalize_schema_name(target_environment)

    return f"{owner_part}_{project_part}_{env_part}_schema"


def load_metadata_versions():
    if not os.path.exists(METADATA_VERSION_FILE):
        return {}

    try:
        with open(METADATA_VERSION_FILE, "r") as file:
            return json.load(file)
    except json.JSONDecodeError:
        return {}


def save_metadata_versions(metadata_versions):
    with open(METADATA_VERSION_FILE, "w") as file:
        json.dump(metadata_versions, file, indent=2)


def load_drift_inbox():
    if not os.path.exists(DRIFT_INBOX_FILE):
        return {}
    try:
        with open(DRIFT_INBOX_FILE, "r") as file:
            return json.load(file)
    except json.JSONDecodeError:
        return {}


def save_drift_inbox(inbox):
    with open(DRIFT_INBOX_FILE, "w") as file:
        json.dump(inbox, file, indent=2)


def build_metadata_snapshot(source_metadata_database: str, selected_tables: list[str]):
    if source_metadata_database not in MOCK_DATABRICKS_METADATA:
        raise ValueError("Selected source metadata database not found.")

    if not selected_tables:
        raise ValueError("At least one table is required to create metadata version.")

    snapshot = {}

    for table_name in selected_tables:
        if table_name not in MOCK_DATABRICKS_METADATA[source_metadata_database]:
            raise ValueError(f"Table not found in source metadata: {table_name}")

        snapshot[table_name] = [
            {
                "name": column["name"],
                "type": column.get("type", "string"),
                "suggested_rule": suggest_rule_for_column(column["name"]),
            }
            for column in MOCK_DATABRICKS_METADATA[source_metadata_database][table_name]
        ]

    return snapshot


def simulate_current_metadata_snapshot(saved_snapshot: dict, drift_mode: str):
    current_snapshot = json.loads(json.dumps(saved_snapshot))

    if drift_mode == "no_drift":
        return current_snapshot

    if drift_mode == "additive":
        for table_name, columns in current_snapshot.items():
            existing_names = {column["name"] for column in columns}

            for new_column in [
                {"name": "new_source_system", "type": "string", "suggested_rule": "No Masking"},
                {"name": "new_ingestion_timestamp", "type": "timestamp", "suggested_rule": "No Masking"},
            ]:
                if new_column["name"] not in existing_names:
                    columns.append(new_column)

        return current_snapshot

    if drift_mode == "breaking":
        for table_name, columns in current_snapshot.items():
            if not columns:
                continue

            removed_column = columns[-1]
            current_snapshot[table_name] = columns[:-1]
            current_snapshot[table_name].append({
                "name": f"{removed_column['name']}_renamed",
                "type": removed_column.get("type", "string"),
                "suggested_rule": removed_column.get("suggested_rule", "No Masking"),
            })
            break

        return current_snapshot

    return current_snapshot


def compare_metadata_snapshots(saved_snapshot: dict, current_snapshot: dict):
    table_results = []
    blockers = []
    warnings = []

    saved_tables = set(saved_snapshot.keys())
    current_tables = set(current_snapshot.keys())

    removed_tables = sorted(list(saved_tables - current_tables))
    new_tables = sorted(list(current_tables - saved_tables))

    if removed_tables:
        blockers.append("One or more tables from the saved metadata version are missing in the current source metadata.")

    if new_tables:
        warnings.append("New tables are available in the source metadata. Existing pipelines can continue.")

    for table_name in sorted(saved_tables.union(current_tables)):
        saved_columns = saved_snapshot.get(table_name, [])
        current_columns = current_snapshot.get(table_name, [])

        saved_column_map = {column["name"]: column for column in saved_columns}
        current_column_map = {column["name"]: column for column in current_columns}

        saved_column_names = set(saved_column_map.keys())
        current_column_names = set(current_column_map.keys())

        missing_columns = sorted(list(saved_column_names - current_column_names))
        new_columns = sorted(list(current_column_names - saved_column_names))

        type_changes = []
        for column_name in sorted(saved_column_names.intersection(current_column_names)):
            saved_type = saved_column_map[column_name].get("type")
            current_type = current_column_map[column_name].get("type")

            if saved_type != current_type:
                type_changes.append({
                    "column": column_name,
                    "saved_type": saved_type,
                    "current_type": current_type,
                })

        possible_renames = []
        if missing_columns and new_columns:
            possible_renames = [
                {"missing_column": missing_columns[0], "possible_new_column": new_columns[0]}
            ]

        table_status = "PASSED"
        if missing_columns or type_changes or table_name in removed_tables:
            table_status = "BLOCKED"
        elif new_columns or table_name in new_tables:
            table_status = "WARNING"

        if missing_columns:
            blockers.append(f"{table_name}: saved metadata columns are missing or renamed.")

        if type_changes:
            blockers.append(f"{table_name}: column data types changed and require review.")

        if new_columns:
            warnings.append(f"{table_name}: new columns were added. Existing pipeline can continue.")

        table_results.append({
            "table_name": table_name,
            "status": table_status,
            "saved_column_count": len(saved_columns),
            "current_column_count": len(current_columns),
            "new_columns": new_columns,
            "missing_columns": missing_columns,
            "type_changes": type_changes,
            "possible_renames": possible_renames,
        })

    if blockers:
        overall_status = "BLOCKED"
        can_run = False
        drift_type = "BREAKING_DRIFT"
        summary = "Breaking schema drift detected. Existing metadata columns are missing, renamed, or structurally changed."
        mitigation = [
            "Stop execution for impacted pipeline version.",
            "Create a successor metadata version from the current source schema.",
            "Review missing or renamed columns and remap masking rules.",
            "Re-run validation before execution.",
        ]
    elif warnings:
        overall_status = "WARNING"
        can_run = True
        drift_type = "ADDITIVE_DRIFT"
        summary = "Only additive schema drift detected. New columns exist, but saved metadata columns are still present."
        mitigation = [
            "Allow existing pipeline to continue without intervention.",
            "Optionally create a new metadata version to include the new columns.",
            "Review masking rules for newly added columns before using them.",
        ]
    else:
        overall_status = "PASSED"
        can_run = True
        drift_type = "NO_DRIFT"
        summary = "Current source metadata matches the saved metadata version."
        mitigation = ["No action required. Pipeline can run."]

    return {
        "overall_status": overall_status,
        "can_run": can_run,
        "drift_type": drift_type,
        "summary": summary,
        "tables": table_results,
        "warnings": sorted(list(set(warnings))),
        "blockers": sorted(list(set(blockers))),
        "mitigation": mitigation,
    }


def get_next_metadata_version_label(metadata_versions, project_id=None, target_environment=None):
    existing_numbers = []

    for version in metadata_versions.values():
        if project_id and target_environment:
            if version.get("project_id") != project_id or version.get("target_environment") != target_environment:
                continue
        label = str(version.get("version_label", "")).upper().replace("V", "")
        if label.isdigit():
            existing_numbers.append(int(label))

    next_number = max(existing_numbers, default=0) + 1
    return f"V{next_number}"


def create_metadata_version_record(sandbox, source_metadata_database, selected_tables, change_summary, metadata_snapshot):
    metadata_versions = load_metadata_versions()

    version_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # Version labels are system-assigned and sequential PER workspace (project_id +
    # target_environment). ProjectA-DEV gets V1, V2, V3 independently of ProjectB-UAT.
    version = {
        "metadata_version_id": version_id,
        "version_label": get_next_metadata_version_label(metadata_versions, sandbox.get("project_id"), sandbox.get("target_environment")),
        "sandbox_id": sandbox["sandbox_id"],
        "sandbox_schema": sandbox.get("sandbox_schema"),
        "owner": sandbox.get("owner"),
        "project_id": sandbox.get("project_id"),
        "target_environment": sandbox.get("target_environment"),
        "source_system": sandbox.get("source_system"),
        "source_database": sandbox.get("source_database"),
        "source_schema": sandbox.get("source_schema"),
        "source_metadata_database": source_metadata_database,
        "selected_tables": selected_tables,
        "metadata_snapshot": metadata_snapshot,
        "table_count": len(selected_tables),
        "column_count": sum(len(columns) for columns in metadata_snapshot.values()),
        "status": "ACTIVE",
        "change_summary": change_summary,
        "created_at": now,
        "updated_at": now,
    }

    metadata_versions[version_id] = version
    save_metadata_versions(metadata_versions)

    sandboxes = load_sandboxes()
    if sandbox["sandbox_id"] in sandboxes:
        sandboxes[sandbox["sandbox_id"]]["active_metadata_version_id"] = version_id
        sandboxes[sandbox["sandbox_id"]]["active_metadata_version_label"] = version["version_label"]
        sandboxes[sandbox["sandbox_id"]]["updated_at"] = now
        save_sandboxes(sandboxes)

    return version


def load_dataset_registry():
    if not os.path.exists(DATASET_REGISTRY_FILE):
        return {}

    try:
        with open(DATASET_REGISTRY_FILE, "r") as file:
            return json.load(file)
    except json.JSONDecodeError:
        return {}


def save_dataset_registry(dataset_registry):
    with open(DATASET_REGISTRY_FILE, "w") as file:
        json.dump(dataset_registry, file, indent=2)


datasets.update(load_dataset_registry())

def suggest_rule_for_column(column_name):
    col = column_name.lower().strip()

    if col in [
        "name",
        "full_name",
        "firstname",
        "first_name",
        "lastname",
        "last_name",
        "employee_name",
        "patient_name",
    ]:
        return "Fake Value"

    if "email" in col:
        return "Fake Value"

    if col in ["phone", "phone_number", "mobile", "mobile_number", "contact_number"]:
        return "Fake Value"

    if col in ["ssn", "social_security_number", "social_security"]:
        return "Partial Masking"

    if col in ["dob", "date_of_birth", "birth_date"]:
        return "Date Shift"

    if col.endswith("_id") or col in [
        "id",
        "customer_id",
        "account_id",
        "member_id",
        "employee_id",
        "claim_id",
    ]:
        return "Hash"

    if "address" in col:
        return "Fake Value"

    return "No Masking"


def detect_columns_from_csv(file_path):
    df_preview = pd.read_csv(file_path, nrows=5)

    detected_columns = []

    for column in df_preview.columns:
        suggested_rule = suggest_rule_for_column(column)

        detected_columns.append({
        "name": column,
        "type": str(df_preview[column].dtype),
        "pii": suggested_rule != "No Masking",
        "ai_suggested_rule": suggested_rule,
        "rule": suggested_rule,
        "override_allowed": True,
    })

    return detected_columns

def apply_admin_locked_rules(dataset, masking_rules, user_role):
    final_rules = dict(masking_rules)
    enforced_rules = []

    if user_role == "admin":
        return final_rules, enforced_rules

    dataset_name = dataset.get("filename", "").lower()
    admin_locked_rules = load_admin_locked_rules()

    for locked_rule in admin_locked_rules:
        if not locked_rule.get("enabled", True):
            continue

        if locked_rule.get("developer_can_override", False):
            continue

        locked_column_name = locked_rule["column"].lower()
        table_contains = locked_rule.get("table_contains")

        table_match = table_contains is None or table_contains in dataset_name

        matching_column_key = None

        for rule_column in final_rules.keys():
            if rule_column.lower() == locked_column_name:
                matching_column_key = rule_column
                break

        if table_match and matching_column_key:
            original_rule = final_rules.get(matching_column_key)
            final_rules[matching_column_key] = locked_rule["rule"]

            enforced_rules.append({
                "column": matching_column_key,
                "original_rule": original_rule,
                "enforced_rule": locked_rule["rule"],
                "locked_by": locked_rule["locked_by"],
                "reason": locked_rule["reason"],
            })

    return final_rules, enforced_rules


def _as_validation_item_dict(item):
    if isinstance(item, dict):
        return item

    return {
        "dataset_id": item.dataset_id,
        "masking_rules": item.masking_rules,
    }


def validate_pre_run_internal(validation_items, user_role="developer"):
    checks = []
    warnings = []
    blockers = []
    selected_dataset_ids = []
    selected_sandbox_ids = set()
    selected_sandbox_schemas = set()
    selected_table_names = set()
    total_pii_columns = 0
    masked_pii_columns = 0
    unmasked_pii_columns = []
    admin_locked_matches = []

    items = [_as_validation_item_dict(item) for item in validation_items]

    if not items:
        return {
            "overall_status": "BLOCKED",
            "can_run": False,
            "summary": "No datasets selected for execution.",
            "checks": [
                {
                    "name": "Dataset Selection",
                    "status": "BLOCKED",
                    "message": "Please select at least one generated dataset before running.",
                    "details": [],
                }
            ],
            "metrics": {},
            "warnings": [],
            "blockers": ["No datasets selected for execution."],
        }

    # Dataset readiness and sandbox collection
    missing_dataset_ids = []
    missing_files = []
    datasets_without_sandbox = []

    for item in items:
        dataset_id = item.get("dataset_id")
        selected_dataset_ids.append(dataset_id)

        if dataset_id not in datasets:
            missing_dataset_ids.append(dataset_id)
            continue

        dataset = datasets[dataset_id]
        input_path = dataset.get("input_path")

        if not input_path or not os.path.exists(input_path):
            missing_files.append(dataset.get("filename") or dataset_id)

        sandbox_id = dataset.get("sandbox_id")
        sandbox_schema = dataset.get("sandbox_schema")
        table_name = dataset.get("table_name") or dataset.get("filename") or dataset_id

        if not sandbox_id:
            datasets_without_sandbox.append(table_name)
        else:
            selected_sandbox_ids.add(sandbox_id)

        if sandbox_schema:
            selected_sandbox_schemas.add(sandbox_schema)

        if table_name:
            selected_table_names.add(table_name)

    if missing_dataset_ids:
        blockers.append("Some selected datasets are no longer registered in the backend dataset registry.")
        checks.append({
            "name": "Dataset Registry",
            "status": "BLOCKED",
            "message": "One or more dataset IDs were not found.",
            "details": missing_dataset_ids,
        })
    else:
        checks.append({
            "name": "Dataset Registry",
            "status": "PASSED",
            "message": "All selected datasets are registered and available.",
            "details": selected_dataset_ids,
        })

    if missing_files:
        blockers.append("Some generated input files are missing from disk.")
        checks.append({
            "name": "Generated Data Files",
            "status": "BLOCKED",
            "message": "One or more generated input files are missing.",
            "details": missing_files,
        })
    else:
        checks.append({
            "name": "Generated Data Files",
            "status": "PASSED",
            "message": "Generated input files are available for execution.",
            "details": [],
        })

    if datasets_without_sandbox:
        blockers.append("Sandbox context is missing for one or more datasets.")
        checks.append({
            "name": "Sandbox Context",
            "status": "BLOCKED",
            "message": "Every pipeline execution must be scoped to an isolated sandbox.",
            "details": datasets_without_sandbox,
        })
    elif len(selected_sandbox_ids) > 1:
        blockers.append("Selected datasets belong to multiple sandboxes.")
        checks.append({
            "name": "Sandbox Context",
            "status": "BLOCKED",
            "message": "Please run one sandbox at a time to maintain isolation.",
            "details": sorted(list(selected_sandbox_schemas)),
        })
    else:
        checks.append({
            "name": "Sandbox Isolation",
            "status": "PASSED",
            "message": "All selected datasets are scoped to a single isolated sandbox.",
            "details": sorted(list(selected_sandbox_schemas)),
        })

    # Overlap awareness across other sandboxes
    overlap_details = []
    if selected_sandbox_ids:
        active_sandbox_id = next(iter(selected_sandbox_ids))
        sandboxes = load_sandboxes()

        for sandbox_id, sandbox in sandboxes.items():
            if sandbox_id == active_sandbox_id:
                continue

            other_tables = set(sandbox.get("selected_tables", []))
            overlap = sorted(list(selected_table_names.intersection(other_tables)))

            if overlap:
                overlap_details.append({
                    "sandbox_schema": sandbox.get("sandbox_schema"),
                    "owner": sandbox.get("owner"),
                    "project_id": sandbox.get("project_id"),
                    "overlapping_tables": overlap,
                })

    if overlap_details:
        checks.append({
            "name": "Cross-Sandbox Overlap",
            "status": "PASSED",
            "message": "Overlapping tables exist in other sandboxes, but changes are isolated by sandbox_id and sandbox_schema.",
            "details": overlap_details,
        })
    else:
        checks.append({
            "name": "Cross-Sandbox Overlap",
            "status": "PASSED",
            "message": "No overlapping tables found in other sandboxes for this run scope.",
            "details": [],
        })

    # Metadata version governance check
    if selected_sandbox_ids:
        active_sandbox_id = next(iter(selected_sandbox_ids))
        sandboxes = load_sandboxes()
        active_sandbox = sandboxes.get(active_sandbox_id, {})
        active_metadata_version_id = active_sandbox.get("active_metadata_version_id")
        active_metadata_version_label = active_sandbox.get("active_metadata_version_label")

        if not active_metadata_version_id:
            warnings.append("No active metadata version is linked to the selected sandbox.")
            checks.append({
                "name": "Source Metadata Version",
                "status": "WARNING",
                "message": "No active metadata version is linked. Execution can continue for MVP, but enterprise governance should create a metadata version first.",
                "details": [],
            })
        else:
            metadata_versions = load_metadata_versions()
            metadata_version = metadata_versions.get(active_metadata_version_id)

            if not metadata_version:
                blockers.append("Active metadata version reference is invalid or missing from registry.")
                checks.append({
                    "name": "Source Metadata Version",
                    "status": "BLOCKED",
                    "message": "The sandbox points to a metadata version that no longer exists.",
                    "details": [active_metadata_version_id],
                })
            else:
                checks.append({
                    "name": "Source Metadata Version",
                    "status": "PASSED",
                    "message": f"Active source metadata version {active_metadata_version_label or metadata_version.get('version_label')} is linked to this sandbox/project.",
                    "details": {
                        "metadata_version_id": active_metadata_version_id,
                        "version_label": metadata_version.get("version_label"),
                        "project_id": metadata_version.get("project_id"),
                        "table_count": metadata_version.get("table_count"),
                        "column_count": metadata_version.get("column_count"),
                    },
                })

    # Masking risk check
    admin_locked_rules = load_admin_locked_rules()

    for item in items:
        dataset_id = item.get("dataset_id")

        if dataset_id not in datasets:
            continue

        dataset = datasets[dataset_id]
        table_name = dataset.get("table_name") or dataset.get("filename") or dataset_id
        rules = item.get("masking_rules") or {}

        for column in dataset.get("columns", []):
            column_name = column.get("name")
            is_pii = bool(column.get("pii"))
            suggested_rule = column.get("ai_suggested_rule") or column.get("rule") or "No Masking"
            selected_rule = rules.get(column_name, column.get("rule") or "No Masking")

            if is_pii:
                total_pii_columns += 1

                if selected_rule and selected_rule != "No Masking":
                    masked_pii_columns += 1
                else:
                    unmasked_pii_columns.append({
                        "table_name": table_name,
                        "column": column_name,
                        "suggested_rule": suggested_rule,
                        "selected_rule": selected_rule,
                    })

            for locked_rule in admin_locked_rules:
                if not locked_rule.get("enabled", True):
                    continue

                if locked_rule.get("column", "").lower() == str(column_name).lower():
                    admin_locked_matches.append({
                        "table_name": table_name,
                        "column": column_name,
                        "enforced_rule": locked_rule.get("rule"),
                        "reason": locked_rule.get("reason"),
                    })

    if unmasked_pii_columns:
        blockers.append("Some PII columns are currently set to No Masking.")
        checks.append({
            "name": "PII Rule Coverage",
            "status": "BLOCKED",
            "message": "Sensitive columns require masking before execution.",
            "details": unmasked_pii_columns,
        })
    else:
        checks.append({
            "name": "PII Rule Coverage",
            "status": "PASSED",
            "message": "All detected PII columns have masking rules configured.",
            "details": [],
        })

    checks.append({
        "name": "Admin Locked Rules",
        "status": "PASSED",
        "message": f"{len(admin_locked_matches)} admin locked rule match(es) will be respected during execution.",
        "details": admin_locked_matches,
    })

    if blockers:
        overall_status = "BLOCKED"
        can_run = False
        summary = "Pre-run validation blocked execution. Please resolve the highlighted items before running."
    elif warnings:
        overall_status = "WARNING"
        can_run = True
        summary = "Pre-run validation completed with warnings. Execution is allowed."
    else:
        overall_status = "READY"
        can_run = True
        summary = "Pre-run validation passed. Pipeline is ready to execute inside the selected sandbox."

    return {
        "overall_status": overall_status,
        "can_run": can_run,
        "summary": summary,
        "checks": checks,
        "metrics": {
            "datasets_selected": len(items),
            "tables_selected": len(selected_table_names),
            "sandbox_count": len(selected_sandbox_ids),
            "pii_columns_detected": total_pii_columns,
            "pii_columns_masked": masked_pii_columns,
            "unmasked_pii_columns": len(unmasked_pii_columns),
            "admin_locked_rule_matches": len(admin_locked_matches),
            "overlap_sandboxes": len(overlap_details),
        },
        "warnings": warnings,
        "blockers": blockers,
    }


@app.post("/agents/pre-run-validation")
def pre_run_validation_agent(request: PreRunValidationRequest):
    validation = validate_pre_run_internal(
        validation_items=request.datasets,
        user_role=request.user_role,
    )

    return {
        "status": "SUCCESS",
        "agent_name": "Pre-Run Validation Agent",
        "validation": validation,
    }


@app.get("/metadata/versions")
def get_metadata_versions(sandbox_id: str | None = None):
    metadata_versions = load_metadata_versions()
    version_list = list(metadata_versions.values())

    if sandbox_id:
        version_list = [
            version for version in version_list
            if version.get("sandbox_id") == sandbox_id
        ]

    version_list = sorted(
        version_list,
        key=lambda version: version.get("created_at", ""),
        reverse=True,
    )

    return {
        "status": "SUCCESS",
        "count": len(version_list),
        "versions": version_list,
    }


@app.post("/metadata/versions/from-sandbox")
def create_metadata_version_from_sandbox(request: MetadataVersionCreateRequest):
    sandboxes = load_sandboxes()

    if request.sandbox_id not in sandboxes:
        return {
            "status": "FAILED",
            "message": "Sandbox not found. Please create or select a valid sandbox.",
        }

    sandbox = sandboxes[request.sandbox_id]
    selected_tables = request.selected_tables or sandbox.get("selected_tables", [])

    try:
        metadata_snapshot = build_metadata_snapshot(
            request.source_metadata_database,
            selected_tables,
        )

        version = create_metadata_version_record(
            sandbox=sandbox,
            source_metadata_database=request.source_metadata_database,
            selected_tables=selected_tables,
            change_summary=request.change_summary,
            metadata_snapshot=metadata_snapshot,
        )

        return {
            "status": "SUCCESS",
            "message": "Metadata version created and linked to sandbox successfully.",
            "version": version,
        }

    except Exception as e:
        return {
            "status": "FAILED",
            "message": str(e),
        }


@app.post("/metadata/versions/{version_id}/validate-drift")
def validate_metadata_version_drift(version_id: str, request: MetadataDriftValidationRequest):
    metadata_versions = load_metadata_versions()

    if version_id not in metadata_versions:
        return {
            "status": "NOT_FOUND",
            "message": "Metadata version not found.",
        }

    version = metadata_versions[version_id]
    saved_snapshot = version.get("metadata_snapshot", {})
    current_snapshot = simulate_current_metadata_snapshot(saved_snapshot, request.drift_mode)
    validation = compare_metadata_snapshots(saved_snapshot, current_snapshot)

    return {
        "status": "SUCCESS",
        "metadata_version_id": version_id,
        "version_label": version.get("version_label"),
        "project_id": version.get("project_id"),
        "sandbox_schema": version.get("sandbox_schema"),
        "drift_mode": request.drift_mode,
        "validation": validation,
    }


@app.post("/metadata/versions/{version_id}/create-successor")
def create_successor_metadata_version(version_id: str, request: MetadataVersionSuccessorRequest):
    metadata_versions = load_metadata_versions()

    if version_id not in metadata_versions:
        return {
            "status": "NOT_FOUND",
            "message": "Metadata version not found.",
        }

    previous_version = metadata_versions[version_id]
    sandbox_id = previous_version.get("sandbox_id")
    sandboxes = load_sandboxes()

    if sandbox_id not in sandboxes:
        return {
            "status": "FAILED",
            "message": "Linked sandbox not found for this metadata version.",
        }

    current_snapshot = simulate_current_metadata_snapshot(
        previous_version.get("metadata_snapshot", {}),
        request.drift_mode,
    )

    metadata_versions[version_id]["status"] = "SUPERSEDED"
    metadata_versions[version_id]["updated_at"] = datetime.now().isoformat()
    save_metadata_versions(metadata_versions)

    new_version = create_metadata_version_record(
        sandbox=sandboxes[sandbox_id],
        source_metadata_database=previous_version.get("source_metadata_database"),
        selected_tables=list(current_snapshot.keys()),
        change_summary=request.change_summary,
        metadata_snapshot=current_snapshot,
    )

    return {
        "status": "SUCCESS",
        "message": "Successor metadata version created. Previous version is preserved and marked as superseded.",
        "previous_version_id": version_id,
        "new_version": new_version,
    }


# ---------------------------------------------------------------------------
# Real, introspection-based schema drift (Tonic-style).
#
# Baseline = the dataset's sandbox's ACTIVE metadata version (table =
# dataset.table_name). For ad-hoc datasets with no active version, we fall back
# to a per-dataset baseline auto-captured on first scan. Breaking drift blocks
# execution; resolution creates a SUCCESSOR metadata version and sets it active.
# This is the authoritative gate; the legacy simulated `validate-drift` endpoint
# is left intact but is not used by execution.
# ---------------------------------------------------------------------------

SUPPORTED_MASKING_RULES = {"No Masking", "Hash", "Fake Value", "Partial Masking", "Date Shift"}


class SchemaDriftResolveRequest(BaseModel):
    # Masking rule to assign to each NEW column (required for every added column).
    new_column_rules: dict[str, str] = {}
    # Explicit acknowledgements for breaking changes.
    accept_removed: bool = False
    accept_type_changes: bool = False


def get_registered_schema(dataset):
    """Resolve the dataset's REGISTERED schema = its sandbox's active metadata
    version, table = dataset.table_name.

    Returns (baseline {col: normalized_type}, prior_rules {col: rule}, version dict)
    or (None, None, None) if the dataset isn't linked to an active metadata version
    (e.g. ad-hoc uploads) - callers then fall back to the auto-captured baseline.
    """
    sandbox_id = dataset.get("sandbox_id")
    table_name = dataset.get("table_name")
    if not sandbox_id or not table_name:
        return None, None, None

    sandbox = load_sandboxes().get(sandbox_id, {})
    version_id = sandbox.get("active_metadata_version_id")
    if not version_id:
        return None, None, None

    version = load_metadata_versions().get(version_id)
    if not version:
        return None, None, None

    table_columns = version.get("metadata_snapshot", {}).get(table_name)
    if table_columns is None:
        return None, None, None

    baseline = {c["name"]: schema_drift.normalize_type(c.get("type")) for c in table_columns}
    prior_rules = {c["name"]: c.get("suggested_rule", "No Masking") for c in table_columns}
    return baseline, prior_rules, version


def scan_dataset_schema_drift(dataset, persist_baseline=True):
    """Scan a dataset's live data file for drift.

    Preferred path: compare the live file against the dataset's REGISTERED schema
    (its active metadata version). Fallback (no linked version): compare against a
    per-dataset baseline auto-captured on first scan.
    """
    input_path = dataset.get("input_path")

    if not input_path or not os.path.exists(input_path):
        return {
            "drift_type": "UNKNOWN",
            "can_run": False,
            "summary": "Dataset source file was not found; cannot scan schema.",
            "blockers": ["Source data file is missing."],
            "warnings": [],
            "mitigation": ["Re-upload or regenerate the dataset."],
            "current_schema": {},
            "diff": {"added": [], "removed": [], "type_changed": [],
                     "added_detail": [], "removed_detail": []},
            "baseline_captured": False,
        }

    baseline, _prior_rules, version = get_registered_schema(dataset)

    if baseline is not None:
        result = schema_drift.compare(baseline, input_path)
        result["baseline_source"] = "metadata_version"
        result["registered_schema"] = baseline
        result["table_name"] = dataset.get("table_name")
        result["active_metadata_version_id"] = version.get("metadata_version_id")
        result["active_metadata_version_label"] = version.get("version_label")
        return result

    # Fallback: ad-hoc dataset with no active metadata version.
    result = schema_drift.scan(dataset.get("schema_baseline"), input_path)
    result["baseline_source"] = "auto"
    if result.get("baseline_captured") and persist_baseline:
        dataset["schema_baseline"] = result["current_schema"]
        datasets[dataset["dataset_id"]] = dataset
        save_dataset_registry(datasets)

    return result


def validate_schema_drift_gate(dataset_ids):
    """Execution gate: block the run if ANY selected dataset has breaking drift."""
    dataset_reports = []
    blocked_dataset_ids = []
    allowed = True

    for dataset_id in dataset_ids:
        dataset = datasets.get(dataset_id)

        if not dataset:
            allowed = False
            blocked_dataset_ids.append(dataset_id)
            dataset_reports.append({
                "dataset_id": dataset_id,
                "drift_type": "UNKNOWN",
                "can_run": False,
                "summary": "Dataset not found.",
            })
            continue

        result = scan_dataset_schema_drift(dataset)
        dataset_reports.append({
            "dataset_id": dataset_id,
            "dataset_name": dataset.get("filename"),
            "drift_type": result["drift_type"],
            "can_run": result["can_run"],
            "summary": result["summary"],
            "diff": result["diff"],
            "blockers": result["blockers"],
            "warnings": result["warnings"],
            "mitigation": result.get("mitigation", []),
        })

        if not result["can_run"]:
            allowed = False
            blocked_dataset_ids.append(dataset_id)

    return {
        "allowed": allowed,
        "status": "PASSED" if allowed else "BLOCKED",
        "message": (
            "Schema drift validation passed for all datasets."
            if allowed else
            "Breaking schema drift detected. Resolve the change and re-baseline before running."
        ),
        "datasets": dataset_reports,
        "blocked_dataset_ids": blocked_dataset_ids,
    }


def _validate_resolution_input(diff, request, dataset_id):
    """Shared gate: returns a FAILED/REQUIRES_INPUT dict if the resolution input is
    incomplete (changing nothing), or None if it's good to apply."""
    invalid_rules = {
        column: rule for column, rule in request.new_column_rules.items()
        if rule not in SUPPORTED_MASKING_RULES
    }
    if invalid_rules:
        return {
            "status": "FAILED",
            "message": "Unsupported masking rule(s) requested.",
            "invalid_rules": invalid_rules,
            "supported_rules": sorted(SUPPORTED_MASKING_RULES),
        }

    unresolved_new_columns = [c for c in diff["added"] if c not in request.new_column_rules]
    required_acknowledgements = []
    if diff["removed"] and not request.accept_removed:
        required_acknowledgements.append("accept_removed")
    if diff["type_changed"] and not request.accept_type_changes:
        required_acknowledgements.append("accept_type_changes")

    if unresolved_new_columns or required_acknowledgements:
        return {
            "status": "REQUIRES_INPUT",
            "message": "Resolution incomplete: assign a rule to every new column and accept any breaking changes.",
            "dataset_id": dataset_id,
            "diff": diff,
            "unresolved_new_columns": unresolved_new_columns,
            "suggested_rules": {c: suggest_rule_for_column(c) for c in diff["added"]},
            "required_acknowledgements": required_acknowledgements,
        }

    return None


@app.get("/datasets/{dataset_id}/schema-drift")
def get_dataset_schema_drift(dataset_id: str):
    """Detect real schema drift for one dataset by introspecting its live file."""
    dataset = datasets.get(dataset_id)
    if not dataset:
        return {"status": "NOT_FOUND", "message": "Dataset not found."}

    result = scan_dataset_schema_drift(dataset)
    return {
        "status": "SUCCESS",
        "dataset_id": dataset_id,
        "dataset_name": dataset.get("filename"),
        "baseline_schema": dataset.get("schema_baseline", {}),
        **result,
    }


@app.post("/datasets/{dataset_id}/schema-drift/resolve")
def resolve_dataset_schema_drift(dataset_id: str, request: SchemaDriftResolveRequest):
    """Resolve drift Tonic-style. Preferred path (dataset linked to an active
    metadata version): assign rules to new columns, accept breaking changes, then
    CREATE A SUCCESSOR metadata version capturing the live schema and set it active
    - so the registry is the source of truth and versioning is preserved. Fallback
    (ad-hoc dataset, no version): re-baseline the auto-captured snapshot.

    Returns REQUIRES_INPUT (changing nothing) if new columns are missing a rule or
    breaking changes haven't been accepted.
    """
    dataset = datasets.get(dataset_id)
    if not dataset:
        return {"status": "NOT_FOUND", "message": "Dataset not found."}

    input_path = dataset.get("input_path")
    if not input_path or not os.path.exists(input_path):
        return {"status": "FAILED", "message": "Dataset source file was not found."}

    baseline, prior_rules, version = get_registered_schema(dataset)

    # --- Fallback path: no active metadata version linked (ad-hoc dataset) --------
    if baseline is None:
        auto_baseline = dataset.get("schema_baseline") or {}
        current = schema_drift.introspect_schema(input_path)
        diff = schema_drift.diff_schema(auto_baseline, current)

        blocker = _validate_resolution_input(diff, request, dataset_id)
        if blocker:
            return blocker

        columns_by_name = {c["name"]: c for c in dataset.get("columns", [])}
        for removed_column in diff["removed"]:
            columns_by_name.pop(removed_column, None)
        for added_column in diff["added"]:
            rule = request.new_column_rules[added_column]
            columns_by_name[added_column] = {
                "name": added_column, "type": current[added_column],
                "pii": rule != "No Masking", "ai_suggested_rule": rule,
                "rule": rule, "override_allowed": True,
            }
        for change in diff["type_changed"]:
            if change["column"] in columns_by_name:
                columns_by_name[change["column"]]["type"] = current[change["column"]]

        dataset["columns"] = [columns_by_name[name] for name in current if name in columns_by_name]
        dataset["schema_baseline"] = current
        datasets[dataset_id] = dataset
        save_dataset_registry(datasets)

        result = scan_dataset_schema_drift(dataset)
        return {
            "status": "SUCCESS",
            "message": "Schema drift resolved and baseline updated (ad-hoc dataset, no metadata version).",
            "dataset_id": dataset_id,
            "resolved": {
                "new_columns": {c: request.new_column_rules[c] for c in diff["added"]},
                "removed_columns": diff["removed"],
                "type_changes": diff["type_changed"],
            },
            "columns": dataset["columns"],
            "drift_type": result["drift_type"],
            "can_run": result["can_run"],
        }

    # --- Registered path: resolve by creating a successor metadata version --------
    current = {c: schema_drift.normalize_type(t) for c, t in schema_drift.introspect_schema(input_path).items()}
    diff = schema_drift.diff_schema(baseline, current)

    blocker = _validate_resolution_input(diff, request, dataset_id)
    if blocker:
        return blocker

    table_name = dataset["table_name"]

    # Build the successor table from the live schema, carrying prior rules forward
    # for surviving columns and assigning the requested rule to new ones.
    new_table_columns = []
    for column in current:  # live file column order
        if column in baseline:
            rule = prior_rules.get(column) or "No Masking"
        else:
            rule = request.new_column_rules[column]
        new_table_columns.append({
            "name": column,
            "type": current[column],
            "suggested_rule": rule,
        })

    # Preserve the other tables of the version; replace only this dataset's table.
    new_snapshot = dict(version.get("metadata_snapshot", {}))
    new_snapshot[table_name] = new_table_columns

    sandbox = load_sandboxes().get(dataset["sandbox_id"], {})
    new_version = create_metadata_version_record(
        sandbox=sandbox,
        source_metadata_database=version.get("source_metadata_database"),
        selected_tables=list(new_snapshot.keys()),
        change_summary=f"Schema drift resolved for table '{table_name}' from live source schema.",
        metadata_snapshot=new_snapshot,
    )

    # Record the successor lineage and retire the predecessor.
    metadata_versions = load_metadata_versions()
    if version["metadata_version_id"] in metadata_versions:
        metadata_versions[version["metadata_version_id"]]["has_successor"] = True
    if new_version["metadata_version_id"] in metadata_versions:
        metadata_versions[new_version["metadata_version_id"]]["predecessor_metadata_version_id"] = version["metadata_version_id"]
        metadata_versions[new_version["metadata_version_id"]]["predecessor_version_label"] = version.get("version_label")
    save_metadata_versions(metadata_versions)

    # Mirror the resolved schema onto the dataset's column config.
    dataset["columns"] = [
        {
            "name": c["name"], "type": c["type"],
            "pii": c["suggested_rule"] != "No Masking",
            "ai_suggested_rule": c["suggested_rule"], "rule": c["suggested_rule"],
            "override_allowed": True,
        }
        for c in new_table_columns
    ]
    datasets[dataset_id] = dataset
    save_dataset_registry(datasets)

    result = scan_dataset_schema_drift(dataset)
    return {
        "status": "SUCCESS",
        "message": (
            f"Schema drift resolved. Created successor metadata version "
            f"{new_version.get('version_label')} and set it active."
        ),
        "dataset_id": dataset_id,
        "new_metadata_version_id": new_version.get("metadata_version_id"),
        "new_metadata_version_label": new_version.get("version_label"),
        "predecessor_version_label": version.get("version_label"),
        "resolved": {
            "new_columns": {c: request.new_column_rules[c] for c in diff["added"]},
            "removed_columns": diff["removed"],
            "type_changes": diff["type_changed"],
        },
        "columns": dataset["columns"],
        "drift_type": result["drift_type"],
        "can_run": result["can_run"],
    }


@app.post("/datasets/{dataset_id}/schema-drift/simulate-change")
def simulate_dataset_schema_change(dataset_id: str):
    """DEMO ONLY: introduce a REAL change into the dataset's source file so the
    drift detector has something to find (adds a column, drops the last column,
    and turns a date column numeric if present). Clear it with the resolve
    endpoint, or regenerate the dataset."""
    dataset = datasets.get(dataset_id)
    if not dataset:
        return {"status": "NOT_FOUND", "message": "Dataset not found."}

    input_path = dataset.get("input_path")
    if not input_path or not os.path.exists(input_path):
        return {"status": "FAILED", "message": "Dataset source file was not found."}

    df = pd.read_csv(input_path, dtype=str)
    changes = []

    if df.shape[1] > 1:
        dropped = df.columns[-1]
        df = df.drop(columns=[dropped])
        changes.append(f"dropped column '{dropped}'")

    new_column = "demo_drift_column"
    if new_column not in df.columns:
        df[new_column] = [f"demo_{i}" for i in range(len(df))]
        changes.append(f"added column '{new_column}'")

    df.to_csv(input_path, index=False)

    result = scan_dataset_schema_drift(dataset)
    return {
        "status": "SUCCESS",
        "message": "Demo source change applied: " + ", ".join(changes) + ".",
        "dataset_id": dataset_id,
        **result,
    }


# ---------------------------------------------------------------------------
# Drift Inbox — detect → review → approve/reject → version creation
# ---------------------------------------------------------------------------

@app.post("/drift-inbox/detect")
def detect_drift_for_inbox(request: DriftDetectRequest):
    sandboxes = load_sandboxes()
    if request.sandbox_id not in sandboxes:
        return {"status": "NOT_FOUND", "message": "Sandbox not found."}

    sandbox = sandboxes[request.sandbox_id]
    version_id = sandbox.get("active_metadata_version_id")
    if not version_id:
        return {"status": "FAILED", "message": "No active metadata version for this sandbox. Create one first."}

    metadata_versions = load_metadata_versions()
    version = metadata_versions.get(version_id)
    if not version:
        return {"status": "FAILED", "message": "Active metadata version record not found."}

    saved_snapshot = version.get("metadata_snapshot", {})
    source_metadata_database = version.get("source_metadata_database", "")
    selected_tables = version.get("selected_tables", [])

    # Build the "current" source schema from mock catalog (simulates re-scanning source)
    try:
        current_snapshot = build_metadata_snapshot(source_metadata_database, selected_tables)
    except Exception:
        return {"status": "FAILED", "message": "Could not read source schema for this sandbox."}

    # Flatten both snapshots to {col: type} for drift comparison (across all tables)
    saved_flat = {}
    for cols in saved_snapshot.values():
        for c in cols:
            saved_flat[c["name"]] = schema_drift.normalize_type(c.get("type", "string"))

    current_flat = {}
    for cols in current_snapshot.values():
        for c in cols:
            current_flat[c["name"]] = schema_drift.normalize_type(c.get("type", "string"))

    diff = schema_drift.diff_schema(saved_flat, current_flat)
    added = diff.get("added", [])
    removed = diff.get("removed", [])
    type_changed = diff.get("type_changed", [])

    if not added and not removed and not type_changed:
        return {
            "status": "NO_DRIFT",
            "message": f"Schema matches active version {version.get('version_label')}. No drift detected.",
            "sandbox_id": request.sandbox_id,
            "active_version_label": version.get("version_label"),
        }

    drift_type = "BREAKING_DRIFT" if (removed or type_changed) else "ADDITIVE_DRIFT"
    suggested_rules = {col: suggest_rule_for_column(col) for col in added}

    review_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    record = {
        "review_id": review_id,
        "sandbox_id": request.sandbox_id,
        "project_id": sandbox.get("project_id"),
        "target_environment": sandbox.get("target_environment"),
        "last_approved_version_id": version_id,
        "last_approved_version_label": version.get("version_label"),
        "drift_type": drift_type,
        "diff": {
            "added": added,
            "removed": removed,
            "type_changed": type_changed,
            "added_detail": [{"column": c, "type": current_flat.get(c, "string")} for c in added],
        },
        "current_schema": current_flat,
        "suggested_rules": suggested_rules,
        "status": "PENDING_REVIEW",
        "detected_at": now,
        "resolved_at": None,
        "change_summary": None,
        "reason": None,
    }

    inbox = load_drift_inbox()
    inbox[review_id] = record
    save_drift_inbox(inbox)

    return {"status": "PENDING_REVIEW", "review": record}


@app.get("/drift-inbox")
def get_drift_inbox(sandbox_id: str | None = None, status: str | None = None):
    inbox = load_drift_inbox()
    records = list(inbox.values())

    if sandbox_id:
        records = [r for r in records if r.get("sandbox_id") == sandbox_id]
    if status:
        records = [r for r in records if r.get("status") == status]

    records = sorted(records, key=lambda r: r.get("detected_at", ""), reverse=True)
    return {"status": "SUCCESS", "count": len(records), "reviews": records}


@app.post("/drift-inbox/{review_id}/approve")
def approve_drift_review(review_id: str, request: DriftInboxApproveRequest):
    if not request.change_summary or not request.change_summary.strip():
        return {"status": "FAILED", "message": "change_summary is required."}

    inbox = load_drift_inbox()
    if review_id not in inbox:
        return {"status": "NOT_FOUND", "message": "Drift review not found."}

    record = inbox[review_id]
    if record["status"] != "PENDING_REVIEW":
        return {"status": "FAILED", "message": f"Review is already {record['status']}."}

    diff = record.get("diff", {})
    removed = diff.get("removed", [])
    type_changed = diff.get("type_changed", [])

    # Validate breaking change acknowledgements
    if removed and not request.accept_removed:
        return {"status": "REQUIRES_INPUT", "message": "You must accept removed columns before approving."}
    if type_changed and not request.accept_type_changes:
        return {"status": "REQUIRES_INPUT", "message": "You must accept type changes before approving."}

    # Validate rules for each accepted column
    for col in request.accepted_columns:
        if col not in request.new_column_rules:
            return {"status": "REQUIRES_INPUT", "message": f"Missing masking rule for column '{col}'."}

    # Load the predecessor version snapshot
    metadata_versions = load_metadata_versions()
    prev_version = metadata_versions.get(record["last_approved_version_id"])
    if not prev_version:
        return {"status": "FAILED", "message": "Predecessor version not found."}

    # Build new snapshot: carry forward all existing columns, add accepted new columns
    new_snapshot = {}
    accepted_set = set(request.accepted_columns)
    added_set = set(diff.get("added", []))
    removed_set = set(removed) if request.accept_removed else set()

    for table_name, cols in prev_version.get("metadata_snapshot", {}).items():
        new_cols = []
        for c in cols:
            if c["name"] in removed_set:
                continue  # drop accepted-removed columns
            col_type = c.get("type", "string")
            # Apply type change if accepted
            if request.accept_type_changes:
                for tc in type_changed:
                    if tc.get("column") == c["name"]:
                        col_type = tc.get("to", col_type)
                        break
            new_cols.append({"name": c["name"], "type": col_type, "suggested_rule": c.get("suggested_rule", "No Masking")})

        # Add accepted new columns (only those user selected)
        for col in request.accepted_columns:
            if col in added_set:
                new_cols.append({
                    "name": col,
                    "type": record["current_schema"].get(col, "string"),
                    "suggested_rule": request.new_column_rules[col],
                })

        new_snapshot[table_name] = new_cols

    # Load sandbox and create successor version
    sandboxes = load_sandboxes()
    sandbox = sandboxes.get(record["sandbox_id"])
    if not sandbox:
        return {"status": "FAILED", "message": "Sandbox not found."}

    # Mark predecessor as superseded
    metadata_versions[record["last_approved_version_id"]]["status"] = "SUPERSEDED"
    metadata_versions[record["last_approved_version_id"]]["has_successor"] = True
    metadata_versions[record["last_approved_version_id"]]["updated_at"] = datetime.now().isoformat()
    save_metadata_versions(metadata_versions)

    new_version = create_metadata_version_record(
        sandbox=sandbox,
        source_metadata_database=prev_version.get("source_metadata_database"),
        selected_tables=list(new_snapshot.keys()),
        change_summary=request.change_summary.strip(),
        metadata_snapshot=new_snapshot,
    )

    # Record lineage on new version
    metadata_versions = load_metadata_versions()
    if new_version["metadata_version_id"] in metadata_versions:
        metadata_versions[new_version["metadata_version_id"]]["predecessor_metadata_version_id"] = record["last_approved_version_id"]
        metadata_versions[new_version["metadata_version_id"]]["predecessor_version_label"] = record["last_approved_version_label"]
        save_metadata_versions(metadata_versions)

    # Mark inbox record as approved
    now = datetime.now().isoformat()
    inbox[review_id]["status"] = "APPROVED"
    inbox[review_id]["resolved_at"] = now
    inbox[review_id]["change_summary"] = request.change_summary.strip()
    save_drift_inbox(inbox)

    return {
        "status": "SUCCESS",
        "message": f"Drift approved. Created successor version {new_version.get('version_label')}.",
        "new_version": new_version,
        "predecessor_version_label": record["last_approved_version_label"],
    }


@app.post("/drift-inbox/{review_id}/reject")
def reject_drift_review(review_id: str, request: DriftInboxRejectRequest):
    if not request.reason or not request.reason.strip():
        return {"status": "FAILED", "message": "reason is required."}

    inbox = load_drift_inbox()
    if review_id not in inbox:
        return {"status": "NOT_FOUND", "message": "Drift review not found."}

    record = inbox[review_id]
    if record["status"] != "PENDING_REVIEW":
        return {"status": "FAILED", "message": f"Review is already {record['status']}."}

    now = datetime.now().isoformat()
    inbox[review_id]["status"] = "REJECTED"
    inbox[review_id]["resolved_at"] = now
    inbox[review_id]["reason"] = request.reason.strip()
    save_drift_inbox(inbox)

    return {
        "status": "SUCCESS",
        "message": "Drift review rejected. Active metadata version remains unchanged.",
        "review": inbox[review_id],
    }


@app.get("/")
def health_check():
    return {
        "message": "TDM Anonymization Backend is running",
        "status": "healthy",
        "mode": "multi-dataset-test-data-generation-chatbot",
        "backend_session_id": BACKEND_SESSION_ID,
    }

@app.get("/admin-locked-rules")
def get_admin_locked_rules():
    return {
        "status": "SUCCESS",
        "rules": load_admin_locked_rules(),
    }


@app.put("/admin-locked-rules")
def update_admin_locked_rule(request: UpdateLockedRuleRequest):
    if request.user_role != "admin":
        return {
            "status": "FAILED",
            "message": "Only Admin users can create or update locked rules.",
        }

    rules = load_admin_locked_rules()

    updated = False

    for rule in rules:
        if rule["column"].lower() == request.column.lower():
            rule["rule"] = request.rule
            rule["reason"] = request.reason
            rule["developer_can_override"] = request.developer_can_override
            rule["enabled"] = request.enabled
            rule["locked_by"] = "TDM Admin"
            updated = True

    if not updated:
        rules.append({
            "table_contains": None,
            "column": request.column.lower(),
            "rule": request.rule,
            "locked_by": "TDM Admin",
            "reason": request.reason,
            "developer_can_override": request.developer_can_override,
            "enabled": request.enabled,
        })

    save_admin_locked_rules(rules)

    return {
        "status": "SUCCESS",
        "message": "Admin locked rule updated successfully.",
        "rules": rules,
    }

@app.delete("/admin-locked-rules/{column_name}")
def delete_admin_locked_rule(column_name: str, user_role: str = "developer"):
    if user_role != "admin":
        return {
            "status": "FAILED",
            "message": "Only Admin users can delete locked rules.",
        }

    rules = load_admin_locked_rules()

    updated_rules = [
        rule for rule in rules
        if rule["column"].lower() != column_name.lower()
    ]

    if len(updated_rules) == len(rules):
        return {
            "status": "FAILED",
            "message": f"No locked rule found for column: {column_name}",
            "rules": rules,
        }

    save_admin_locked_rules(updated_rules)

    return {
        "status": "SUCCESS",
        "message": f"Locked rule for column '{column_name}' deleted successfully.",
        "rules": updated_rules,
    }

@app.get("/sandboxes")
def get_sandboxes():
    sandboxes = load_sandboxes()

    return {
        "status": "SUCCESS",
        "sandboxes": list(sandboxes.values()),
    }


@app.post("/sandboxes")
def create_sandbox(request: SandboxCreateRequest):
    sandboxes = load_sandboxes()

    sandbox_id = str(uuid.uuid4())

    sandbox_schema = request.sandbox_schema or build_default_sandbox_schema(
        request.owner,
        request.project_id,
        request.target_environment,
    )

    sandbox = {
        "sandbox_id": sandbox_id,
        "sandbox_schema": sandbox_schema,
        "owner": request.owner,
        "project_id": request.project_id,
        "target_environment": request.target_environment,
        "source_system": request.source_system,
        "source_database": request.source_database,
        "source_schema": request.source_schema,
        "selected_tables": request.selected_tables,
        "status": "ACTIVE",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "isolation_status": "ISOLATED",
    }

    sandboxes[sandbox_id] = sandbox
    save_sandboxes(sandboxes)

    return {
        "status": "SUCCESS",
        "message": "Sandbox created successfully.",
        "sandbox": sandbox,
    }


@app.get("/sandboxes/{sandbox_id}")
def get_sandbox(sandbox_id: str):
    sandboxes = load_sandboxes()

    if sandbox_id not in sandboxes:
        return {
            "status": "NOT_FOUND",
            "message": "Sandbox not found.",
        }

    return {
        "status": "SUCCESS",
        "sandbox": sandboxes[sandbox_id],
    }


@app.put("/sandboxes/{sandbox_id}/tables")
def update_sandbox_tables(sandbox_id: str, request: SandboxTableUpdateRequest):
    sandboxes = load_sandboxes()

    if sandbox_id not in sandboxes:
        return {
            "status": "NOT_FOUND",
            "message": "Sandbox not found.",
        }

    sandboxes[sandbox_id]["selected_tables"] = request.selected_tables
    sandboxes[sandbox_id]["updated_at"] = datetime.now().isoformat()

    save_sandboxes(sandboxes)

    return {
        "status": "SUCCESS",
        "message": "Sandbox tables updated successfully.",
        "sandbox": sandboxes[sandbox_id],
    }


@app.delete("/sandboxes/{sandbox_id}/datasets/{dataset_id}")
def delete_sandbox_dataset(sandbox_id: str, dataset_id: str):
    sandboxes = load_sandboxes()

    if sandbox_id not in sandboxes:
        return {
            "status": "NOT_FOUND",
            "message": "Sandbox not found.",
        }

    if dataset_id not in datasets:
        return {
            "status": "NOT_FOUND",
            "message": "Generated dataset not found in the dataset registry. Regenerate or refresh the selected sandbox data.",
        }

    dataset = datasets[dataset_id]

    if dataset.get("sandbox_id") != sandbox_id:
        return {
            "status": "FAILED",
            "message": "This dataset does not belong to the selected sandbox.",
        }

    table_name = dataset.get("table_name")
    input_path = dataset.get("input_path")
    output_path = dataset.get("output_path")

    if input_path and os.path.exists(input_path):
        os.remove(input_path)

    if output_path and os.path.exists(output_path):
        os.remove(output_path)

    del datasets[dataset_id]
    save_dataset_registry(datasets)

    remaining_table_exists = any(
        existing_dataset.get("sandbox_id") == sandbox_id
        and existing_dataset.get("table_name") == table_name
        for existing_dataset in datasets.values()
    )

    if table_name and not remaining_table_exists:
        existing_tables = sandboxes[sandbox_id].get("selected_tables", [])
        sandboxes[sandbox_id]["selected_tables"] = [
            table for table in existing_tables if table != table_name
        ]
        sandboxes[sandbox_id]["updated_at"] = datetime.now().isoformat()
        save_sandboxes(sandboxes)

    return {
        "status": "SUCCESS",
        "message": f"Deleted generated table data for {table_name} from the selected sandbox.",
        "sandbox": sandboxes[sandbox_id],
    }

DEMO_USERS = {
    "admin@tdm.com": {
        "password": "Admin@123",
        "name": "TDM Admin",
        "role": "admin",
        "permissions": [
            "dashboard",
            "data_inventory",
            "sandbox_manager",
            "source_connections",
            "data_classification",
            "masking_rules",
            "subsetting_rules",
            "create_pipeline",
            "existing_pipelines",
            "job_monitor",
            "data_preview",
            "user_access",
            "configuration",
            "help",
        ],
    },
    "developer@tdm.com": {
        "password": "Dev@123",
        "name": "TDM Developer",
        "role": "developer",
        "permissions": [
            "dashboard",
            "data_inventory",
            "sandbox_manager",
            "data_classification",
            "masking_rules",
            "create_pipeline",
            "job_monitor",
            "data_preview",
            "help",
        ],
    },
}

DEFAULT_ADMIN_LOCKED_RULES = [
    {
        "table_contains": None,
        "column": "ssn",
        "rule": "Partial Masking",
        "locked_by": "TDM Admin",
        "reason": "",
        "developer_can_override": False,
        "enabled": True,
    }
]

MOCK_DATABRICKS_METADATA = {
    "healthcare_catalog.patient_schema": {
        "patient_records": [
            {"name": "patient_id", "type": "string"},
            {"name": "first_name", "type": "string"},
            {"name": "last_name", "type": "string"},
            {"name": "date_of_birth", "type": "date"},
            {"name": "ssn", "type": "string"},
            {"name": "email", "type": "string"},
            {"name": "phone_number", "type": "string"},
            {"name": "address", "type": "string"},
            {"name": "diagnosis_code", "type": "string"},
            {"name": "doctor_id", "type": "string"},
            {"name": "insurance_id", "type": "string"},
            {"name": "created_at", "type": "timestamp"},
        ],
        "appointments": [
            {"name": "appointment_id", "type": "string"},
            {"name": "patient_id", "type": "string"},
            {"name": "doctor_id", "type": "string"},
            {"name": "appointment_date", "type": "date"},
            {"name": "department", "type": "string"},
            {"name": "visit_reason", "type": "string"},
            {"name": "status", "type": "string"},
        ],
        "insurance_claims": [
            {"name": "claim_id", "type": "string"},
            {"name": "patient_id", "type": "string"},
            {"name": "insurance_id", "type": "string"},
            {"name": "claim_amount", "type": "decimal"},
            {"name": "claim_status", "type": "string"},
            {"name": "claim_date", "type": "date"},
            {"name": "diagnosis_code", "type": "string"},
        ],
    }
}

def generate_value_for_column(column_name, index):
    col = column_name.lower()

    first_names = ["Aarav", "Maya", "Rohan", "Anika", "Vikram", "Sara", "David", "Priya"]
    last_names = ["Sharma", "Patel", "Kumar", "Reddy", "Singh", "Thomas", "Mehta", "Brown"]
    departments = ["Cardiology", "Neurology", "Orthopedics", "Pediatrics", "General Medicine"]
    visit_reasons = ["Routine Checkup", "Follow-up", "Consultation", "Lab Review", "Annual Physical"]
    statuses = ["Scheduled", "Completed", "Cancelled", "Pending"]
    claim_statuses = ["Approved", "Pending", "Denied", "Under Review"]
    diagnosis_codes = ["E11.9", "I10", "J45.909", "M54.5", "R51.9", "K21.9"]

    if col in ["patient_id"]:
        return f"PAT{100000 + index}"

    if col in ["appointment_id"]:
        return f"APT{200000 + index}"

    if col in ["claim_id"]:
        return f"CLM{300000 + index}"

    if col in ["doctor_id"]:
        return f"DOC{500 + (index % 25)}"

    if col in ["insurance_id"]:
        return f"INS{800000 + index}"

    if col in ["first_name", "firstname"]:
        return first_names[index % len(first_names)]

    if col in ["last_name", "lastname"]:
        return last_names[index % len(last_names)]

    if col in ["full_name", "name", "patient_name", "employee_name"]:
        return f"{first_names[index % len(first_names)]} {last_names[index % len(last_names)]}"

    if "email" in col:
        return f"user{index}@example.com"

    if col in ["ssn", "social_security_number", "social_security"]:
        return f"{100 + (index % 899)}-{10 + (index % 89)}-{1000 + (index % 8999)}"

    if "phone" in col or "mobile" in col:
        return f"555-01{index % 100:02d}"

    if "address" in col:
        return f"{100 + index} Main Street"

    if col in ["date_of_birth", "dob", "birth_date"]:
        year = 1970 + (index % 35)
        month = 1 + (index % 12)
        day = 1 + (index % 28)
        return f"{year}-{month:02d}-{day:02d}"

    if "date" in col or col.endswith("_at"):
        month = 1 + (index % 12)
        day = 1 + (index % 28)
        return f"2025-{month:02d}-{day:02d}"

    if col == "department":
        return departments[index % len(departments)]

    if col == "visit_reason":
        return visit_reasons[index % len(visit_reasons)]

    if col == "status":
        return statuses[index % len(statuses)]

    if col == "claim_status":
        return claim_statuses[index % len(claim_statuses)]

    if col == "diagnosis_code":
        return diagnosis_codes[index % len(diagnosis_codes)]

    if "amount" in col or "balance" in col:
        return round(100 + (index * 37.45), 2)

    if col.endswith("_id") or col == "id":
        return f"ID{10000 + index}"

    return f"{column_name}_{index}"


def load_admin_locked_rules():
    if not os.path.exists(RULES_FILE):
        save_admin_locked_rules(DEFAULT_ADMIN_LOCKED_RULES)
        return DEFAULT_ADMIN_LOCKED_RULES

    with open(RULES_FILE, "r") as file:
        return json.load(file)


def save_admin_locked_rules(rules):
    with open(RULES_FILE, "w") as file:
        json.dump(rules, file, indent=2)

@app.post("/auth/login")
def login(request: LoginRequest):
    user = DEMO_USERS.get(request.email)

    if not user or user["password"] != request.password:
        return {
            "status": "FAILED",
            "message": "Invalid email or password.",
        }

    return {
        "status": "SUCCESS",
        "message": "Login successful.",
        "user": {
            "email": request.email,
            "name": user["name"],
            "role": user["role"],
            "permissions": user["permissions"],
        },
    }


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        return {
            "status": "FAILED",
            "message": "Only CSV files are supported for this MVP.",
        }

    dataset_id = str(uuid.uuid4())
    safe_filename = file.filename.replace(" ", "_")

    input_path = os.path.join(UPLOAD_DIR, f"{dataset_id}_{safe_filename}")
    output_path = os.path.join(OUTPUT_DIR, f"masked_{dataset_id}_{safe_filename}")

    with open(input_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    try:
        detected_columns = detect_columns_from_csv(input_path)
    except Exception as e:
        return {
            "status": "FAILED",
            "message": f"File uploaded but schema detection failed: {str(e)}",
        }

    datasets[dataset_id] = {
        "dataset_id": dataset_id,
        "filename": safe_filename,
        "source_type": "uploaded_csv",
        "input_path": input_path,
        "output_path": output_path,
        "uploaded_at": datetime.now().isoformat(),
        "columns": detected_columns,
    }

    save_dataset_registry(datasets)

    return {
        "status": "SUCCESS",
        "message": "File uploaded successfully",
        "dataset_id": dataset_id,
        "filename": safe_filename,
        "saved_path": input_path,
        "columns": detected_columns,
    }


@app.post("/generate-test-data")
def generate_test_dataset(request: GenerateTestDataRequest):
    try:
        dataset_id = str(uuid.uuid4())
        template = request.template.lower().strip()
        row_count = request.row_count

        generated_df = generate_test_data(template, row_count)

        filename = f"generated_{template}_{row_count}_rows.csv"
        input_path = os.path.join(GENERATED_DIR, f"{dataset_id}_{filename}")
        output_path = os.path.join(OUTPUT_DIR, f"masked_{dataset_id}_{filename}")

        generated_df.to_csv(input_path, index=False)

        detected_columns = detect_columns_from_csv(input_path)

        datasets[dataset_id] = {
            "dataset_id": dataset_id,
            "filename": filename,
            "source_type": "generated_test_data",
            "template": template,
            "row_count": row_count,
            "input_path": input_path,
            "output_path": output_path,
            "uploaded_at": datetime.now().isoformat(),
            "columns": detected_columns,
        }

        save_dataset_registry(datasets)

        return {
            "status": "SUCCESS",
            "message": "Test data generated successfully",
            "dataset_id": dataset_id,
            "filename": filename,
            "source_type": "generated_test_data",
            "template": template,
            "row_count": row_count,
            "columns": detected_columns,
        }

    except Exception as e:
        return {
            "status": "FAILED",
            "message": str(e),
        }

@app.post("/generate-test-data-from-source")
def generate_test_data_from_source(request: GenerateFromSourceRequest):
    try:
        if request.source.lower() != "databricks":
            return {
                "status": "FAILED",
                "message": "Only Databricks mock source is supported in this MVP.",
            }

        if request.database not in MOCK_DATABRICKS_METADATA:
            return {
                "status": "FAILED",
                "message": "Selected database not found.",
            }

        sandbox = None

        if request.sandbox_id:
            sandboxes = load_sandboxes()

            if request.sandbox_id not in sandboxes:
                return {
                    "status": "FAILED",
                    "message": "Invalid sandbox ID. Please select or create a valid sandbox.",
                }

            sandbox = sandboxes[request.sandbox_id]

        generated_datasets = []

        for table_selection in request.tables:
            table_name = table_selection.table_name
            selected_columns = table_selection.selected_columns
            table_row_count = table_selection.row_count

            if table_name not in MOCK_DATABRICKS_METADATA[request.database]:
                return {
                    "status": "FAILED",
                    "message": f"Table not found: {table_name}",
                }

            if not selected_columns:
                return {
                    "status": "FAILED",
                    "message": f"No columns selected for table: {table_name}",
                }

            if table_row_count <= 0:
                return {
                    "status": "FAILED",
                    "message": f"Row count must be greater than 0 for table: {table_name}",
                }

            source_columns = MOCK_DATABRICKS_METADATA[request.database][table_name]
            valid_column_names = [column["name"] for column in source_columns]

            invalid_columns = [
                column
                for column in selected_columns
                if column not in valid_column_names
            ]

            if invalid_columns:
                return {
                    "status": "FAILED",
                    "message": f"Invalid columns for {table_name}: {invalid_columns}",
                }

            generated_rows = []

            for index in range(1, table_row_count + 1):
                row = {}

                for column in selected_columns:
                    row[column] = generate_value_for_column(column, index)

                generated_rows.append(row)

            generated_df = pd.DataFrame(generated_rows)

            dataset_id = str(uuid.uuid4())
            filename = f"generated_{table_name}_{table_row_count}_rows.csv"

            input_path = os.path.join(GENERATED_DIR, f"{dataset_id}_{filename}")
            output_path = os.path.join(OUTPUT_DIR, f"masked_{dataset_id}_{filename}")

            generated_df.to_csv(input_path, index=False)

            detected_columns = detect_columns_from_csv(input_path)

            dataset_metadata = {
                "dataset_id": dataset_id,
                "filename": filename,
                "source_type": "databricks_schema_generated",
                "database": request.database,
                "table_name": table_name,
                "row_count": table_row_count,
                "input_path": input_path,
                "output_path": output_path,
                "uploaded_at": datetime.now().isoformat(),
                "columns": detected_columns,

                # Sandbox isolation metadata
                "sandbox_id": request.sandbox_id,
                "sandbox_schema": sandbox["sandbox_schema"] if sandbox else None,
                "sandbox_owner": sandbox["owner"] if sandbox else None,
                "project_id": sandbox["project_id"] if sandbox else None,
                "target_environment": sandbox["target_environment"] if sandbox else None,
                "isolation_status": "ISOLATED" if sandbox else "NO_SANDBOX",
            }

            datasets[dataset_id] = dataset_metadata

            generated_datasets.append({
                "dataset_id": dataset_id,
                "filename": filename,
                "source_type": "databricks_schema_generated",
                "database": request.database,
                "table_name": table_name,
                "row_count": table_row_count,
                "columns": detected_columns,

                # Sandbox isolation metadata returned to frontend
                "sandbox_id": request.sandbox_id,
                "sandbox_schema": sandbox["sandbox_schema"] if sandbox else None,
                "sandbox_owner": sandbox["owner"] if sandbox else None,
                "project_id": sandbox["project_id"] if sandbox else None,
                "target_environment": sandbox["target_environment"] if sandbox else None,
                "isolation_status": "ISOLATED" if sandbox else "NO_SANDBOX",
            })

        if request.sandbox_id and sandbox:
            sandboxes = load_sandboxes()

            existing_tables = set(
                sandboxes[request.sandbox_id].get("selected_tables", [])
            )

            generated_table_names = {
                dataset["table_name"] for dataset in generated_datasets
            }

            sandboxes[request.sandbox_id]["selected_tables"] = sorted(
                list(existing_tables.union(generated_table_names))
            )

            sandboxes[request.sandbox_id]["updated_at"] = datetime.now().isoformat()

            save_sandboxes(sandboxes)

        save_dataset_registry(datasets)
            
        return {
            "status": "SUCCESS",
            "message": f"Generated test data for {len(generated_datasets)} table(s).",
            "sandbox": sandbox,
            "datasets": generated_datasets,
        }

    except Exception as e:
        return {
            "status": "FAILED",
            "message": str(e),
        }

@app.get("/datasets")
def get_datasets():
    datasets.update(load_dataset_registry())
    dataset_list = list(datasets.values())

    dataset_list = sorted(
        dataset_list,
        key=lambda dataset: dataset.get("uploaded_at") or dataset.get("created_at") or "",
        reverse=True,
    )

    return {
        "count": len(dataset_list),
        "datasets": dataset_list,
    }

@app.get("/source-metadata/databricks/databases")
def get_databricks_databases():
    return {
        "status": "SUCCESS",
        "databases": list(MOCK_DATABRICKS_METADATA.keys()),
    }


@app.get("/source-metadata/databricks/tables")
def get_databricks_tables(database: str):
    if database not in MOCK_DATABRICKS_METADATA:
        return {
            "status": "FAILED",
            "message": "Database not found.",
            "tables": [],
        }

    return {
        "status": "SUCCESS",
        "database": database,
        "tables": list(MOCK_DATABRICKS_METADATA[database].keys()),
    }


@app.get("/source-metadata/databricks/columns")
def get_databricks_columns(database: str, table: str):
    if database not in MOCK_DATABRICKS_METADATA:
        return {
            "status": "FAILED",
            "message": "Database not found.",
            "columns": [],
        }

    if table not in MOCK_DATABRICKS_METADATA[database]:
        return {
            "status": "FAILED",
            "message": "Table not found.",
            "columns": [],
        }

    return {
        "status": "SUCCESS",
        "database": database,
        "table": table,
        "columns": MOCK_DATABRICKS_METADATA[database][table],
    }


@app.post("/jobs/run")
def run_job(request: RunJobRequest):
    if request.dataset_id not in datasets:
        return {
            "status": "FAILED",
            "message": "Dataset ID not found. Please upload, generate, or select a dataset first.",
        }

    validation = validate_pre_run_internal(
        validation_items=[{
            "dataset_id": request.dataset_id,
            "masking_rules": request.masking_rules,
        }],
        user_role=request.user_role,
    )

    if not validation["can_run"]:
        return {
            "status": "FAILED",
            "error_type": "PRE_RUN_VALIDATION_FAILED",
            "message": validation["summary"],
            "validation": validation,
        }

    schema_gate = validate_schema_drift_gate([request.dataset_id])
    if not schema_gate["allowed"]:
        return {
            "status": "FAILED",
            "error_type": "SCHEMA_DRIFT_BLOCKED",
            "message": schema_gate["message"],
            "schema_drift": schema_gate,
        }

    dataset = datasets[request.dataset_id]
    job_id = str(uuid.uuid4())
    job_started_at = datetime.now()

    final_masking_rules, enforced_rules = apply_admin_locked_rules(
        dataset,
        request.masking_rules,
        request.user_role,
    )

    preview, audit = run_local_anonymization(
        dataset["input_path"],
        dataset["output_path"],
        final_masking_rules,
    )

    job_ended_at = datetime.now()
    duration_seconds = round((job_ended_at - job_started_at).total_seconds(), 2)

    audit["admin_locked_rules_enforced"] = enforced_rules

    jobs[job_id] = {
        "job_id": job_id,
        "dataset_id": request.dataset_id,
        "dataset_name": dataset["filename"],
        "source_type": dataset.get("source_type", "unknown"),
        "user_role": request.user_role,
        "admin_locked_rules_enforced": enforced_rules,
        "status": "COMPLETED",
        "created_at": datetime.now().isoformat(),
        "job_started_at": job_started_at.isoformat(),
        "job_ended_at": job_ended_at.isoformat(),
        "duration_seconds": duration_seconds,
        "rows_processed": audit["total_rows_processed"],
        "tables_processed": audit["tables_processed"],
        "columns_masked": audit["pii_columns_masked"],
        "execution_mode": audit["execution_mode"],
        "output_target": audit["output_target"],
        "preview": preview,
        "audit": audit,
    }

    return {
        "message": "Anonymization job completed successfully",
        "job_id": job_id,
        "dataset_id": request.dataset_id,
        "dataset_name": dataset["filename"],
        "status": "COMPLETED",
        "admin_locked_rules_enforced": enforced_rules,
    }

@app.post("/jobs/run-multiple")
def run_multiple_jobs(request: RunMultipleJobsRequest):
    if not request.datasets:
        return {
            "status": "FAILED",
            "message": "No datasets provided for multi-table run.",
        }

    validation = validate_pre_run_internal(
        validation_items=[
            {
                "dataset_id": item.dataset_id,
                "masking_rules": item.masking_rules,
            }
            for item in request.datasets
        ],
        user_role=request.user_role,
    )

    if not validation["can_run"]:
        return {
            "status": "FAILED",
            "error_type": "PRE_RUN_VALIDATION_FAILED",
            "message": validation["summary"],
            "validation": validation,
        }

    schema_gate = validate_schema_drift_gate([item.dataset_id for item in request.datasets])
    if not schema_gate["allowed"]:
        return {
            "status": "FAILED",
            "error_type": "SCHEMA_DRIFT_BLOCKED",
            "message": schema_gate["message"],
            "schema_drift": schema_gate,
        }

    job_id = str(uuid.uuid4())
    job_started_at = datetime.now()

    child_jobs = []
    combined_before_preview = []
    combined_after_preview = []
    total_rows_processed = 0
    total_columns_masked = 0
    all_rules_applied = []
    all_enforced_rules = []
    output_files = []

    for item in request.datasets:
        if item.dataset_id not in datasets:
            return {
                "status": "FAILED",
                "message": f"Dataset ID not found: {item.dataset_id}",
            }

        dataset = datasets[item.dataset_id]

        final_masking_rules, enforced_rules = apply_admin_locked_rules(
            dataset,
            item.masking_rules,
            request.user_role,
        )

        preview, audit = run_local_anonymization(
            dataset["input_path"],
            dataset["output_path"],
            final_masking_rules,
        )

        table_name = dataset.get("table_name") or dataset.get("filename")

        before_rows = preview.get("before", [])
        after_rows = preview.get("after", [])

        for row in before_rows:
            combined_before_preview.append({
                "_table": table_name,
                **row,
            })

        for row in after_rows:
            combined_after_preview.append({
                "_table": table_name,
                **row,
            })

        total_rows_processed += audit["total_rows_processed"]
        total_columns_masked += audit["pii_columns_masked"]
        all_rules_applied.extend(audit.get("rules_applied", []))
        all_enforced_rules.extend(enforced_rules)
        output_files.append(dataset["output_path"])

        child_jobs.append({
            "dataset_id": item.dataset_id,
            "dataset_name": dataset["filename"],
            "table_name": table_name,
            "source_type": dataset.get("source_type", "unknown"),
            "rows_processed": audit["total_rows_processed"],
            "columns_masked": audit["pii_columns_masked"],
            "output_target": dataset["output_path"],
            "admin_locked_rules_enforced": enforced_rules,
        })

    job_ended_at = datetime.now()
    duration_seconds = round((job_ended_at - job_started_at).total_seconds(), 2)

    jobs[job_id] = {
        "job_id": job_id,
        "dataset_id": "MULTI_TABLE",
        "dataset_name": f"{len(child_jobs)} tables",
        "source_type": "multi_table_databricks_schema_generated",
        "user_role": request.user_role,
        "admin_locked_rules_enforced": all_enforced_rules,
        "status": "COMPLETED",
        "created_at": job_started_at.isoformat(),
        "job_started_at": job_started_at.isoformat(),
        "job_ended_at": job_ended_at.isoformat(),
        "duration_seconds": duration_seconds,
        "rows_processed": total_rows_processed,
        "tables_processed": len(child_jobs),
        "columns_masked": total_columns_masked,
        "execution_mode": "Databricks Jobs API orchestration",
        "output_target": "MULTI_TABLE_OUTPUT",
        "output_files": output_files,
        "child_jobs": child_jobs,
        "preview": {
            "before": combined_before_preview[:20],
            "after": combined_after_preview[:20],
        },
        "audit": {
            "total_rows_processed": total_rows_processed,
            "tables_processed": len(child_jobs),
            "pii_columns_masked": total_columns_masked,
            "rules_applied": sorted(list(set(all_rules_applied))),
            "output_target": "MULTI_TABLE_OUTPUT",
            "run_status": "Success",
            "execution_mode": "Databricks Jobs API orchestration",
            "admin_locked_rules_enforced": all_enforced_rules,
            "child_jobs": child_jobs,
        },
    }

    return {
        "status": "COMPLETED",
        "message": "Multi-table anonymization job completed successfully",
        "job_id": job_id,
        "tables_processed": len(child_jobs),
        "rows_processed": total_rows_processed,
        "columns_masked": total_columns_masked,
    }

@app.get("/jobs/{job_id}/status")
def get_job_status(job_id: str):
    if job_id not in jobs:
        return {
            "job_id": job_id,
            "status": "NOT_FOUND",
            "message": "Job ID not found",
        }

    job = jobs[job_id]

    return {
        "job_id": job["job_id"],
        "dataset_id": job.get("dataset_id"),
        "dataset_name": job.get("dataset_name"),
        "source_type": job.get("source_type"),
        "status": job["status"],
        "created_at": job["created_at"],
        "job_started_at": job.get("job_started_at"),
        "job_ended_at": job.get("job_ended_at"),
        "duration_seconds": job.get("duration_seconds"),
        "rows_processed": job["rows_processed"],
        "tables_processed": job["tables_processed"],
        "columns_masked": job["columns_masked"],
        "execution_mode": job["execution_mode"],
        "output_target": job["output_target"],
    }


@app.get("/jobs/{job_id}/preview")
def get_job_preview(job_id: str):
    if job_id not in jobs:
        return {
            "job_id": job_id,
            "status": "NOT_FOUND",
            "message": "Job ID not found",
        }

    return {
        "job_id": job_id,
        "before": jobs[job_id]["preview"]["before"],
        "after": jobs[job_id]["preview"]["after"],
    }


@app.get("/jobs/{job_id}/audit")
def get_job_audit(job_id: str):
    if job_id not in jobs:
        return {
            "job_id": job_id,
            "status": "NOT_FOUND",
            "message": "Job ID not found",
        }

    return {
        "job_id": job_id,
        "audit": jobs[job_id]["audit"],
    }


@app.get("/jobs/history")
def get_job_history():
    history = []

    for job_id, job in jobs.items():
        history.append({
            "job_id": job["job_id"],
            "dataset_id": job.get("dataset_id"),
            "dataset_name": job.get("dataset_name"),
            "source_type": job.get("source_type"),
            "status": job["status"],
            "created_at": job["created_at"],
            "rows_processed": job["rows_processed"],
            "tables_processed": job["tables_processed"],
            "columns_masked": job["columns_masked"],
            "execution_mode": job["execution_mode"],
            "output_target": job["output_target"],
        })

    history = sorted(history, key=lambda job: job["created_at"], reverse=True)

    return {
        "count": len(history),
        "jobs": history,
    }


@app.get("/download/masked-output/{job_id}")
def download_masked_output(job_id: str):
    if job_id not in jobs:
        return {
            "status": "NOT_FOUND",
            "message": "Job ID not found.",
        }

    job = jobs[job_id]

    if job.get("output_files"):
        zip_path = os.path.join(OUTPUT_DIR, f"masked_outputs_{job_id}.zip")

        with zipfile.ZipFile(zip_path, "w") as zip_file:
            for output_file in job["output_files"]:
                if os.path.exists(output_file):
                    zip_file.write(output_file, arcname=os.path.basename(output_file))

        return FileResponse(
            path=zip_path,
            filename=f"masked_outputs_{job_id}.zip",
            media_type="application/zip",
        )

    output_path = job["output_target"]

    if not os.path.exists(output_path):
        return {
            "status": "NOT_FOUND",
            "message": "Masked output file not found. Please run an anonymization job first.",
        }

    dataset_name = job.get("dataset_name", "output.csv")

    return FileResponse(
        path=output_path,
        filename=f"masked_{dataset_name}",
        media_type="text/csv",
    )

