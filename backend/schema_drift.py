"""
schema_drift.py - Real, introspection-based schema drift detection.

Tonic-style: we keep a baseline schema snapshot for a dataset and, before a run,
re-introspect the LIVE data file and compare. Drift is detected from the actual
file - added/removed columns and changed column types - not simulated.

Classification:
  - NO_DRIFT       : live schema matches the baseline.
  - ADDITIVE_DRIFT : only new columns appeared (run can proceed; new columns are
                     surfaced because they are not yet covered by masking rules).
  - BREAKING_DRIFT : a baseline column is missing/renamed, or a column's type
                     changed. Execution is blocked until the baseline is updated.

Type inference is value-based (not pandas' object dtype), so the SAME function
produces both the baseline and the current schema - that symmetry is what keeps a
freshly-baselined dataset at NO_DRIFT instead of falsely flagging string-vs-date.
"""

import re

import pandas as pd


LOGICAL_TYPES = ("boolean", "integer", "float", "date", "datetime", "string")

# Maps both Databricks-catalog types (used by the metadata registry) and our own
# inferred types onto one shared vocabulary, so a registered baseline ("string",
# "date") and a freshly introspected file compare apples-to-apples.
_TYPE_ALIASES = {
    "str": "string", "string": "string", "text": "string", "varchar": "string", "char": "string",
    "int": "integer", "integer": "integer", "bigint": "integer", "long": "integer", "smallint": "integer",
    "float": "float", "double": "float", "decimal": "float", "numeric": "float", "real": "float",
    "bool": "boolean", "boolean": "boolean",
    "date": "date",
    "datetime": "datetime", "timestamp": "datetime",
}


def normalize_type(value):
    """Normalize a catalog/inferred type to the shared logical vocabulary."""
    if not value:
        return "string"
    key = str(value).strip().lower()
    return _TYPE_ALIASES.get(key, key)


# Types within the same family are treated as compatible, so we don't flag drift
# when a catalog "timestamp" holds date-only values, or a "decimal" holds whole
# numbers. Only cross-family changes (e.g. date -> integer) count as a type change.
_TYPE_FAMILY = {
    "date": "temporal", "datetime": "temporal",
    "integer": "numeric", "float": "numeric",
    "string": "string", "boolean": "boolean",
}


def _type_family(logical_type):
    return _TYPE_FAMILY.get(logical_type, logical_type)


def types_compatible(left, right):
    return _type_family(normalize_type(left)) == _type_family(normalize_type(right))


# How many non-null values to sample per column when inferring its type.
_SAMPLE_SIZE = 500

_INT_RE = re.compile(r"^[+-]?\d+$")
_DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y")
_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
    "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M",
)


def _matches_any(value, formats):
    from datetime import datetime
    for fmt in formats:
        try:
            datetime.strptime(value, fmt)
            return True
        except ValueError:
            continue
    return False


def _is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False


def _infer_column_type(series):
    """Infer a logical type from a column's actual values."""
    values = [
        str(v).strip()
        for v in series.dropna().tolist()[:_SAMPLE_SIZE]
        if str(v).strip() != ""
    ]
    if not values:
        return "string"

    if {v.lower() for v in values} <= {"true", "false"}:
        return "boolean"

    if all(_INT_RE.match(v) for v in values):
        return "integer"

    if all(_is_float(v) for v in values):
        return "float"

    if all(_matches_any(v, _DATE_FORMATS) for v in values):
        return "date"

    if all(_matches_any(v, _DATETIME_FORMATS) for v in values):
        return "datetime"

    return "string"


def introspect_schema(csv_path):
    """Return {column_name: logical_type} for the live data file."""
    # Read as strings so we infer types from values ourselves (consistently for
    # both baseline and current scans).
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=True)
    return {column: _infer_column_type(df[column]) for column in df.columns}


def diff_schema(baseline, current):
    """Structured diff of two {column: type} schemas."""
    baseline_columns = set(baseline)
    current_columns = set(current)

    added = sorted(current_columns - baseline_columns)
    removed = sorted(baseline_columns - current_columns)
    type_changed = [
        {"column": column, "from": baseline[column], "to": current[column]}
        for column in sorted(baseline_columns & current_columns)
        if not types_compatible(baseline[column], current[column])
    ]

    return {
        "added": added,
        "removed": removed,
        "type_changed": type_changed,
        "added_detail": [{"column": c, "type": current[c]} for c in added],
        "removed_detail": [{"column": c, "type": baseline[c]} for c in removed],
    }


def classify_drift(diff):
    """Turn a diff into a drift type + gating decision."""
    has_breaking = bool(diff["removed"] or diff["type_changed"])
    has_additive = bool(diff["added"])

    blockers = []
    warnings = []

    if diff["removed"]:
        blockers.append(
            "Baseline columns are missing from the current source: "
            + ", ".join(diff["removed"])
        )
    for change in diff["type_changed"]:
        blockers.append(
            f"Column '{change['column']}' changed type "
            f"({change['from']} -> {change['to']})."
        )
    if diff["added"]:
        warnings.append(
            "New columns appeared and are not yet covered by masking rules: "
            + ", ".join(diff["added"])
        )

    if has_breaking:
        return {
            "drift_type": "BREAKING_DRIFT",
            "can_run": False,
            "summary": "Breaking schema drift detected: columns were removed, renamed, or changed type.",
            "blockers": blockers,
            "warnings": warnings,
            "mitigation": [
                "Stop execution for this dataset.",
                "Review removed/renamed columns and remap masking rules.",
                "Accept the new schema as a fresh baseline once remapped.",
                "Re-scan before running.",
            ],
        }

    if has_additive:
        return {
            "drift_type": "ADDITIVE_DRIFT",
            "can_run": True,
            "summary": "Additive schema drift detected: new columns appeared. Existing rules still apply.",
            "blockers": [],
            "warnings": warnings,
            "mitigation": [
                "Run can proceed; existing baseline columns are intact.",
                "Assign masking rules to the new columns and re-baseline when ready.",
            ],
        }

    return {
        "drift_type": "NO_DRIFT",
        "can_run": True,
        "summary": "Live schema matches the baseline. No drift.",
        "blockers": [],
        "warnings": [],
        "mitigation": ["No action required."],
    }


def compare(baseline, csv_path):
    """Compare a (normalized) baseline schema against the live file's schema.

    Unlike scan(), there is no baseline-capture branch: the baseline here is the
    registered schema (e.g. from an active metadata version), so a missing match
    is real drift, not a first run.
    """
    current_schema = {
        column: normalize_type(logical_type)
        for column, logical_type in introspect_schema(csv_path).items()
    }
    diff = diff_schema(baseline, current_schema)
    return {
        "baseline_captured": False,
        "current_schema": current_schema,
        "diff": diff,
        **classify_drift(diff),
    }


def scan(baseline, csv_path):
    """Introspect the live file and compare against a baseline schema.

    Returns the current schema, the diff, and the classification. Pass
    baseline=None for the first scan (caller should then persist current_schema
    as the new baseline; the result is reported as NO_DRIFT).
    """
    current_schema = introspect_schema(csv_path)

    if not baseline:
        result = classify_drift({"added": [], "removed": [], "type_changed": [],
                                 "added_detail": [], "removed_detail": []})
        result["summary"] = "Baseline captured from the current source schema."
        return {
            "baseline_captured": True,
            "current_schema": current_schema,
            "diff": {"added": [], "removed": [], "type_changed": [],
                     "added_detail": [], "removed_detail": []},
            **result,
        }

    diff = diff_schema(baseline, current_schema)
    return {
        "baseline_captured": False,
        "current_schema": current_schema,
        "diff": diff,
        **classify_drift(diff),
    }
