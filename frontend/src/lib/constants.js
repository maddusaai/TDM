import {
  LayoutDashboard, Users, Network, Play, Shield, Upload,
  Tag, List, Eye, Clock, GitBranch,
} from 'lucide-react';

export const API_BASE_URL = 'http://127.0.0.1:8000';

export function wsSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export const ENV_BADGE = {
  PROD: 'bg-red-100 text-red-600',
  UAT: 'bg-yellow-100 text-yellow-600',
  QA: 'bg-blue-100 text-blue-600',
  DEV: 'bg-green-100 text-green-600',
};

export const WS_NAV = [
  { icon: LayoutDashboard, label: 'Overview',        tab: '' },
  { icon: Users,           label: 'Members',         tab: 'members' },
  { icon: Network,         label: 'Connectors',      tab: 'connectors' },
  { icon: Upload,          label: 'Data Inventory',  tab: 'data-inventory' },
  { icon: Tag,             label: 'Classification',  tab: 'data-classification' },
  { icon: Shield,          label: 'Masking Rules',   tab: 'masking-rules' },
  { icon: List,            label: 'Pipelines',       tab: 'pipelines' },
  { icon: Eye,             label: 'Masked Assets',   tab: 'masked-assets' },
  { icon: Clock,           label: 'Jobs',            tab: 'jobs' },
  { icon: Clock,           label: 'Job History',     tab: 'job-history' },
  { icon: GitBranch,      label: 'Schema Versions', tab: 'schema-versions' },
];

export const sampleColumns = [
  { name: 'customer_id', type: 'string', pii: true, rule: 'Hash' },
  { name: 'full_name', type: 'string', pii: true, rule: 'Fake Value' },
  { name: 'email', type: 'string', pii: true, rule: 'Fake Value' },
  { name: 'phone_number', type: 'string', pii: true, rule: 'Fake Value' },
  { name: 'date_of_birth', type: 'date', pii: true, rule: 'Date Shift' },
  { name: 'city', type: 'string', pii: false, rule: 'No Masking' },
  { name: 'account_balance', type: 'decimal', pii: false, rule: 'No Masking' },
];

// ─── Org users ───────────────────────────────────────────────────────────────
// Single source of truth for all users in the org.
// role: admin | developer | qa | viewer
// allowed_environments: which sandbox target envs this role can use
export const ORG_USERS = [
  {
    id: 'usr-001',
    email: 'admin@tdm.com',
    name: 'TDM Admin',
    role: 'admin',
    allowed_environments: ['DEV', 'QA', 'PROD'],
  },
  {
    id: 'usr-002',
    email: 'developer@tdm.com',
    name: 'TDM Developer',
    role: 'developer',
    allowed_environments: ['DEV'],
  },
  {
    id: 'usr-003',
    email: 'dev.priya@tdm.com',
    name: 'Priya Shah',
    role: 'developer',
    allowed_environments: ['DEV'],
  },
  {
    id: 'usr-004',
    email: 'qa.alex@tdm.com',
    name: 'Alex Chen',
    role: 'qa',
    allowed_environments: ['DEV', 'QA'],
  },
  {
    id: 'usr-005',
    email: 'dev.maya@tdm.com',
    name: 'Maya Patel',
    role: 'developer',
    allowed_environments: ['DEV'],
  },
];

export const blueprintWorkspaces = [
  {
    id: 'ws-001',
    name: 'Claims Modernization',
    owner: 'Priya Shah',
    owner_id: 'usr-003',
    created_by: 'usr-001',
    status: 'Active',
    description:
      'Workspace for claims source systems, sandbox schemas, masked data, and QA-ready pipelines.',
    connector_ids: ['conn-001', 'conn-002'],
    members: [
      { user_id: 'usr-001', name: 'TDM Admin',   email: 'admin@tdm.com',       role: 'admin' },
      { user_id: 'usr-003', name: 'Priya Shah',   email: 'dev.priya@tdm.com',   role: 'developer' },
      { user_id: 'usr-004', name: 'Alex Chen',    email: 'qa.alex@tdm.com',     role: 'qa' },
    ],
    domains: [
      {
        name: 'Claims',
        asset: 'Claims Core Asset',
        tables: ['patient_records', 'appointments', 'insurance_claims'],
        pipelines: ['Claims_Daily_Masking', 'Claims_QA_Subset'],
      },
      {
        name: 'Provider',
        asset: 'Provider Reference Asset',
        tables: ['doctor_reference', 'department_reference'],
        pipelines: ['Provider_Weekly_Masking'],
      },
    ],
  },
  {
    id: 'ws-002',
    name: 'Customer 360 QA',
    owner: 'Alex Chen',
    owner_id: 'usr-004',
    created_by: 'usr-001',
    status: 'Active',
    description:
      'Workspace for customer profile testing, contact masking, and regression-ready datasets.',
    connector_ids: ['conn-001', 'conn-003'],
    members: [
      { user_id: 'usr-001', name: 'TDM Admin',   email: 'admin@tdm.com',       role: 'admin' },
      { user_id: 'usr-004', name: 'Alex Chen',    email: 'qa.alex@tdm.com',     role: 'qa' },
      { user_id: 'usr-002', name: 'TDM Developer',email: 'developer@tdm.com',   role: 'developer' },
    ],
    domains: [
      {
        name: 'Customer',
        asset: 'Customer Golden Record',
        tables: ['customer_profile', 'customer_contact', 'customer_address'],
        pipelines: ['C360_Nightly_Masking'],
      },
      {
        name: 'Preferences',
        asset: 'Marketing Preference Asset',
        tables: ['email_preferences', 'sms_preferences'],
        pipelines: ['Preference_Masking_Weekly'],
      },
    ],
  },
  {
    id: 'ws-003',
    name: 'Salesforce Sandbox',
    owner: 'Maya Patel',
    owner_id: 'usr-005',
    created_by: 'usr-001',
    status: 'Draft',
    description:
      'Workspace for CRM object extraction and masked sandbox refresh validation.',
    connector_ids: ['conn-004'],
    members: [
      { user_id: 'usr-001', name: 'TDM Admin',   email: 'admin@tdm.com',       role: 'admin' },
      { user_id: 'usr-005', name: 'Maya Patel',   email: 'dev.maya@tdm.com',    role: 'developer' },
    ],
    domains: [
      {
        name: 'CRM',
        asset: 'CRM Lead Asset',
        tables: ['account', 'contact', 'lead', 'opportunity', 'case'],
        pipelines: ['SFDC_Sandbox_Refresh'],
      },
    ],
  },
];

export const blueprintConnections = [
  {
    id: 'conn-001',
    name: 'SQL_PROD_HEALTHCARE',
    type: 'SQL Server',
    sourceType: 'DB',
    connection: 'sql-prod.company.com:1433/DDB',
    status: 'Connected',
    purpose: 'Production-like source metadata and schema discovery',
    created_by: 'usr-001',
  },
  {
    id: 'conn-002',
    name: 'DBX_TDM_MASKED',
    type: 'Databricks',
    sourceType: 'Target',
    connection: 'healthcare_catalog.patient_schema',
    status: 'Connected',
    purpose: 'Masked test data landing and execution orchestration',
    created_by: 'usr-001',
  },
  {
    id: 'conn-003',
    name: 'SQL_QA_MASKED',
    type: 'SQL Server',
    sourceType: 'Target',
    connection: 'sql-qa.company.com:1433/TDM_QA',
    status: 'Draft',
    purpose: 'QA target for project-specific sandbox outputs',
    created_by: 'usr-001',
  },
  {
    id: 'conn-004',
    name: 'SFTP_MEMBER_FEED',
    type: 'SFTP',
    sourceType: 'File',
    connection: 'sftp://feeds.company.com/inbound/member',
    status: 'Connected',
    purpose: 'Future file-based source ingestion',
    created_by: 'usr-001',
  },
];

// ─── Test connectors ────────────────────────────────────────────────────────
// Use these exact details in the Source Connections "Add Connection" form.
// Enter the connection string below and click "Test" → status flips to Connected.
//
//  Name              Type         Connection string
//  ───────────────   ──────────   ───────────────────────────────────
//  TEST_RETAIL_DB    SQL Server   test-retail.tdm.local:1433/RetailDB
//  TEST_FINANCE_DB   Oracle       test-finance.tdm.local:1521/FinanceDB
//  TEST_HR_DB        Databricks   test-hr-catalog.tdm.local/hr_schema
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_CONNECTOR_STRINGS = [
  'test-retail.tdm.local:1433/RetailDB',
  'test-finance.tdm.local:1521/FinanceDB',
  'test-hr-catalog.tdm.local/hr_schema',
];

export const connectorTableData = {
  'test-retail.tdm.local:1433/RetailDB': {
    database: 'RetailDB',
    tables: [
      {
        name: 'customers',
        columns: ['customer_id', 'full_name', 'email', 'phone', 'date_of_birth', 'city', 'loyalty_tier'],
        rows: [
          { customer_id: 'C001', full_name: 'Alice Johnson', email: 'alice.j@mail.com', phone: '555-0101', date_of_birth: '1990-03-14', city: 'Chicago', loyalty_tier: 'Gold' },
          { customer_id: 'C002', full_name: 'Bob Martinez', email: 'bob.m@mail.com', phone: '555-0102', date_of_birth: '1985-07-22', city: 'Dallas', loyalty_tier: 'Silver' },
          { customer_id: 'C003', full_name: 'Carol Lee',    email: 'carol.l@mail.com', phone: '555-0103', date_of_birth: '1992-11-05', city: 'Seattle', loyalty_tier: 'Gold' },
          { customer_id: 'C004', full_name: 'David Kim',    email: 'david.k@mail.com', phone: '555-0104', date_of_birth: '1978-01-30', city: 'Austin',  loyalty_tier: 'Bronze' },
          { customer_id: 'C005', full_name: 'Eva Singh',    email: 'eva.s@mail.com',   phone: '555-0105', date_of_birth: '1995-06-18', city: 'Boston',  loyalty_tier: 'Silver' },
        ],
      },
      {
        name: 'orders',
        columns: ['order_id', 'customer_id', 'order_date', 'total_amount', 'status', 'payment_method'],
        rows: [
          { order_id: 'ORD-1001', customer_id: 'C001', order_date: '2026-01-10', total_amount: '$240.00', status: 'Delivered', payment_method: 'Credit Card' },
          { order_id: 'ORD-1002', customer_id: 'C002', order_date: '2026-01-15', total_amount: '$89.50',  status: 'Delivered', payment_method: 'PayPal' },
          { order_id: 'ORD-1003', customer_id: 'C003', order_date: '2026-02-03', total_amount: '$560.00', status: 'Shipped',   payment_method: 'Credit Card' },
          { order_id: 'ORD-1004', customer_id: 'C001', order_date: '2026-02-20', total_amount: '$35.00',  status: 'Delivered', payment_method: 'Debit Card' },
          { order_id: 'ORD-1005', customer_id: 'C005', order_date: '2026-03-01', total_amount: '$128.75', status: 'Processing',payment_method: 'Credit Card' },
        ],
      },
      {
        name: 'products',
        columns: ['product_id', 'product_name', 'category', 'price', 'stock_qty', 'supplier_id'],
        rows: [
          { product_id: 'P001', product_name: 'Wireless Headphones', category: 'Electronics', price: '$120.00', stock_qty: 340, supplier_id: 'SUP-01' },
          { product_id: 'P002', product_name: 'Running Shoes',        category: 'Footwear',    price: '$85.00',  stock_qty: 210, supplier_id: 'SUP-02' },
          { product_id: 'P003', product_name: 'Coffee Maker',         category: 'Appliances',  price: '$65.00',  stock_qty: 95,  supplier_id: 'SUP-03' },
          { product_id: 'P004', product_name: 'Yoga Mat',             category: 'Sports',      price: '$30.00',  stock_qty: 500, supplier_id: 'SUP-02' },
          { product_id: 'P005', product_name: 'USB-C Hub',            category: 'Electronics', price: '$45.00',  stock_qty: 180, supplier_id: 'SUP-01' },
        ],
      },
      {
        name: 'store_locations',
        columns: ['store_id', 'store_name', 'city', 'state', 'manager_name', 'phone'],
        rows: [
          { store_id: 'S01', store_name: 'Retail North', city: 'Chicago',  state: 'IL', manager_name: 'Tom Brady',   phone: '312-555-0010' },
          { store_id: 'S02', store_name: 'Retail South', city: 'Dallas',   state: 'TX', manager_name: 'Sara Wells',  phone: '214-555-0020' },
          { store_id: 'S03', store_name: 'Retail West',  city: 'Seattle',  state: 'WA', manager_name: 'John Park',   phone: '206-555-0030' },
          { store_id: 'S04', store_name: 'Retail East',  city: 'Boston',   state: 'MA', manager_name: 'Linda Cruz',  phone: '617-555-0040' },
        ],
      },
    ],
  },

  'test-finance.tdm.local:1521/FinanceDB': {
    database: 'FinanceDB',
    tables: [
      {
        name: 'accounts',
        columns: ['account_id', 'holder_name', 'account_type', 'balance', 'opened_date', 'ssn', 'email'],
        rows: [
          { account_id: 'ACC-001', holder_name: 'Frank Turner',  account_type: 'Savings',  balance: '$12,400.00', opened_date: '2020-04-01', ssn: '***-**-1234', email: 'frank.t@bank.com' },
          { account_id: 'ACC-002', holder_name: 'Grace Nguyen',  account_type: 'Checking', balance: '$3,800.50',  opened_date: '2019-08-15', ssn: '***-**-5678', email: 'grace.n@bank.com' },
          { account_id: 'ACC-003', holder_name: 'Henry Okafor',  account_type: 'Savings',  balance: '$54,200.00', opened_date: '2018-01-10', ssn: '***-**-9012', email: 'henry.o@bank.com' },
          { account_id: 'ACC-004', holder_name: 'Irene Vasquez', account_type: 'Checking', balance: '$890.00',    opened_date: '2022-11-20', ssn: '***-**-3456', email: 'irene.v@bank.com' },
          { account_id: 'ACC-005', holder_name: 'James Liu',     account_type: 'Savings',  balance: '$22,100.00', opened_date: '2021-06-05', ssn: '***-**-7890', email: 'james.l@bank.com' },
        ],
      },
      {
        name: 'transactions',
        columns: ['txn_id', 'account_id', 'txn_date', 'amount', 'type', 'description', 'channel'],
        rows: [
          { txn_id: 'TXN-5001', account_id: 'ACC-001', txn_date: '2026-05-01', amount: '-$250.00', type: 'Debit',  description: 'Grocery Store', channel: 'POS' },
          { txn_id: 'TXN-5002', account_id: 'ACC-002', txn_date: '2026-05-03', amount: '+$1,500.00',type: 'Credit', description: 'Payroll Deposit', channel: 'ACH' },
          { txn_id: 'TXN-5003', account_id: 'ACC-003', txn_date: '2026-05-10', amount: '-$80.00',  type: 'Debit',  description: 'Utility Bill',   channel: 'Online' },
          { txn_id: 'TXN-5004', account_id: 'ACC-001', txn_date: '2026-05-15', amount: '-$45.00',  type: 'Debit',  description: 'Fuel Station',   channel: 'POS' },
          { txn_id: 'TXN-5005', account_id: 'ACC-005', txn_date: '2026-05-18', amount: '+$500.00', type: 'Credit', description: 'Bank Transfer',  channel: 'Wire' },
        ],
      },
      {
        name: 'loans',
        columns: ['loan_id', 'account_id', 'loan_type', 'principal', 'interest_rate', 'start_date', 'status'],
        rows: [
          { loan_id: 'LN-001', account_id: 'ACC-001', loan_type: 'Home Loan',   principal: '$320,000', interest_rate: '6.5%', start_date: '2021-03-01', status: 'Active' },
          { loan_id: 'LN-002', account_id: 'ACC-003', loan_type: 'Auto Loan',   principal: '$28,000',  interest_rate: '4.2%', start_date: '2022-07-15', status: 'Active' },
          { loan_id: 'LN-003', account_id: 'ACC-004', loan_type: 'Personal Loan',principal: '$5,000', interest_rate: '9.0%', start_date: '2023-01-10', status: 'Closed' },
          { loan_id: 'LN-004', account_id: 'ACC-002', loan_type: 'Education Loan',principal: '$15,000',interest_rate: '5.5%', start_date: '2020-09-01', status: 'Active' },
        ],
      },
    ],
  },

  'test-hr-catalog.tdm.local/hr_schema': {
    database: 'hr_schema',
    tables: [
      {
        name: 'employees',
        columns: ['emp_id', 'full_name', 'email', 'department', 'job_title', 'salary', 'hire_date', 'manager_id'],
        rows: [
          { emp_id: 'E001', full_name: 'Karan Mehta',   email: 'karan.m@corp.com', department: 'Engineering', job_title: 'Senior Engineer',  salary: '$95,000', hire_date: '2019-06-01', manager_id: 'E010' },
          { emp_id: 'E002', full_name: 'Laura Simmons', email: 'laura.s@corp.com', department: 'Finance',     job_title: 'Financial Analyst', salary: '$78,000', hire_date: '2020-03-15', manager_id: 'E011' },
          { emp_id: 'E003', full_name: 'Mike Obi',      email: 'mike.o@corp.com',  department: 'HR',          job_title: 'HR Manager',        salary: '$85,000', hire_date: '2018-01-10', manager_id: 'E012' },
          { emp_id: 'E004', full_name: 'Nina Patel',    email: 'nina.p@corp.com',  department: 'Engineering', job_title: 'DevOps Engineer',   salary: '$88,000', hire_date: '2021-09-20', manager_id: 'E010' },
          { emp_id: 'E005', full_name: 'Oscar Wang',    email: 'oscar.w@corp.com', department: 'Sales',       job_title: 'Sales Executive',   salary: '$65,000', hire_date: '2022-04-05', manager_id: 'E013' },
        ],
      },
      {
        name: 'departments',
        columns: ['dept_id', 'dept_name', 'head_emp_id', 'budget', 'location', 'headcount'],
        rows: [
          { dept_id: 'D01', dept_name: 'Engineering', head_emp_id: 'E010', budget: '$2,400,000', location: 'Floor 3', headcount: 42 },
          { dept_id: 'D02', dept_name: 'Finance',     head_emp_id: 'E011', budget: '$800,000',   location: 'Floor 2', headcount: 18 },
          { dept_id: 'D03', dept_name: 'HR',          head_emp_id: 'E012', budget: '$500,000',   location: 'Floor 1', headcount: 10 },
          { dept_id: 'D04', dept_name: 'Sales',       head_emp_id: 'E013', budget: '$1,200,000', location: 'Floor 2', headcount: 30 },
        ],
      },
      {
        name: 'payroll',
        columns: ['payroll_id', 'emp_id', 'pay_period', 'gross_pay', 'tax_deduction', 'net_pay', 'bank_account'],
        rows: [
          { payroll_id: 'PR-001', emp_id: 'E001', pay_period: '2026-05', gross_pay: '$7,917', tax_deduction: '$1,900', net_pay: '$6,017', bank_account: '****4321' },
          { payroll_id: 'PR-002', emp_id: 'E002', pay_period: '2026-05', gross_pay: '$6,500', tax_deduction: '$1,560', net_pay: '$4,940', bank_account: '****8765' },
          { payroll_id: 'PR-003', emp_id: 'E003', pay_period: '2026-05', gross_pay: '$7,083', tax_deduction: '$1,700', net_pay: '$5,383', bank_account: '****2109' },
          { payroll_id: 'PR-004', emp_id: 'E004', pay_period: '2026-05', gross_pay: '$7,333', tax_deduction: '$1,760', net_pay: '$5,573', bank_account: '****6543' },
          { payroll_id: 'PR-005', emp_id: 'E005', pay_period: '2026-05', gross_pay: '$5,417', tax_deduction: '$1,300', net_pay: '$4,117', bank_account: '****0987' },
        ],
      },
      {
        name: 'attendance',
        columns: ['record_id', 'emp_id', 'date', 'check_in', 'check_out', 'hours_worked', 'status'],
        rows: [
          { record_id: 'AT-001', emp_id: 'E001', date: '2026-06-01', check_in: '09:02', check_out: '18:05', hours_worked: 9.1, status: 'Present' },
          { record_id: 'AT-002', emp_id: 'E002', date: '2026-06-01', check_in: '08:55', check_out: '17:50', hours_worked: 8.9, status: 'Present' },
          { record_id: 'AT-003', emp_id: 'E003', date: '2026-06-01', check_in: '—',     check_out: '—',     hours_worked: 0,   status: 'Leave' },
          { record_id: 'AT-004', emp_id: 'E004', date: '2026-06-01', check_in: '09:30', check_out: '18:30', hours_worked: 9.0, status: 'Present' },
          { record_id: 'AT-005', emp_id: 'E005', date: '2026-06-01', check_in: '10:00', check_out: '19:00', hours_worked: 9.0, status: 'Present' },
        ],
      },
    ],
  },
};

export const blueprintPipelines = [
  {
    id: 'pipe-001',
    name: 'Claims_Daily_Masking',
    workspace: 'Claims Modernization',
    workspace_id: 'ws-001',
    source: 'SQL_PROD_HEALTHCARE',
    source_connector_id: 'conn-001',
    target: 'DBX_TDM_MASKED',
    target_connector_id: 'conn-002',
    sandbox: 'person_a_project_001_dev_schema',
    lastRun: '2026-06-12 08:30 AM',
    tables: ['patient_records', 'appointments', 'insurance_claims'],
    status: 'Ready',
    created_by: 'usr-001',
  },
  {
    id: 'pipe-002',
    name: 'Patient_QA_Refresh',
    workspace: 'Claims Modernization',
    workspace_id: 'ws-001',
    source: 'SQL_PROD_HEALTHCARE',
    source_connector_id: 'conn-001',
    target: 'SQL_QA_MASKED',
    target_connector_id: 'conn-003',
    sandbox: 'person_b_project_002_qa_schema',
    lastRun: '2026-06-11 09:15 PM',
    tables: ['patient_records', 'insurance_claims'],
    status: 'Draft',
    created_by: 'usr-001',
  },
  {
    id: 'pipe-003',
    name: 'Regression_Claims_Masking',
    workspace: 'Customer 360 QA',
    workspace_id: 'ws-002',
    source: 'SQL_PROD_HEALTHCARE',
    source_connector_id: 'conn-001',
    target: 'DBX_TDM_MASKED',
    target_connector_id: 'conn-002',
    sandbox: 'person_c_project_003_regression_schema',
    lastRun: 'Not executed yet',
    tables: ['patient_records', 'appointments', 'insurance_claims', 'customer_profile'],
    status: 'In Review',
    created_by: 'usr-001',
  },
];

export const maskedAssetSamples = [
  {
    asset: 'Patient Records Masked Asset',
    workspace: 'Claims Modernization',
    sandbox: 'person_a_project_001_dev_schema',
    tables: ['patient_records', 'appointments'],
    rows: '150',
    status: 'Ready',
  },
  {
    asset: 'Claims QA Masked Asset',
    workspace: 'Claims Modernization',
    sandbox: 'person_b_project_002_qa_schema',
    tables: ['patient_records', 'insurance_claims'],
    rows: '250',
    status: 'Ready',
  },
  {
    asset: 'Regression Masked Asset',
    workspace: 'Customer 360 QA',
    sandbox: 'person_c_project_003_regression_schema',
    tables: ['patient_records', 'appointments', 'insurance_claims'],
    rows: '375',
    status: 'Draft',
  },
];
