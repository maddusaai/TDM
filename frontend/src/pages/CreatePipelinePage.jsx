import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Database, Settings, Play, CheckCircle2, Clock,
  AlertTriangle, Eye, FileText, Activity, Lock,
  ChevronRight, Shield, ChevronDown, Tags, SlidersHorizontal, TableProperties,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useConnectors } from '../context/ConnectorsContext';
import { API_BASE_URL, sampleColumns, connectorTableData } from '../lib/constants';

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
  const { connectors } = useConnectors();
  const [selectedConnectorName, setSelectedConnectorName] = useState('');
  const [selectedTables, setSelectedTables] = useState([]);
  const [rowCountByTable, setRowCountByTable] = useState({});

  const selectedConnector = connectors.find((c) => c.name === selectedConnectorName);
  const availableTables = selectedConnector ? (connectorTableData[selectedConnector.connectionString] || []) : [];

  const handleConnectorChange = (name) => {
    setSelectedConnectorName(name);
    setSelectedTables([]);
    setRowCountByTable({});
  };

  const toggleTable = (tableName) => {
    setSelectedTables((prev) =>
      prev.includes(tableName)
        ? prev.filter((t) => t !== tableName)
        : [...prev, tableName]
    );
    setRowCountByTable((prev) => ({ ...prev, [tableName]: prev[tableName] || 100 }));
  };

  const handleProceed = () => {
    const datasets = selectedTables.map((tableName) => {
      const tableData = availableTables.find((t) => t.name === tableName);
      const sampleRow = tableData?.rows?.[0] || {};
      const columns = Object.keys(sampleRow).map((colName) => ({
        name: colName,
        type: typeof sampleRow[colName] === 'number' ? 'integer' : 'varchar',
        pii: /name|email|phone|ssn|dob|address/i.test(colName),
        rule: /name|email|phone|ssn|dob|address/i.test(colName) ? 'Fake Value' : 'No Masking',
        ai_suggested_rule: /name|email|phone|ssn|dob|address/i.test(colName) ? 'Fake Value' : 'No Masking',
        override_allowed: true,
      }));
      return {
        dataset_id: `${selectedConnectorName}-${tableName}`,
        filename: tableName,
        table_name: tableName,
        source_type: 'connector',
        row_count: rowCountByTable[tableName] || 100,
        columns,
      };
    });
    onMultipleDatasetsGenerated(datasets);
    onNext();
  };

  const canProceed = !!selectedConnectorName && selectedTables.length > 0;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3"><Database className="h-6 w-6 text-slate-700" /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Select Source Connector</h2>
              <p className="text-[13px] text-slate-500">Pick a connector, then choose the tables you want to anonymize.</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-[13px] font-medium text-slate-700">Connector</label>
            <select
              value={selectedConnectorName}
              onChange={(e) => handleConnectorChange(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none"
            >
              <option value="">Select a connector...</option>
              {connectors.map((c) => (
                <option key={c.name} value={c.name}>{c.name} — {c.type}</option>
              ))}
            </select>
          </div>

          {selectedConnector && availableTables.length === 0 && (
            <p className="mt-4 text-[13px] text-slate-500">No tables found for this connector.</p>
          )}

          {availableTables.length > 0 && (
            <div className="mt-6">
              <p className="text-[13px] font-medium text-slate-700">Available Tables</p>
              <div className="mt-3 space-y-2">
                {availableTables.map((table) => {
                  const isSelected = selectedTables.includes(table.name);
                  return (
                    <div
                      key={table.name}
                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition ${
                        isSelected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTable(table.name)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-slate-900">{table.name}</p>
                        <p className="text-[11px] text-slate-500">{table.rows?.length || 0} sample rows · {Object.keys(table.rows?.[0] || {}).length} columns</p>
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500">Rows</label>
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={rowCountByTable[table.name] || 100}
                            onChange={(e) => setRowCountByTable((prev) => ({ ...prev, [table.name]: Number(e.target.value) }))}
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

function RunStep({ currentUser, onNext, onJobCreated, maskingRules, selectedDatasets }) {
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobDetails, setJobDetails] = useState(null);
  const [error, setError] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const selectedDatasetList = Array.isArray(selectedDatasets) && selectedDatasets.length > 0
    ? selectedDatasets
    : [];
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
  useEffect(() => { if (selectedDatasetList.length > 0) validatePreRun(); }, [validationDependency]);

  const startRun = async () => {
    try {
      setRunning(true);
      setComplete(false);
      setError(null);
      setJobId(null);
      setJobDetails(null);
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
      setJobDetails(statusResponse.data);
      setRunning(false);
      setComplete(true);
    } catch (err) {
      console.error(err);
      setRunning(false);
      setError('Unable to connect to backend. Make sure FastAPI is running on port 8000.');
    }
  };

  return (
    <div className="space-y-6">
      <PreRunValidationAgentCard validation={validationResult} loading={validationLoading} error={validationError} onValidate={validatePreRun} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Run Anonymization Job</h2>
            <p className="mt-1 text-[13px] text-slate-500">Submit selected tables to the FastAPI execution layer.</p>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">Execution Scope</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {isMultiTableRun ? `${selectedDatasetList.length} tables in one multi-table job.` : 'One table.'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">
                  {isMultiTableRun ? 'Multi-table run' : 'Single-table run'}
                </span>
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
                <Button onClick={startRun} disabled={running || validationLoading || validationResult?.can_run === false} className="rounded-xl">
                  {running ? 'Running...' : 'Start Job'}
                </Button>
              </div>

              {running && (
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-3/4 rounded-full bg-slate-900 transition-all duration-1000" />
                </div>
              )}

              {jobId && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800">
                  <p className="font-medium">Job submitted successfully</p>
                  <p className="mt-1 break-all">Job ID: {jobId}</p>
                </div>
              )}
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
                <Button onClick={onNext} className="rounded-xl">
                  Review Output
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
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
        setLoading(true);
        setError(null);
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
    (rows || []).forEach((row) => {
      const name = row._table || 'Output';
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(row);
    });
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
          <div>
            <p className="font-medium">Review data loaded</p>
            <p className="mt-1 break-all">Job ID: {jobId}</p>
          </div>
          <a href={`${API_BASE_URL}/download/masked-output/${jobId}`} download className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-slate-800">
            Download Masked CSV
          </a>
        </div>
      </div>

      <div className="space-y-6">
        {tableNames.map((tableName) => (
          <div key={tableName} className="space-y-4">
            <div className="rounded-2xl bg-slate-900 px-5 py-3 text-white">
              <p className="text-[13px] font-semibold">Table: {tableName}</p>
            </div>
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
            <div>
              <h2 className="text-base font-semibold text-slate-900">Audit Summary</h2>
              <p className="text-[13px] text-slate-500">Generated by backend after anonymization run.</p>
            </div>
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

export default function CreatePipelinePage() {
  const { currentUser } = useAuth();
  const [activeStep, setActiveStep] = useState(1);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [maskingRules, setMaskingRules] = useState({});
  const [selectedDatasets, setSelectedDatasets] = useState([]);

  const resetPipeline = () => {
    setActiveStep(1);
    setCurrentJobId(null);
    setMaskingRules({});
    setSelectedDatasets([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Create Pipeline"
          description="Select source tables, configure masking rules, run anonymization, and review outputs."
          icon={Play}
        />
        <Button variant="outline" className="rounded-xl" onClick={resetPipeline}>Reset</Button>
      </div>

      <Stepper activeStep={activeStep} />

      <div key={activeStep}>
        {activeStep === 1 && (
          <SourceStep
            onMultipleDatasetsGenerated={(datasets) => setSelectedDatasets(datasets)}
            onNext={() => setActiveStep(2)}
          />
        )}
        {activeStep === 2 && (
          <MultiTableRulesStep
            currentUser={currentUser}
            selectedDatasets={selectedDatasets}
            onRulesChange={(rules) => setMaskingRules(rules)}
            onNext={() => setActiveStep(3)}
          />
        )}
        {activeStep === 3 && (
          <RunStep
            currentUser={currentUser}
            selectedDatasets={selectedDatasets}
            maskingRules={maskingRules}
            onJobCreated={(jobId) => setCurrentJobId(jobId)}
            onNext={() => setActiveStep(4)}
          />
        )}
        {activeStep === 4 && <ReviewStep jobId={currentJobId} selectedDatasets={selectedDatasets} />}
      </div>
    </div>
  );
}
