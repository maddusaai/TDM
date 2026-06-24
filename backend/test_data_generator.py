import random
from datetime import datetime, timedelta

import pandas as pd
from faker import Faker


fake = Faker()


def random_date_within_years(years_back=10):
    start_date = datetime.now() - timedelta(days=365 * years_back)
    random_days = random.randint(0, 365 * years_back)
    return (start_date + timedelta(days=random_days)).strftime("%Y-%m-%d")


def generate_customer_data(row_count):
    rows = []

    for i in range(row_count):
        rows.append({
            "customer_id": f"CUST{i + 1001}",
            "full_name": fake.name(),
            "email": fake.email(),
            "phone_number": fake.phone_number(),
            "date_of_birth": fake.date_of_birth(minimum_age=18, maximum_age=80).strftime("%Y-%m-%d"),
            "address": fake.address().replace("\n", ", "),
            "city": fake.city(),
            "state": fake.state_abbr(),
            "zip_code": fake.zipcode(),
            "account_balance": round(random.uniform(500, 50000), 2),
        })

    return pd.DataFrame(rows)


def generate_account_data(row_count):
    rows = []
    account_types = ["Checking", "Savings", "Credit", "Loan", "Investment"]
    account_statuses = ["Active", "Inactive", "Closed", "Pending Review"]

    for i in range(row_count):
        rows.append({
            "account_id": f"ACC{i + 5001}",
            "customer_id": f"CUST{random.randint(1001, 9999)}",
            "account_type": random.choice(account_types),
            "account_status": random.choice(account_statuses),
            "open_date": random_date_within_years(8),
            "balance": round(random.uniform(0, 100000), 2),
            "branch_code": f"BR{random.randint(100, 999)}",
        })

    return pd.DataFrame(rows)


def generate_claims_data(row_count):
    rows = []
    diagnosis_codes = ["E11.9", "I10", "J45.909", "M54.5", "K21.9", "R51.9"]
    claim_statuses = ["Submitted", "Approved", "Denied", "Pending"]

    for i in range(row_count):
        rows.append({
            "claim_id": f"CLM{i + 9001}",
            "member_id": f"MEM{random.randint(1001, 9999)}",
            "patient_name": fake.name(),
            "provider_name": fake.company(),
            "diagnosis_code": random.choice(diagnosis_codes),
            "claim_amount": round(random.uniform(100, 25000), 2),
            "claim_date": random_date_within_years(3),
            "claim_status": random.choice(claim_statuses),
        })

    return pd.DataFrame(rows)


def generate_employee_data(row_count):
    rows = []
    departments = ["Data Engineering", "Finance", "HR", "Operations", "Sales", "IT"]
    employment_statuses = ["Active", "On Leave", "Terminated"]

    for i in range(row_count):
        rows.append({
            "employee_id": f"EMP{i + 3001}",
            "employee_name": fake.name(),
            "email": fake.company_email(),
            "phone_number": fake.phone_number(),
            "ssn": fake.ssn(),
            "department": random.choice(departments),
            "job_title": fake.job(),
            "hire_date": random_date_within_years(12),
            "employment_status": random.choice(employment_statuses),
            "salary": random.randint(50000, 180000),
        })

    return pd.DataFrame(rows)


def generate_test_data(template, row_count):
    template = template.lower().strip()

    if row_count <= 0:
        raise ValueError("Row count must be greater than 0.")

    if row_count > 10000:
        raise ValueError("For MVP demo, row count cannot exceed 10,000.")

    if template == "customer":
        return generate_customer_data(row_count)

    if template == "account":
        return generate_account_data(row_count)

    if template == "claims":
        return generate_claims_data(row_count)

    if template == "employee":
        return generate_employee_data(row_count)

    raise ValueError("Unsupported template. Choose customer, account, claims, or employee.")