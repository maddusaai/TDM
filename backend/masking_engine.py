import hashlib
import hmac
import os
from datetime import datetime, timedelta

import pandas as pd
from faker import Faker


# --- Determinism ------------------------------------------------------------
# Every transform below is a pure function of (secret, input value). The same
# input always maps to the same masked output - across cells, columns, tables,
# and re-runs - which is what preserves referential integrity WITHOUT storing a
# mapping table: a value used as a join key in two tables masks identically in
# both. Rotate by changing the secret; keep it stable within a run.
MASKING_SECRET = os.environ.get(
    "TDM_MASKING_SECRET", "tdm-demo-masking-secret-v1"
).encode()

# Trailing characters Partial Masking leaves visible (e.g. last 2 of an SSN).
# Everything before the tail is masked, so leading digits are never revealed.
PARTIAL_REVEAL = 2

# Hash token length in hex chars. 16 hex = 64 bits => negligible collision risk
# at demo scale, while staying short enough to read. (Old code used 8 = 32 bits.)
HASH_LENGTH = 16

# Date formats we recognize. The masked date is re-emitted in the SAME format it
# came in, so the column stays format-valid downstream.
DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y"]


def _digest(value):
    """Deterministic keyed (HMAC-SHA256) hex digest of a value."""
    return hmac.new(MASKING_SECRET, str(value).encode(), hashlib.sha256).hexdigest()


def _global_date_offset_days():
    """A single offset, derived from the secret, applied to every date.

    Using one constant offset (rather than a random per-cell one) means the gap
    between any two dates is preserved exactly - ages, durations, and event
    ordering survive - and a given date always shifts to the same masked date.
    """
    raw = int(hashlib.sha256(MASKING_SECRET + b"date-offset").hexdigest(), 16)
    return (raw % 681) + 30  # 30..710 days, always positive and non-zero


def _seeded_faker(value):
    """A Faker seeded from the value, so the same input yields the same fake."""
    faker = Faker()
    faker.seed_instance(int(_digest(value), 16) % (2 ** 32))
    return faker


def hash_value(value):
    """Deterministic, keyed, low-collision token. Same input -> same token
    everywhere, so hashed identifiers stay joinable across tables."""
    if pd.isna(value):
        return value

    return _digest(value)[:HASH_LENGTH]


def partial_mask(value, reveal=PARTIAL_REVEAL):
    """Mask all alphanumerics except the last `reveal`, preserving separators.

    e.g. "123-45-6789" -> "***-**-**89". Leading characters are never exposed,
    and the dash/slash layout is kept so the value still looks well-formed.
    """
    if pd.isna(value):
        return value

    text = str(value)
    alnum_positions = [i for i, ch in enumerate(text) if ch.isalnum()]

    if len(alnum_positions) <= reveal:
        keep = set()  # too short to safely reveal anything - mask all alphanumerics
    else:
        keep = set(alnum_positions[-reveal:])

    return "".join(
        "*" if (ch.isalnum() and i not in keep) else ch
        for i, ch in enumerate(text)
    )


def shift_date(value, shift_days=None):
    """Shift a date by a fixed, deterministic offset, keeping its input format.

    Pass `shift_days` to request an explicit offset (e.g. 90); otherwise a stable
    secret-derived offset is used. Unrecognized values are returned unchanged.
    """
    if pd.isna(value):
        return value

    text = str(value).strip()
    offset = _global_date_offset_days() if shift_days is None else int(shift_days)

    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(text, fmt)
        except ValueError:
            continue
        return (parsed + timedelta(days=offset)).strftime(fmt)

    return value


# Column-name hints -> the Faker provider that best preserves that field's shape.
# Checked in order; first substring match wins. The value itself still overrides
# these for unambiguous types (email/SSN/phone/date) detected below.
_COLUMN_FAKERS = [
    (("first_name", "firstname", "given_name", "fname"), "first_name"),
    (("last_name", "lastname", "surname", "family_name", "lname"), "last_name"),
    (("full_name", "fullname"), "name"),
    (("street", "address", "addr"), "street_address"),
    (("city", "town"), "city"),
    (("state", "province"), "state"),
    (("zip", "postal", "postcode"), "postcode"),
    (("country",), "country"),
    (("company", "employer", "organization", "organisation"), "company"),
    (("job", "title", "occupation", "role"), "job"),
    (("name",), "name"),
]


def _faker_for_column(faker, column_name):
    """Pick a Faker provider from the column name; None if no hint matches."""
    if not column_name:
        return None
    lowered = str(column_name).lower()
    for keywords, provider in _COLUMN_FAKERS:
        if any(keyword in lowered for keyword in keywords):
            return getattr(faker, provider)
    return None


def fake_value(value, column_name=None):
    """Replace with a realistic fake of the SAME kind (email/SSN/phone/date/name).

    The fake is derived deterministically from the input, so the same value maps
    to the same fake everywhere - referential integrity is preserved. The optional
    `column_name` picks a field-appropriate fake (e.g. an address column gets a
    fake address, not a person's name).
    """
    if pd.isna(value):
        return value

    text = str(value)
    faker = _seeded_faker(text)

    # Email-like values
    if "@" in text:
        return faker.email()

    # SSN-like values (9 digits, optional dashes)
    digits = text.replace("-", "")
    if len(digits) == 9 and digits.isdigit():
        return faker.ssn()

    # Phone-like values
    stripped = (
        text.replace("-", "").replace(" ", "")
        .replace("(", "").replace(")", "").replace("+", "")
    )
    if stripped.isdigit() and len(stripped) >= 7:
        return faker.phone_number()

    # Date-like values are better handled by a deterministic shift than a random
    # fake (keeps them parseable and interval-consistent).
    for fmt in DATE_FORMATS:
        try:
            datetime.strptime(text, fmt)
            return shift_date(text)
        except ValueError:
            continue

    # Otherwise, match the column's semantics if we can; default to a fake name.
    provider = _faker_for_column(faker, column_name)
    if provider is not None:
        return provider()
    return faker.name()


def apply_rule(value, rule, column_name=None):
    if rule == "Hash":
        return hash_value(value)

    if rule == "Fake Value":
        return fake_value(value, column_name)

    if rule == "Partial Masking":
        return partial_mask(value)

    if rule == "Date Shift":
        return shift_date(value)

    return value


def apply_masking_rules(df, masking_rules):
    masked_df = df.copy()
    applied_rules = {}

    for column_name, rule in masking_rules.items():
        if column_name in masked_df.columns and rule != "No Masking":
            masked_df[column_name] = masked_df[column_name].apply(
                lambda value, rule=rule, column_name=column_name: apply_rule(value, rule, column_name)
            )
            applied_rules[column_name] = rule

    return masked_df, applied_rules


def run_local_anonymization(input_path, output_path, masking_rules):
    source_df = pd.read_csv(input_path)

    masked_df, applied_rules = apply_masking_rules(source_df, masking_rules)

    masked_df.to_csv(output_path, index=False)

    audit = {
        "total_rows_processed": len(source_df),
        "tables_processed": 1,
        "pii_columns_masked": len(applied_rules),
        "rules_applied": [f"{column}: {rule}" for column, rule in applied_rules.items()],
        "output_target": output_path,
        "run_status": "Success",
        "execution_mode": "Databricks Jobs API orchestration",
    }

    preview = {
        "before": source_df.head(5).to_dict(orient="records"),
        "after": masked_df.head(5).to_dict(orient="records"),
    }

    return preview, audit
