import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Database, Settings, Play, CheckCircle2, Clock, History,
  AlertTriangle, Eye, FileText, Activity, Lock, List,
  ChevronRight, Shield, ChevronDown, Tags, SlidersHorizontal, TableProperties, Plus,
  Copy, Pencil, RefreshCw, ArrowLeft, Table2, CalendarClock, Layers, X,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useConnectors } from '../context/ConnectorsContext';
import { useJobs } from '../context/JobsContext';
import {
  API_BASE_URL, sampleColumns, connectorTableData, TEST_CONNECTOR_STRINGS,
  blueprintPipelines, blueprintWorkspaces, blueprintConnections,
} from '../lib/constants';

// ─── Wizard sub-components ───────────────────────────────────────────────────

const workflowSteps = [
  { id: 1, label: 'Source Selection', icon: Database },
  { id: 2, label: 'Rule Configuration', icon: Settings },
  { id: 3, label: 'Run Job', icon: Play },
  { id: 4, label: 'Review Output', icon: Eye },
];

function Stepper({ activeStep }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {workflowSteps.map((step) => {
        const Icon = step.icon;
        const isActive = activeStep === step.id;
        const isDone = activeStep > step.id;
        return (
          <div
            key={step.id}
            className={`rounded-2xl border p-4 transition ${
              isActive
                ? 'border-slate-900 bg-slate-900 text-white'
                : isDone
                ? 'border-emerald-200 bg-emerald-50 text-slate-900'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5" />
              {isDone && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            </div>
            <p className="mt-3 text-[13px] font-medium">{step.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function SourceStep({ onNext, onMultipleDatasetsGenerated }) {
  const { connectors, addConnector } = useConnectors();

  // real datasets from backend
  const [apiDatasets, setApiDatasets] = useState([]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/datasets`)
      .then((r) => setApiDatasets(r.data.datasets || []))
      .catch(() => {});
  }, []);

  // group api datasets by database_name
  const apiDatabases = Object.values(
    apiDatasets.reduce((acc, ds) => {
      const key = ds.database_name || ds.connection_id || 'Unknown';
      if (!acc[key]) acc[key] = { name: key, connectionId: ds.connection_id, connectorId: ds.connection_id, tables: [] };
      if (ds.table_name && !acc[key].tables.find((t) => t.name === ds.table_name)) {
        acc[key].tables.push({
          name: ds.table_name,
          dataset_id: ds.dataset_id,
          row_count: ds.row_count || 100,
          columns: ds.columns || [],
          columnCount: (ds.columns || []).length,
        });
      }
      return acc;
    }, {})
  );

  // test connector databases (hardcoded simulation data)
  const connectorDatabases = connectors
    .filter((c) => connectorTableData[c.connection])
    .map((c) => {
      const data = connectorTableData[c.connection];
      return {
        name: data.database,
        connectionId: c.id || c.name,
        connectorId: c.id || c.name,
        connectorType: c.type,
        tables: (data.tables || []).map((t) => ({
          name: t.name,
          dataset_id: `${c.name}-${t.name}`,
          row_count: 100,
          columns: Object.keys(t.rows?.[0] || {}).map((col) => ({
            name: col,
            type: typeof t.rows?.[0]?.[col] === 'number' ? 'integer' : 'varchar',
            pii: /name|email|phone|ssn|dob|address/i.test(col),
            rule: /name|email|phone|ssn|dob|address/i.test(col) ? 'Fake Value' : 'No Masking',
            ai_suggested_rule: /name|email|phone|ssn|dob|address/i.test(col) ? 'Fake Value' : 'No Masking',
            override_allowed: true,
          })),
          columnCount: Object.keys(t.rows?.[0] || {}).length,
          sampleRows: t.rows,
        })),
      };
    });

  // merge: api databases first, then connector databases not already present
  const allDatabases = [
    ...apiDatabases,
    ...connectorDatabases.filter((cd) => !apiDatabases.find((a) => a.name === cd.name)),
  ];

  const [selectedDb, setSelectedDb] = useState(null);
  const [selectedTables, setSelectedTables] = useState([]);
  const [rowCountByTable, setRowCountByTable] = useState({});

  const [showAddConn, setShowAddConn] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnType, setNewConnType] = useState('SQL Server');
  const [newConnString, setNewConnString] = useState('');
  const [addConnMsg, setAddConnMsg] = useState(null);

  const availableTables = selectedDb?.tables || [];

  const handleDbSelect = (db) => {
    setSelectedDb(db);
    setSelectedTables([]);
    setRowCountByTable({});
  };

  const toggleTable = (tableName) => {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
    setRowCountByTable((prev) => ({ ...prev, [tableName]: prev[tableName] || 100 }));
  };

  const handleAddConnection = () => {
    if (!newConnName.trim() || !newConnString.trim()) return;
    const isTest = TEST_CONNECTOR_STRINGS.includes(newConnString.trim());
    const conn = {
      name: newConnName.trim(),
      type: newConnType,
      sourceType: newConnType === 'SFTP' ? 'File' : 'DB',
      connection: newConnString.trim(),
      status: isTest ? 'Connected' : 'Draft',
      purpose: isTest
        ? `Test connector — ${connectorTableData[newConnString.trim()]?.database} database`
        : 'New connection created from pipeline setup',
    };
    addConnector(conn);
    setAddConnMsg(
      isTest
        ? `✓ "${conn.name}" connected — ${connectorTableData[newConnString.trim()]?.tables?.length || 0} tables available.`
        : `"${conn.name}" added as Draft. Use a test connection string to get table data.`
    );
    setNewConnName(''); setNewConnString('');
  };

  const handleProceed = () => {
    const datasets = selectedTables.map((tableName) => {
      const tableData = availableTables.find((t) => t.name === tableName);
      return {
        dataset_id: tableData?.dataset_id || `${selectedDb.name}-${tableName}`,
        filename: tableName,
        table_name: tableName,
        source_type: 'database',
        source_database: selectedDb?.name,
        source_connector_id: selectedDb?.connectorId || selectedDb?.connectionId,

        row_count: rowCountByTable[tableName] || tableData?.row_count || 100,
        columns: tableData?.columns || [],
      };
    });
    onMultipleDatasetsGenerated(datasets);
    onNext();
  };

  const canProceed = !!selectedDb && selectedTables.length > 0;

  return (
    <div className="space-y-5">
      {/* Source Database */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3"><Database className="h-5 w-5 text-slate-700" /></div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Source Database</h2>
                <p className="text-[13px] text-slate-500">Select a database from your data assets, or add a new connection.</p>
              </div>
            </div>
            <button
              onClick={() => { setShowAddConn((v) => !v); setAddConnMsg(null); }}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[12px] font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              <Plus size={13} /> New Connection
            </button>
          </div>

          {showAddConn && (
            <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <p className="text-[12px] font-semibold text-indigo-700">Add a new connection</p>
              <p className="text-[11px] text-slate-500">Test strings: <span className="font-mono">test-retail.tdm.local:1433/RetailDB</span>, <span className="font-mono">test-finance.tdm.local:1521/FinanceDB</span>, <span className="font-mono">test-hr-catalog.tdm.local/hr_schema</span></p>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Name</label>
                  <input value={newConnName} onChange={(e) => setNewConnName(e.target.value)} placeholder="e.g. TEST_RETAIL_DB" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Type</label>
                  <select value={newConnType} onChange={(e) => setNewConnType(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none">
                    <option>SQL Server</option><option>Oracle</option><option>Databricks</option><option>SFTP</option><option>Salesforce</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Connection String</label>
                  <input value={newConnString} onChange={(e) => setNewConnString(e.target.value)} placeholder="host:port/database" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none" />
                </div>
              </div>
              <Button onClick={handleAddConnection} disabled={!newConnName.trim() || !newConnString.trim()} className="rounded-xl text-[13px]">
                Add &amp; Connect
              </Button>
              {addConnMsg && (
                <p className={`text-[12px] ${addConnMsg.startsWith('✓') ? 'text-emerald-600' : 'text-amber-600'}`}>{addConnMsg}</p>
              )}
            </div>
          )}

          {allDatabases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-[13px] text-slate-500">No databases found. Add a new connection above or register datasets via Data Assets.</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allDatabases.map((db) => {
                const isSelected = selectedDb?.name === db.name;
                return (
                  <button
                    key={db.name}
                    onClick={() => handleDbSelect(db)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <Database size={16} className={`mt-0.5 shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{db.name}</p>
                      {db.connectorType && <p className="text-[11px] text-slate-500 truncate">{db.connectionId} · {db.connectorType}</p>}
                      <p className="text-[11px] text-slate-400">{db.tables.length} table{db.tables.length !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables */}
      {selectedDb && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-2xl bg-slate-100 p-3"><TableProperties className="h-5 w-5 text-slate-700" /></div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Select Tables</h2>
                <p className="text-[13px] text-slate-500">{selectedDb.name} — {availableTables.length} tables available</p>
              </div>
            </div>
            <div className="space-y-2">
              {availableTables.map((table) => {
                const isSelected = selectedTables.includes(table.name);
                return (
                  <div
                    key={table.name}
                    className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleTable(table.name)} className="h-4 w-4 accent-indigo-600" />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-slate-900">{table.name}</p>
                      <p className="text-[11px] text-slate-500">{table.columnCount} columns · {table.row_count?.toLocaleString()} rows</p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-500">Rows to generate</label>
                        <input
                          type="number" min="1" max="10000"
                          value={rowCountByTable[table.name] || table.row_count || 100}
                          onChange={(e) => setRowCountByTable((prev) => ({ ...prev, [table.name]: Number(e.target.value) }))}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleProceed} disabled={!canProceed} className="rounded-xl">
          Continue to Rule Configuration
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MultiTableRulesStep({ currentUser, selectedDatasets, onRulesChange, onNext }) {
  const isDeveloper = currentUser?.role === 'developer';
  const [adminLockedRules, setAdminLockedRules] = useState({});
  const [tables, setTables] = useState([]);

  useEffect(() => {
    const fetchAdminLockedRules = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/admin-locked-rules`);
        const rulesMap = {};
        (response.data.rules || []).forEach((rule) => {
          if (rule.enabled) {
            rulesMap[rule.column.toLowerCase()] = {
              rule: rule.rule,
              lockedBy: rule.locked_by,
              reason: rule.reason,
              developerCanOverride: rule.developer_can_override,
            };
          }
        });
        setAdminLockedRules(rulesMap);
      } catch (err) {
        console.error(err);
      }
    };
    fetchAdminLockedRules();
  }, []);

  const normalizeColumns = (columns) =>
    columns.map((col) => {
      const lockedRule = adminLockedRules[col.name?.toLowerCase()];
      if (isDeveloper && lockedRule && !lockedRule.developerCanOverride) {
        return { ...col, ai_suggested_rule: col.ai_suggested_rule || lockedRule.rule, rule: lockedRule.rule, override_allowed: false, admin_locked: true, locked_reason: lockedRule.reason, locked_by: lockedRule.lockedBy };
      }
      return { ...col, ai_suggested_rule: col.ai_suggested_rule || col.rule || 'No Masking', rule: col.rule || col.ai_suggested_rule || 'No Masking', override_allowed: col.override_allowed !== false, admin_locked: false };
    });

  useEffect(() => {
    const safeDatasets = Array.isArray(selectedDatasets) && selectedDatasets.length > 0
      ? selectedDatasets
      : [{ dataset_id: 'sample', filename: 'Sample Dataset', source_type: 'sample', columns: sampleColumns }];
    setTables(safeDatasets.map((dataset) => ({ ...dataset, columns: normalizeColumns(dataset.columns || sampleColumns) })));
  }, [selectedDatasets, currentUser, adminLockedRules]);

  useEffect(() => {
    const rulesByDataset = {};
    tables.forEach((table) => {
      const rules = {};
      (table.columns || []).forEach((col) => { rules[col.name] = col.rule || 'No Masking'; });
      rulesByDataset[table.dataset_id] = rules;
    });
    onRulesChange(rulesByDataset);
  }, [tables, onRulesChange]);

  const updateRule = (datasetId, columnName, rule) => {
    setTables(tables.map((table) => {
      if (table.dataset_id !== datasetId) return table;
      return {
        ...table,
        columns: table.columns.map((col) => {
          if (col.name !== columnName) return col;
          if (isDeveloper && col.admin_locked) return col;
          return { ...col, rule };
        }),
      };
    }));
  };

  const totalColumns = tables.reduce((n, t) => n + (t.columns?.length || 0), 0);
  const piiColumns = tables.reduce((n, t) => n + (t.columns || []).filter((c) => c.pii).length, 0);
  const adminLockedCount = tables.reduce((n, t) => n + (t.columns || []).filter((c) => c.admin_locked).length, 0);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Masking Rule Assignment</h2>
          <p className="mt-1 text-[13px] text-slate-500">Review and adjust masking rules for every selected table before execution.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <MetricCard icon={TableProperties} label="Tables" value={tables.length} helper="Selected source tables" />
            <MetricCard icon={Tags} label="Total Columns" value={totalColumns} helper="Across all tables" />
            <MetricCard icon={AlertTriangle} label="PII Columns" value={piiColumns} helper="AI-classified sensitive fields" />
            <MetricCard icon={Lock} label="Admin Locked" value={adminLockedCount} helper="Developer cannot override" />
          </div>

          <div className="mt-6 space-y-6">
            {tables.map((table) => (
              <div key={table.dataset_id} className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-900">{table.table_name || table.filename}</p>
                    <p className="text-[11px] text-slate-500">{table.columns?.length || 0} columns</p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">{table.source_type || 'dataset'}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-[13px]">
                    <thead className="bg-white text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">Column</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Classification</th>
                        <th className="px-4 py-3 font-medium">AI Suggested</th>
                        <th className="px-4 py-3 font-medium">Final Rule</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(table.columns || []).map((col) => {
                        const isOverridden = col.rule !== col.ai_suggested_rule;
                        return (
                          <tr key={`${table.dataset_id}-${col.name}`} className="bg-white">
                            <td className="px-4 py-3 font-medium text-slate-900">{col.name}</td>
                            <td className="px-4 py-3 text-slate-600">{col.type || 'unknown'}</td>
                            <td className="px-4 py-3">
                              {col.pii ? (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700"><AlertTriangle className="mr-1 h-3 w-3" /> PII</span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">Non-PII</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">{col.ai_suggested_rule || 'No Masking'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={col.rule || 'No Masking'}
                                disabled={isDeveloper && col.admin_locked}
                                onChange={(e) => updateRule(table.dataset_id, col.name, e.target.value)}
                                className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none ${isDeveloper && col.admin_locked ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white'}`}
                              >
                                <option>No Masking</option>
                                <option>Fake Value</option>
                                <option>Partial Masking</option>
                                <option>Date Shift</option>
                                <option>Hash</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {col.admin_locked ? (
                                <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-[11px] font-medium text-red-700"><Lock className="mr-1 h-3 w-3" />Locked</span>
                              ) : isOverridden ? (
                                <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">Overridden</span>
                              ) : (
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">AI Accepted</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={onNext} className="rounded-xl">
              Continue to Job Run
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreRunValidationAgentCard({ validation, loading, error, onValidate }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedChecks, setExpandedChecks] = useState({});
  const status = validation?.overall_status || 'PENDING';
  const statusStyles = {
    READY: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    WARNING: 'border-amber-200 bg-amber-50 text-amber-800',
    BLOCKED: 'border-red-200 bg-red-50 text-red-800',
    PENDING: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  const checkStyles = {
    PASSED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    WARNING: 'bg-amber-50 text-amber-700 border-amber-100',
    BLOCKED: 'bg-red-50 text-red-700 border-red-100',
  };
  const checks = validation?.checks || [];
  const blockedChecks = checks.filter((c) => c.status === 'BLOCKED').length;
  const warningChecks = checks.filter((c) => c.status === 'WARNING').length;
  const toggleCheck = (name) => setExpandedChecks((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <Card className="rounded-2xl border border-indigo-100 shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <button type="button" onClick={() => setIsExpanded((v) => !v)} className="flex flex-1 gap-3 text-left">
            <div className="h-fit rounded-2xl bg-indigo-50 p-3"><Shield className="h-5 w-5 text-indigo-700" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">Pre-Run Validation</h2>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              </div>
              {validation?.summary && <p className="mt-2 line-clamp-2 text-[13px] font-medium text-slate-700">{validation.summary}</p>}
              {error && <p className="mt-2 text-[13px] font-medium text-red-700">{error}</p>}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyles[status] || statusStyles.PENDING}`}>
              {loading ? 'VALIDATING' : status}
            </span>
            {validation && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                {blockedChecks} blocked · {warningChecks} warning
              </span>
            )}
            <Button variant="outline" className="rounded-xl" disabled={loading} onClick={onValidate}>
              {loading ? 'Validating...' : 'Re-Validate'}
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>}
            {!error && !validation && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">Waiting to run pre-execution checks.</div>}
            {validation && (
              <>
                <div className={`rounded-xl border p-4 text-[13px] ${statusStyles[status] || statusStyles.PENDING}`}>{validation.summary}</div>
                <div className="mt-5 space-y-3">
                  {checks.map((check) => (
                    <div key={check.name} className="rounded-xl border border-slate-200 bg-white">
                      <button type="button" onClick={() => toggleCheck(check.name)} className="flex w-full items-center justify-between p-4 text-left">
                        <div className="flex items-center gap-2">
                          {expandedChecks[check.name] ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                          <p className="font-semibold text-slate-900">{check.name}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${checkStyles[check.status] || 'bg-slate-50 text-slate-700 border-slate-100'}`}>{check.status}</span>
                      </button>
                      {expandedChecks[check.name] && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <p className="text-[13px] text-slate-600">{check.message}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunStep({ currentUser, onNext, onJobCreated, maskingRules, selectedDatasets, pipelineName, pipelineId, workspaceId, isPipelineRun = false }) {
  const { addJob } = useJobs();
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobDetails, setJobDetails] = useState(null);
  const [error, setError] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const selectedDatasetList = Array.isArray(selectedDatasets) && selectedDatasets.length > 0 ? selectedDatasets : [];
  const isMultiTableRun = selectedDatasetList.length > 1;
  const totalRequestedRows = selectedDatasetList.reduce((n, d) => n + Number(d.row_count || 0), 0);
  const configuredRuleCount = selectedDatasetList.reduce((n, d) => {
    const datasetRules = maskingRules?.[d.dataset_id] || {};
    return n + Object.values(datasetRules).filter((r) => r && r !== 'No Masking').length;
  }, 0);

  const buildValidationPayload = () => ({
    datasets: selectedDatasetList.map((d) => ({ dataset_id: d.dataset_id, masking_rules: maskingRules?.[d.dataset_id] || {} })),
    user_role: currentUser?.role || 'developer',
  });

  const validatePreRun = async () => {
    if (selectedDatasetList.length === 0) { setValidationError('No datasets selected.'); return null; }
    try {
      setValidationLoading(true);
      setValidationError(null);
      const response = await axios.post(`${API_BASE_URL}/agents/pre-run-validation`, buildValidationPayload());
      setValidationResult(response.data.validation);
      return response.data.validation;
    } catch (err) {
      console.error(err);
      setValidationError(err.response?.data?.message || 'Unable to run pre-run validation.');
      return null;
    } finally {
      setValidationLoading(false);
    }
  };

  const validationDependency = `${selectedDatasetList.map((d) => d.dataset_id).join('|')}::${JSON.stringify(maskingRules || {})}`;
  useEffect(() => {
    if (!isPipelineRun && selectedDatasetList.length > 0) validatePreRun();
  }, [validationDependency, isPipelineRun]);

  const startPipelineRun = async () => {
    try {
      setRunning(true); setComplete(false); setError(null); setJobId(null); setJobDetails(null);
      if (selectedDatasetList.length === 0) { setRunning(false); setError('No datasets selected.'); return; }

      const runResponse = await axios.post(`${API_BASE_URL}/pipeline/run`, {
        tables: selectedDatasetList.map((d) => ({
          dataset_id: d.dataset_id,
          table_name: d.table_name || d.filename || d.dataset_id,
          row_count: d.row_count || 100,
          columns: d.columns || [],
          masking_rules: maskingRules?.[d.dataset_id] || {},
        })),
        user_role: currentUser?.role || 'developer',
      });

      if (runResponse.data.status === 'FAILED') { setRunning(false); setError(runResponse.data.message || 'Pipeline run failed.'); return; }

      const newJobId = runResponse.data.job_id;
      setJobId(newJobId);
      onJobCreated(newJobId);
      const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${newJobId}/status`);
      const details = statusResponse.data;
      setJobDetails(details);
      setRunning(false);
      setComplete(true);

      addJob({
        job_id: newJobId,
        pipeline_id: pipelineId || null,
        pipeline_name: pipelineName || null,
        workspace_id: workspaceId || null,
        triggered_by: currentUser?.id || null,
        triggered_by_email: currentUser?.email || null,
        triggered_by_name: currentUser?.name || null,
        dataset_name: selectedDatasetList.map((d) => d.table_name || d.filename || d.dataset_id).join(', '),
        source_type: 'pipeline',
        status: 'COMPLETED',
        created_at: runResponse.data.job_started_at || new Date().toISOString(),
        rows_processed: runResponse.data.rows_processed ?? 0,
        columns_masked: runResponse.data.columns_masked ?? 0,
        execution_mode: runResponse.data.execution_mode || 'Pipeline batch run',
        tables_processed: runResponse.data.tables_processed ?? selectedDatasetList.length,
      });
    } catch (err) {
      console.error(err);
      setRunning(false);
      setError('Unable to connect to backend. Make sure FastAPI is running on port 8000.');
    }
  };

  const startRun = async () => {
    if (isPipelineRun) { await startPipelineRun(); return; }
    try {
      setRunning(true); setComplete(false); setError(null); setJobId(null); setJobDetails(null);
      if (selectedDatasetList.length === 0) { setRunning(false); setError('No datasets selected.'); return; }
      const validation = await validatePreRun();
      if (!validation) { setRunning(false); setError('Pre-run validation could not complete.'); return; }
      if (!validation.can_run) { setRunning(false); setError(validation.summary || 'Validation blocked execution.'); return; }

      let runResponse;
      if (isMultiTableRun) {
        runResponse = await axios.post(`${API_BASE_URL}/jobs/run-multiple`, {
          datasets: selectedDatasetList.map((d) => ({ dataset_id: d.dataset_id, masking_rules: maskingRules?.[d.dataset_id] || {} })),
          user_role: currentUser?.role || 'developer',
        });
      } else {
        const d = selectedDatasetList[0];
        runResponse = await axios.post(`${API_BASE_URL}/jobs/run`, {
          dataset_id: d.dataset_id,
          masking_rules: maskingRules?.[d.dataset_id] || maskingRules,
          user_role: currentUser?.role || 'developer',
        });
      }

      if (runResponse.data.status === 'FAILED') { setRunning(false); setError(runResponse.data.message || 'Job failed.'); return; }
      const newJobId = runResponse.data.job_id;
      setJobId(newJobId);
      onJobCreated(newJobId);
      const statusResponse = await axios.get(`${API_BASE_URL}/jobs/${newJobId}/status`);
      const details = statusResponse.data;
      setJobDetails(details);
      setRunning(false);
      setComplete(true);

      addJob({
        job_id: newJobId,
        pipeline_id: pipelineId || null,
        pipeline_name: pipelineName || null,
        workspace_id: workspaceId || null,
        triggered_by: currentUser?.id || null,
        triggered_by_email: currentUser?.email || null,
        triggered_by_name: currentUser?.name || null,
        dataset_name: selectedDatasetList.map((d) => d.table_name || d.filename || d.dataset_id).join(', '),
        source_type: selectedDatasetList[0]?.source_type || 'DB',
        status: 'COMPLETED',
        created_at: details.job_started_at || new Date().toISOString(),
        rows_processed: details.rows_processed ?? 0,
        columns_masked: details.columns_masked ?? 0,
        execution_mode: details.execution_mode || 'batch',
        tables_processed: details.tables_processed ?? selectedDatasetList.length,
      });
    } catch (err) {
      console.error(err);
      setRunning(false);
      setError('Unable to connect to backend. Make sure FastAPI is running on port 8000.');
    }
  };

  return (
    <div className="space-y-6">
      {isPipelineRun ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800">
          <p className="font-semibold">Ready to run</p>
          <p className="mt-1 text-emerald-700">Data will be generated from the selected connector tables and masked according to the configured rules.</p>
        </div>
      ) : (
        <PreRunValidationAgentCard validation={validationResult} loading={validationLoading} error={validationError} onValidate={validatePreRun} />
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Run Anonymization Job</h2>
            <p className="mt-1 text-[13px] text-slate-500">Submit selected tables to the FastAPI execution layer.</p>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">Execution Scope</p>
                  <p className="mt-1 text-[11px] text-slate-500">{isMultiTableRun ? `${selectedDatasetList.length} tables in one multi-table job.` : 'One table.'}</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">{isMultiTableRun ? 'Multi-table run' : 'Single-table run'}</span>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {selectedDatasetList.map((d) => (
                  <div key={d.dataset_id} className="rounded-xl bg-slate-50 px-4 py-3 text-[13px]">
                    <p className="font-medium text-slate-900">{d.table_name || d.filename}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{d.row_count} rows</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    {complete ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : running ? <Clock className="h-6 w-6 text-slate-700" /> : <Play className="h-6 w-6 text-slate-700" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{complete ? 'Job Completed' : running ? 'Running...' : 'Ready to Run'}</p>
                    <p className="text-[13px] text-slate-500">{complete ? 'Anonymization complete.' : running ? 'Submitting to FastAPI.' : 'Start to begin anonymization.'}</p>
                  </div>
                </div>
                <Button onClick={startRun} disabled={running || (!isPipelineRun && (validationLoading || validationResult?.can_run === false))} className="rounded-xl">
                  {running ? 'Running...' : 'Start Job'}
                </Button>
              </div>
              {running && <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-3/4 rounded-full bg-slate-900 transition-all duration-1000" /></div>}
              {jobId && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800"><p className="font-medium">Job submitted successfully</p><p className="mt-1 break-all">Job ID: {jobId}</p></div>}
              {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <MetricCard icon={TableProperties} label="Tables Processed" value={jobDetails ? jobDetails.tables_processed : '—'} helper="Source tables" />
              <MetricCard icon={Database} label="Rows Processed" value={jobDetails ? jobDetails.rows_processed?.toLocaleString() : '—'} helper="Total rows" />
              <MetricCard icon={Lock} label="Columns Masked" value={jobDetails ? jobDetails.columns_masked : '—'} helper="PII fields" />
              <MetricCard icon={Activity} label="Execution Mode" value={jobDetails ? jobDetails.execution_mode : '—'} helper="Engine" />
              <MetricCard icon={Clock} label="Started At" value={jobDetails?.job_started_at ? new Date(jobDetails.job_started_at).toLocaleTimeString() : '—'} helper="Job start time" />
              <MetricCard icon={CheckCircle2} label="Duration" value={jobDetails?.duration_seconds !== undefined ? `${jobDetails.duration_seconds}s` : '—'} helper="Execution time" />
            </div>
            {complete && (
              <div className="mt-6 flex justify-end">
                <Button onClick={onNext} className="rounded-xl">Review Output <ChevronRight className="ml-2 h-4 w-4" /></Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-900">Run Summary</h3>
            <div className="mt-5 space-y-3 text-[13px]">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tables</p><p className="mt-1 text-lg font-semibold text-slate-900">{selectedDatasetList.length}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Rows Requested</p><p className="mt-1 text-lg font-semibold text-slate-900">{totalRequestedRows > 0 ? totalRequestedRows.toLocaleString() : '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Masked Columns</p><p className="mt-1 text-lg font-semibold text-slate-900">{configuredRuleCount}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreviewTable({ title, rows, warning = false }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-3 text-[13px] text-slate-500">No preview rows available.</p>
        </CardContent>
      </Card>
    );
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {warning ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700"><AlertTriangle className="mr-1 h-3 w-3" /> Contains PII</span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Masked</span>
          )}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{headers.map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i}>
                  {headers.map((h) => <td key={h} className="px-3 py-3 text-slate-700">{row[h] === undefined || row[h] === null ? '—' : String(row[h])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStep({ jobId, selectedDatasets = [] }) {
  const [previewData, setPreviewData] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) { setError('No job ID found. Please run an anonymization job first.'); return; }
    const fetchReviewData = async () => {
      try {
        setLoading(true); setError(null);
        const [previewRes, auditRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/jobs/${jobId}/preview`),
          axios.get(`${API_BASE_URL}/jobs/${jobId}/audit`),
        ]);
        setPreviewData(previewRes.data);
        setAuditData(auditRes.data.audit);
      } catch (err) {
        console.error(err);
        setError('Unable to fetch review data from backend.');
      } finally {
        setLoading(false);
      }
    };
    fetchReviewData();
  }, [jobId]);

  if (loading) return <Card className="rounded-2xl shadow-sm"><CardContent className="p-6"><p className="text-[13px] text-slate-600">Loading preview data...</p></CardContent></Card>;
  if (error) return <Card className="rounded-2xl shadow-sm"><CardContent className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div></CardContent></Card>;
  if (!previewData || !auditData) return null;

  const groupByTable = (rows) => {
    const grouped = {};
    (rows || []).forEach((row) => { const name = row._table || 'Output'; if (!grouped[name]) grouped[name] = []; grouped[name].push(row); });
    return grouped;
  };
  const beforeGroups = groupByTable(previewData.before);
  const afterGroups = groupByTable(previewData.after);
  const tableNames = Array.from(new Set([...Object.keys(beforeGroups), ...Object.keys(afterGroups)]));
  const auditRows = [
    { metric: 'Total rows processed', value: auditData.total_rows_processed?.toLocaleString() },
    { metric: 'Tables processed', value: auditData.tables_processed },
    { metric: 'PII columns masked', value: auditData.pii_columns_masked },
    { metric: 'Rules applied', value: auditData.rules_applied?.join(', ') },
    { metric: 'Output target', value: auditData.output_target },
    { metric: 'Run status', value: auditData.run_status },
    { metric: 'Execution mode', value: auditData.execution_mode },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><p className="font-medium">Review data loaded</p><p className="mt-1 break-all">Job ID: {jobId}</p></div>
          <a href={`${API_BASE_URL}/download/masked-output/${jobId}`} download className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-slate-800">Download Masked CSV</a>
        </div>
      </div>
      <div className="space-y-6">
        {tableNames.map((tableName) => (
          <div key={tableName} className="space-y-4">
            <div className="rounded-2xl bg-slate-900 px-5 py-3 text-white"><p className="text-[13px] font-semibold">Table: {tableName}</p></div>
            <div className="grid gap-5 lg:grid-cols-2">
              <PreviewTable title="Before Anonymization" rows={beforeGroups[tableName] || []} warning />
              <PreviewTable title="After Anonymization" rows={afterGroups[tableName] || []} />
            </div>
          </div>
        ))}
      </div>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3"><FileText className="h-5 w-5 text-slate-700" /></div>
            <div><h2 className="text-base font-semibold text-slate-900">Audit Summary</h2><p className="text-[13px] text-slate-500">Generated by backend after anonymization run.</p></div>
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-[13px]">
              <tbody className="divide-y divide-slate-100">
                {auditRows.map((row) => (
                  <tr key={row.metric}>
                    <td className="bg-slate-50 px-4 py-3 font-medium text-slate-700">{row.metric}</td>
                    <td className="px-4 py-3 text-slate-900">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pipeline wizard state ────────────────────────────────────────────────────

function PipelineWizard({ currentUser, onDone }) {
  const [pipelineName, setPipelineName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [activeStep, setActiveStep] = useState(1);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [maskingRules, setMaskingRules] = useState({});
  const [selectedDatasets, setSelectedDatasets] = useState([]);

  const reset = () => { setActiveStep(1); setCurrentJobId(null); setMaskingRules({}); setSelectedDatasets([]); setPipelineName(''); setWorkspaceName(''); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onDone} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" /> Back to Pipelines
        </button>
        <Button variant="outline" className="rounded-xl" onClick={reset}>Reset</Button>
      </div>

      {/* Pipeline name + workspace */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-slate-700">Pipeline Name <span className="text-rose-400">*</span></label>
              <input
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="e.g. HealthCare_DEV_Masking_v1"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-slate-700">Workspace <span className="text-rose-400">*</span></label>
              <select
                value={workspaceName}
                onChange={(e) => {
                  const ws = blueprintWorkspaces.find((w) => w.name === e.target.value);
                  setWorkspaceName(e.target.value);
                  setWorkspaceId(ws?.id || '');
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] outline-none focus:border-indigo-400"
              >
                <option value="">Select workspace…</option>
                {blueprintWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.name}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Stepper activeStep={activeStep} />

      <div key={activeStep}>
        {activeStep === 1 && (
          <SourceStep
            onMultipleDatasetsGenerated={(datasets) => setSelectedDatasets(datasets)}
            onNext={() => setActiveStep(2)}
          />
        )}
        {activeStep === 2 && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setActiveStep(1)} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors">
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to Source Selection
              </button>
            </div>
            <MultiTableRulesStep
              currentUser={currentUser}
              selectedDatasets={selectedDatasets}
              onRulesChange={(rules) => setMaskingRules(rules)}
              onNext={() => setActiveStep(3)}
            />
          </>
        )}
        {activeStep === 3 && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => setActiveStep(2)} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors">
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to Rule Configuration
              </button>
            </div>
            <RunStep
              currentUser={currentUser}
              selectedDatasets={selectedDatasets}
              maskingRules={maskingRules}
              pipelineName={pipelineName}
              workspaceId={workspaceId}
              isPipelineRun={true}
              onJobCreated={(jobId) => setCurrentJobId(jobId)}
              onNext={() => setActiveStep(4)}
            />
          </>
        )}
        {activeStep === 4 && (
          <div className="space-y-5">
            <ReviewStep jobId={currentJobId} selectedDatasets={selectedDatasets} />
            <div className="flex items-center justify-between">
              <button onClick={() => setActiveStep(3)} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors">
                <ChevronRight className="h-4 w-4 rotate-180" /> Back to Run Job
              </button>
              <Button
                onClick={() =>
                  onDone({
                    name: pipelineName || `Pipeline_${Date.now()}`,
                    workspace: workspaceName || '—',
                    sandbox: '—',
                    source: selectedDatasets[0]?.source_database || selectedDatasets[0]?.source_type || 'DB',
                    source_connector_id: selectedDatasets[0]?.source_connector_id || null,
                    target: '—',
                    tables: selectedDatasets.map((d) => d.table_name || d.dataset_id),
                    status: 'Active',
                    lastRun: new Date().toLocaleString(),
                  })
                }
                className="rounded-xl"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Done — Back to Pipelines
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Run Job Modal ────────────────────────────────────────────────────────────

const SIMULATED_DRIFT = {
  added: ['insurance_provider', 'discharge_date'],
  removed: ['contact_number'],
};

function RunJobModal({ pipeline, onClose, onConfirmRun }) {
  const navigate = useNavigate();
  const { connectors } = useConnectors();
  const [showDrift, setShowDrift] = useState(false);
  const [step, setStep] = useState('initial'); // initial | drift-detected | continue-warning | switch-version
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  const handleDriftToggle = (checked) => {
    setShowDrift(checked);
    setStep(checked ? 'drift-detected' : 'initial');
  };

  const handleConfirm = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await onConfirmRun(pipeline);
      onClose();
    } catch (err) {
      setRunError(err?.message || 'Failed to start job. Check backend connection.');
      setRunning(false);
    }
  };

  const handleGoToDataAssets = () => {
    // Resolve the connector's real id (conn-xxx) so the URL matches the connection_id
    // that DataAssetDBPage uses to filter all its tab data.
    // Priority 1: id match — already the right ID (new pipelines + blueprints)
    // Priority 2: name match — old pipelines that only stored the connector name in `source`
    // Priority 3: raw fallback
    const connectorMatch = connectors.find(
      (c) => c.id === pipeline.source_connector_id || c.name === pipeline.source
    );
    const connId = connectorMatch?.id || pipeline.source_connector_id || pipeline.source || 'default';
    navigate(`/admin/data-assets/${connId}?tab=drift`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-2">
              <RefreshCw size={15} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Run New Job</h2>
              <p className="text-[12px] text-slate-500 truncate max-w-[260px]">{pipeline.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Job summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-[13px]">
            {[
              ['Workspace', pipeline.workspace || '—'],
              ['Source', pipeline.source || '—'],
              ['Tables', `${pipeline.tables?.length ?? 0} table${pipeline.tables?.length !== 1 ? 's' : ''}`],
              ['Last Run', pipeline.lastRun || 'Never'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-800">{value}</span>
              </div>
            ))}
          </div>

          {/* Schema drift checkbox — only on initial */}
          {step === 'initial' && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={showDrift}
                onChange={(e) => handleDriftToggle(e.target.checked)}
                className="accent-indigo-600 h-4 w-4 mt-0.5 shrink-0"
              />
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Show Schema Drift</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Simulate a schema change in the source since the last version.</p>
              </div>
            </label>
          )}

          {/* Drift detected */}
          {step === 'drift-detected' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-[13px] font-semibold text-amber-800">Schema Drift Detected</p>
                </div>
                <p className="text-[12px] text-amber-700 mb-3">The source schema has changed since the last approved metadata version.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Added</p>
                    {SIMULATED_DRIFT.added.map((c) => (
                      <p key={c} className="text-[12px] text-slate-700 font-mono leading-relaxed">+ {c}</p>
                    ))}
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700 mb-1.5">Removed</p>
                    {SIMULATED_DRIFT.removed.map((c) => (
                      <p key={c} className="text-[12px] text-slate-700 font-mono leading-relaxed">− {c}</p>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[12px] text-slate-500">How would you like to proceed?</p>
            </div>
          )}

          {/* Continue-anyway warning */}
          {step === 'continue-warning' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-[13px] font-semibold text-amber-800">Proceeding with Current Version</p>
              </div>
              <p className="text-[13px] text-amber-700 leading-relaxed">
                The data will be generated based on the current metadata schema. Added columns will not be masked and removed columns will be ignored in this run.
              </p>
            </div>
          )}

          {/* Switch to new version */}
          {step === 'switch-version' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <p className="text-[13px] font-semibold text-blue-800">Masking rules needed for the new schema</p>
              <p className="text-[13px] text-blue-700 leading-relaxed">
                The new columns <span className="font-mono font-semibold">{SIMULATED_DRIFT.added.join(', ')}</span> need masking rules before this pipeline can run with the updated schema.
              </p>
              <p className="text-[13px] text-blue-700">Go to Data Assets and complete the rules in the Drift Inbox.</p>
            </div>
          )}

          {runError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{runError}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          {step === 'initial' && (
            <>
              <Button variant="outline" className="rounded-xl text-[13px]" onClick={onClose}>Cancel</Button>
              <Button className="rounded-xl text-[13px]" onClick={handleConfirm} disabled={running}>
                {running ? 'Starting…' : 'Run Job'}
              </Button>
            </>
          )}
          {step === 'drift-detected' && (
            <>
              <Button variant="outline" className="rounded-xl text-[13px]" onClick={onClose}>Cancel</Button>
              <Button variant="outline" className="rounded-xl text-[13px]" onClick={() => setStep('continue-warning')}>
                Continue Anyway
              </Button>
              <Button className="rounded-xl text-[13px]" onClick={() => setStep('switch-version')}>
                Switch to New Version
              </Button>
            </>
          )}
          {step === 'continue-warning' && (
            <>
              <Button variant="outline" className="rounded-xl text-[13px]" onClick={() => setStep('drift-detected')}>← Back</Button>
              <Button className="rounded-xl text-[13px]" onClick={handleConfirm} disabled={running}>
                {running ? 'Starting…' : 'Continue & Run'}
              </Button>
            </>
          )}
          {step === 'switch-version' && (
            <>
              <Button variant="outline" className="rounded-xl text-[13px]" onClick={onClose}>Cancel</Button>
              <button
                onClick={handleGoToDataAssets}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Go to Data Assets to fix masking →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Detail View ─────────────────────────────────────────────────────

const STATUS_STYLES = {
  Active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ready:     'bg-blue-50 text-blue-700 border-blue-200',
  Draft:     'bg-slate-100 text-slate-600 border-slate-200',
  'In Review': 'bg-amber-50 text-amber-700 border-amber-200',
  Running:   'bg-violet-50 text-violet-700 border-violet-200',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.Draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function PipelineDetailView({ pipeline, onBack, onEdit, onRunNew, onDuplicate, onUpdatePipeline }) {
  const { jobs: contextJobs } = useJobs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...pipeline });
  const [showRunModal, setShowRunModal] = useState(false);
  const [runMsg, setRunMsg] = useState(null);

  const pipelineJobs = contextJobs.filter(
    (j) => (pipeline.id && j.pipeline_id === pipeline.id) || j.pipeline_name === pipeline.name
  );

  const handleSave = () => {
    onUpdatePipeline(draft);
    setEditing(false);
  };

  const handleConfirmRun = async (p) => {
    await onRunNew(p);
    setRunMsg({ type: 'success', text: 'New job started successfully.' });
  };

  return (
    <div className="space-y-6">
      {showRunModal && (
        <RunJobModal
          pipeline={pipeline}
          onClose={() => setShowRunModal(false)}
          onConfirmRun={handleConfirmRun}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Pipelines
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{pipeline.name}</h1>
            <p className="text-[13px] text-slate-500">{pipeline.workspace}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="rounded-xl" onClick={() => onDuplicate(pipeline)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => setEditing((v) => !v)}>
            <Pencil className="mr-2 h-4 w-4" /> {editing ? 'Cancel Edit' : 'Edit'}
          </Button>
          <Button className="rounded-xl" onClick={() => { setRunMsg(null); setShowRunModal(true); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Run New Job
          </Button>
        </div>
      </div>

      {runMsg && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] ${runMsg.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {runMsg.text}
        </div>
      )}

      {/* Overview metric cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-xl bg-blue-50 p-2"><Layers className="h-4 w-4 text-blue-600" /></div>
            <p className="text-[12px] font-medium text-slate-500">Status</p>
          </div>
          <StatusBadge status={pipeline.status} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-xl bg-violet-50 p-2"><Table2 className="h-4 w-4 text-violet-600" /></div>
            <p className="text-[12px] font-medium text-slate-500">Tables</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pipeline.tables.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-xl bg-emerald-50 p-2"><History className="h-4 w-4 text-emerald-600" /></div>
            <p className="text-[12px] font-medium text-slate-500">Jobs Run</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pipelineJobs.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-xl bg-amber-50 p-2"><CalendarClock className="h-4 w-4 text-amber-600" /></div>
            <p className="text-[12px] font-medium text-slate-500">Last Run</p>
          </div>
          <p className="text-[13px] font-semibold text-slate-800 leading-snug">{pipeline.lastRun || 'Not executed yet'}</p>
        </div>
      </div>

      {/* Config + Tables side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Configuration */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Configuration</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Pipeline Name</label>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Workspace</label>
                  <select value={draft.workspace} onChange={(e) => setDraft((d) => ({ ...d, workspace: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                    {blueprintWorkspaces.map((ws) => <option key={ws.name}>{ws.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Source Connection</label>
                  <select value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                    {blueprintConnections.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Target Connection</label>
                  <select value={draft.target} onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                    {blueprintConnections.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600">Status</label>
                  <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                    <option>Draft</option><option>Ready</option><option>In Review</option><option>Active</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button className="rounded-xl flex-1" onClick={handleSave}>Save Changes</Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => { setDraft({ ...pipeline }); setEditing(false); }}>Discard</Button>
                </div>
              </div>
            ) : (
              <dl className="space-y-3 text-[13px]">
                {[
                  ['Pipeline Name', pipeline.name],
                  ['Workspace', pipeline.workspace],
                  ['Sandbox', pipeline.sandbox || '—'],
                  ['Source Connection', pipeline.source],
                  ['Target Connection', pipeline.target],
                  ['Status', <StatusBadge key="s" status={pipeline.status} />],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <dt className="text-slate-500 shrink-0">{label}</dt>
                    <dd className="text-slate-900 font-medium text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Tables */}
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Tables <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{pipeline.tables.length}</span>
            </h2>
            {pipeline.tables.length === 0 ? (
              <p className="text-[13px] text-slate-400">No tables configured.</p>
            ) : (
              <div className="space-y-2">
                {pipeline.tables.map((t) => (
                  <div key={t} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Database className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-[13px] font-medium text-slate-800">{t}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job History for this pipeline */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Job History</h2>
          <p className="text-[13px] text-slate-500 mb-5">All anonymization runs triggered from this pipeline.</p>
          {pipelineJobs.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 text-center text-[13px] text-slate-500">
              No jobs yet. Click <strong>Run New Job</strong> to execute this pipeline.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[800px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Job ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Triggered By</th>
                    <th className="px-4 py-3">Tables</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Cols Masked</th>
                    <th className="px-4 py-3">Run At</th>
                    <th className="px-4 py-3">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pipelineJobs.map((job) => (
                    <tr key={job.job_id} className="bg-white">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{job.job_id?.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{job.status}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[12px]">{job.triggered_by_name || job.triggered_by_email || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-slate-700">{job.tables_processed ?? 1}</td>
                      <td className="px-4 py-3 text-slate-900">{job.rows_processed?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-900">{job.columns_masked}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(job.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500 text-[12px]">{job.execution_mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

const PIPELINES_SESSION_KEY = 'tdm_pipelines';

function loadPipelinesFromSession() {
  try {
    const raw = sessionStorage.getItem(PIPELINES_SESSION_KEY);
    if (!raw) return blueprintPipelines;
    const saved = JSON.parse(raw);
    const savedNames = new Set(saved.map((p) => p.name));
    const merged = [...saved, ...blueprintPipelines.filter((p) => !savedNames.has(p.name))];
    return merged;
  } catch {
    return blueprintPipelines;
  }
}

export default function PipelinesPage() {
  const { currentUser } = useAuth();
  const { addJob } = useJobs();
  const [creating, setCreating] = useState(false);
  const [pipelines, setPipelines] = useState(loadPipelinesFromSession);
  const [viewingPipeline, setViewingPipeline] = useState(null);

  useEffect(() => {
    sessionStorage.setItem(PIPELINES_SESSION_KEY, JSON.stringify(pipelines));
  }, [pipelines]);

  const handleWizardDone = (newPipeline) => {
    if (newPipeline && newPipeline.name) {
      setPipelines((prev) => {
        if (prev.some((p) => p.name === newPipeline.name)) return prev;
        return [newPipeline, ...prev];
      });
    }
    setCreating(false);
  };

  const handleUpdatePipeline = (updated) => {
    setPipelines((prev) => prev.map((p) => p.name === updated.name ? updated : p));
    setViewingPipeline(updated);
  };

  const handleDuplicate = (pipeline) => {
    const copyName = `${pipeline.name}_Copy`;
    const copy = { ...pipeline, name: copyName, status: 'Draft', lastRun: 'Not executed yet' };
    setPipelines((prev) => [copy, ...prev]);
    setViewingPipeline(copy);
  };

  const handleRunNew = async (pipeline) => {
    const tables = pipeline.tables || [];
    if (tables.length === 0) throw new Error('No tables configured on this pipeline.');

    const tableItems = tables.map((t) => ({
      dataset_id: `${pipeline.source || 'connector'}-${t}`,
      table_name: t,
      row_count: 100,
      columns: [],
      masking_rules: {},
    }));

    const res = await axios.post(`${API_BASE_URL}/pipeline/run`, {
      tables: tableItems,
      user_role: currentUser?.role || 'developer',
    });

    if (res.data.status === 'FAILED') throw new Error(res.data.message || 'Run failed.');

    const now = new Date().toLocaleString();
    setPipelines((prev) => prev.map((p) =>
      p.name === pipeline.name ? { ...p, status: 'Active', lastRun: now } : p
    ));
    if (viewingPipeline?.name === pipeline.name) {
      setViewingPipeline((v) => ({ ...v, status: 'Active', lastRun: now }));
    }

    addJob({
      job_id: res.data.job_id,
      pipeline_id: pipeline.id || null,
      pipeline_name: pipeline.name,
      workspace_id: pipeline.workspace_id || null,
      triggered_by: currentUser?.id || null,
      triggered_by_email: currentUser?.email || null,
      triggered_by_name: currentUser?.name || null,
      dataset_name: tables.join(', '),
      source_type: 'pipeline',
      status: 'COMPLETED',
      created_at: res.data.job_started_at || new Date().toISOString(),
      rows_processed: res.data.rows_processed ?? 0,
      columns_masked: res.data.columns_masked ?? 0,
      execution_mode: res.data.execution_mode || 'Pipeline batch run',
      tables_processed: res.data.tables_processed ?? tables.length,
    });
  };

  if (creating) {
    return <PipelineWizard currentUser={currentUser} onDone={handleWizardDone} />;
  }

  if (viewingPipeline) {
    return (
      <PipelineDetailView
        pipeline={viewingPipeline}
        onBack={() => setViewingPipeline(null)}
        onEdit={() => {}}
        onRunNew={handleRunNew}
        onDuplicate={handleDuplicate}
        onUpdatePipeline={handleUpdatePipeline}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Pipelines"
          description="View and manage all pipelines, or create a new one from scratch."
          icon={List}
        />
        <Button onClick={() => setCreating(true)} className="shrink-0 rounded-xl mt-1">
          <Plus className="mr-2 h-4 w-4" /> Create Pipeline
        </Button>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Pipeline Catalog</h2>
              <p className="text-[13px] text-slate-500">Click a pipeline to view its details.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">{pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Sandbox</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Tables</th>
                  <th className="px-4 py-3">Last Run</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipelines.map((p) => (
                  <tr
                    key={p.name}
                    onClick={() => setViewingPipeline(p)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-indigo-700 hover:underline">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.workspace}</td>
                    <td className="px-4 py-3 text-slate-500 text-[12px]">{p.sandbox || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.source}</td>
                    <td className="px-4 py-3 text-slate-600">{p.target}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{p.tables.length}</td>
                    <td className="px-4 py-3 text-slate-500 text-[12px]">{p.lastRun || 'Not executed yet'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
