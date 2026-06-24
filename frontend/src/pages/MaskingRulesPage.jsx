import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  SlidersHorizontal, Shield, Lock, ChevronDown, ChevronRight,
  Database, Table2, AlertTriangle, Search,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/constants';

const MASKING_RULE_OPTIONS = ['No Masking', 'Fake Value', 'Partial Masking', 'Date Shift', 'Hash'];

const RULE_COLORS = {
  'Fake Value':      'bg-violet-50 text-violet-700',
  'Hash':            'bg-blue-50 text-blue-700',
  'Partial Masking': 'bg-amber-50 text-amber-700',
  'Date Shift':      'bg-cyan-50 text-cyan-700',
  'No Masking':      'bg-slate-100 text-slate-500',
};

const TAG_COLORS = {
  CONFIDENTIAL: 'bg-rose-600 text-white',
  PII:          'bg-amber-500 text-white',
  SENSITIVE:    'bg-orange-400 text-white',
  FINANCIAL:    'bg-blue-600 text-white',
  IDENTIFIER:   'bg-slate-600 text-white',
  PUBLIC:       'bg-slate-200 text-slate-600',
};

function getTag(col) {
  const n = col.name.toLowerCase();
  if (n.includes('ssn') || n.includes('social_security')) return 'CONFIDENTIAL';
  if (n.includes('name') || n.includes('email') || n.includes('phone') || n.includes('username')) return 'PII';
  if (n.includes('dob') || n.includes('birth')) return 'SENSITIVE';
  if (n.includes('salary') || n.includes('amount') || n.includes('pay') || n.includes('balance')) return 'FINANCIAL';
  if (n.endsWith('_id') || n === 'id') return 'IDENTIFIER';
  return 'PUBLIC';
}

const globalRules = [
  { name: 'Default Email Masking',      ruleType: 'Fake Value',      condition: 'Any column containing "email"',     status: 'Active' },
  { name: 'Default Identifier Hashing', ruleType: 'Hash',            condition: 'Any column ending with "_id"',      status: 'Active' },
  { name: 'Default Date Shift',         ruleType: 'Date Shift',      condition: 'DOB or birth_date columns',          status: 'Active' },
  { name: 'SSN Partial Masking',        ruleType: 'Partial Masking', condition: 'Any column named "ssn"',             status: 'Active' },
];

export default function MaskingRulesPage() {
  const { currentUser, isAdmin } = useAuth();

  const [datasets, setDatasets]     = useState([]);
  const [lockedRules, setLockedRules] = useState([]);
  const [loading, setLoading]       = useState(false);

  // locked rules search/filter state
  const [ruleSearch, setRuleSearch]               = useState('');
  const [ruleFilterType, setRuleFilterType]       = useState('');
  const [ruleFilterOverride, setRuleFilterOverride] = useState('');
  const [ruleFilterStatus, setRuleFilterStatus]   = useState('');

  // form state — cascading DB → Table → Column
  const [selDatabase, setSelDatabase] = useState('');
  const [selDataset, setSelDataset]   = useState('');
  const [selColumn, setSelColumn]     = useState('');
  const [selRule, setSelRule]       = useState('Partial Masking');
  const [reason, setReason]         = useState('');
  const [devOverride, setDevOverride] = useState(false);
  const [saveMsg, setSaveMsg]       = useState(null);

  // expanded DBs in rule catalog
  const [expandedDbs, setExpandedDbs]   = useState(new Set());
  const [expandedTbls, setExpandedTbls] = useState(new Set());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dsRes, lrRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/datasets`),
        axios.get(`${API_BASE_URL}/admin-locked-rules`),
      ]);
      setDatasets(dsRes.data.datasets || []);
      setLockedRules(lrRes.data.rules || []);
    } catch (err) {
      console.error(err);
      setSaveMsg('Unable to connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // group datasets by database_name → table_name
  const dbGroups = datasets.reduce((acc, d) => {
    const db = d.database_name || 'Unlinked';
    if (!acc[db]) acc[db] = {};
    acc[db][d.table_name] = d;
    return acc;
  }, {});

  const selectedDataset   = datasets.find((d) => d.dataset_id === selDataset);
  const availableColumns  = selectedDataset?.columns || [];
  const activeLockedRules = lockedRules.filter((r) => r.enabled);

  const filteredLockedRules = lockedRules.filter((r) => {
    if (ruleSearch && !r.column?.toLowerCase().includes(ruleSearch.toLowerCase()) && !r.reason?.toLowerCase().includes(ruleSearch.toLowerCase())) return false;
    if (ruleFilterType && r.rule !== ruleFilterType) return false;
    if (ruleFilterOverride === 'allowed' && !r.developer_can_override) return false;
    if (ruleFilterOverride === 'restricted' && r.developer_can_override) return false;
    if (ruleFilterStatus === 'active' && !r.enabled) return false;
    if (ruleFilterStatus === 'inactive' && r.enabled) return false;
    return true;
  });
  const [activeSection, setActiveSection] = useState('catalog');

  const SECTIONS = [
    { key: 'catalog', label: 'Rule Catalog' },
    { key: 'locked',  label: 'Admin Locked Rules', badge: activeLockedRules.length || null },
    { key: 'global',  label: 'Global Policies' },
  ];

  // metrics
  const totalColumns  = datasets.reduce((s, d) => s + (d.columns?.length || 0), 0);
  const piiColumns    = datasets.reduce((s, d) => s + (d.columns || []).filter((c) => c.pii).length, 0);

  const toggleDb  = (db)  => setExpandedDbs((p)  => { const n = new Set(p); n.has(db)  ? n.delete(db)  : n.add(db);  return n; });
  const toggleTbl = (key) => setExpandedTbls((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const saveLockedRule = async () => {
    setSaveMsg(null);
    if (!isAdmin) { setSaveMsg('Only Admin users can create locked rules.'); return; }
    if (!selColumn.trim()) { setSaveMsg('Select a column.'); return; }
    if (!reason.trim())    { setSaveMsg('Enter a reason.'); return; }
    try {
      const res = await axios.put(`${API_BASE_URL}/admin-locked-rules`, {
        column: selColumn.trim().toLowerCase(), rule: selRule, reason,
        developer_can_override: devOverride, enabled: true, user_role: currentUser?.role || 'developer',
      });
      if (res.data.status === 'SUCCESS') { setLockedRules(res.data.rules || []); setSaveMsg('Locked rule saved.'); setSelDatabase(''); setSelDataset(''); setSelColumn(''); setReason(''); }
      else setSaveMsg(res.data.message || 'Save failed.');
    } catch { setSaveMsg('Save failed — check backend.'); }
  };

  const deleteLockedRule = async (col) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete locked rule for "${col}"?`)) return;
    try {
      const res = await axios.delete(`${API_BASE_URL}/admin-locked-rules/${col}`, { params: { user_role: currentUser?.role } });
      if (res.data.status === 'SUCCESS') { setLockedRules(res.data.rules || []); setSaveMsg(`Rule for "${col}" deleted.`); }
    } catch { setSaveMsg('Delete failed.'); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Masking Rules"
        description="Manage masking rules across all source databases — global policies, column-level assignments, and admin-locked overrides."
        icon={SlidersHorizontal}
      />

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={Database}  label="Databases"     value={Object.keys(dbGroups).length} helper="Connected sources" />
        <MetricCard icon={Table2}    label="Total Columns" value={totalColumns}                  helper="Across all tables" />
        <MetricCard icon={AlertTriangle} label="PII Columns" value={piiColumns}               helper="Require masking" />
        <MetricCard icon={Lock}      label="Admin Locked"  value={activeLockedRules.length}      helper="Developer restricted" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-slate-200">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeSection === s.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
            {s.badge > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                {s.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Rule Catalog (real data) ── */}
      {activeSection === 'catalog' &&
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">Rule Catalog</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">All source databases, tables, and their column masking rules.</p>
          </div>
          <button onClick={fetchAll} className="text-[12px] text-indigo-600 hover:underline">Refresh</button>
        </div>

        {loading && <p className="py-8 text-center text-[13px] text-slate-400">Loading…</p>}

        {!loading && Object.entries(dbGroups).map(([dbName, tables]) => {
          const isDbOpen = expandedDbs.has(dbName);
          const dbPii = Object.values(tables).reduce((s, d) => s + (d.columns || []).filter((c) => c.pii).length, 0);

          return (
            <div key={dbName} className="border-b border-slate-100 last:border-0">
              {/* DB row */}
              <button
                onClick={() => toggleDb(dbName)}
                className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                {isDbOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <Database size={14} className="text-indigo-400 flex-shrink-0" />
                <span className="flex-1 text-[13px] font-semibold text-slate-800">{dbName}</span>
                <span className="text-[11px] text-slate-400">{Object.keys(tables).length} tables</span>
                {dbPii > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{dbPii} PII</span>
                )}
              </button>

              {/* Tables */}
              {isDbOpen && Object.entries(tables).map(([tableName, dataset]) => {
                const tblKey = `${dbName}::${tableName}`;
                const isTblOpen = expandedTbls.has(tblKey);
                const tblPii = (dataset.columns || []).filter((c) => c.pii).length;
                const lockedForTable = lockedRules.filter((lr) => lr.enabled && (dataset.columns || []).some((c) => c.name === lr.column));

                return (
                  <div key={tableName} className="border-t border-slate-100 bg-slate-50/50">
                    {/* Table row */}
                    <button
                      onClick={() => toggleTbl(tblKey)}
                      className="flex w-full items-center gap-3 px-8 py-3 text-left hover:bg-slate-100/60 transition-colors"
                    >
                      {isTblOpen ? <ChevronDown size={12} className="text-slate-300" /> : <ChevronRight size={12} className="text-slate-300" />}
                      <Table2 size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="flex-1 text-[13px] font-medium text-slate-700">{tableName}</span>
                      <span className="text-[11px] text-slate-400">{dataset.columns?.length || 0} cols</span>
                      {tblPii > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{tblPii} PII</span>
                      )}
                      {lockedForTable.length > 0 && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                          {lockedForTable.length} locked
                        </span>
                      )}
                    </button>

                    {/* Columns */}
                    {isTblOpen && (
                      <div className="overflow-x-auto border-t border-slate-100">
                        <table className="w-full text-left text-[12px]">
                          <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="px-10 py-2">Column</th>
                              <th className="px-4 py-2">Type</th>
                              <th className="px-4 py-2">PII</th>
                              <th className="px-4 py-2">Masking Rule</th>
                              <th className="px-4 py-2">Override</th>
                              <th className="px-4 py-2">Tag</th>
                              <th className="px-4 py-2">Admin Lock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 bg-white">
                            {(dataset.columns || []).map((col) => {
                              const tag = getTag(col);
                              const locked = lockedRules.find((lr) => lr.enabled && lr.column === col.name);
                              return (
                                <tr key={col.name} className="hover:bg-slate-50">
                                  <td className="px-10 py-2.5 font-medium text-slate-900">{col.name}</td>
                                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{col.type}</td>
                                  <td className="px-4 py-2.5">
                                    {col.pii
                                      ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">PII</span>
                                      : <span className="text-slate-300">—</span>
                                    }
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RULE_COLORS[locked?.rule || col.rule] || RULE_COLORS['No Masking']}`}>
                                      {locked?.rule || col.rule || 'No Masking'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {locked
                                      ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">Locked</span>
                                      : col.override_allowed !== false
                                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Allowed</span>
                                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Restricted</span>
                                    }
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_COLORS[tag]}`}>{tag}</span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {locked
                                      ? <span className="flex items-center gap-1 text-[10px] text-rose-600"><Lock size={10} /> {locked.locked_by || 'Admin'}</span>
                                      : <span className="text-slate-300">—</span>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {!loading && Object.keys(dbGroups).length === 0 && (
          <p className="py-8 text-center text-[13px] text-slate-400">No datasets loaded. Restart backend and refresh.</p>
        )}
      </div>}

      {/* ── Admin Locked Rules ── */}
      {activeSection === 'locked' &&
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">Admin Locked Rules</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Rules that developers cannot override during pipeline execution.</p>
          </div>
          {isAdmin && (
            <Button onClick={saveLockedRule} className="rounded-xl text-[13px]">Save Locked Rule</Button>
          )}
        </div>

        {!isAdmin && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-700">
            You are logged in as Developer — locked rules are view-only.
          </div>
        )}

        {/* Form */}
        {isAdmin && (
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-[12px] font-medium text-slate-600">Database</label>
                <select
                  value={selDatabase}
                  onChange={(e) => { setSelDatabase(e.target.value); setSelDataset(''); setSelColumn(''); }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none"
                >
                  <option value="">Select database</option>
                  {[...new Set(datasets.map((d) => d.database_name).filter(Boolean))].map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600">Table</label>
                <select
                  value={selDataset}
                  onChange={(e) => { setSelDataset(e.target.value); setSelColumn(''); }}
                  disabled={!selDatabase}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select table</option>
                  {datasets.filter((d) => d.database_name === selDatabase).map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>{d.table_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600">Column to Lock</label>
                <select
                  value={selColumn}
                  onChange={(e) => setSelColumn(e.target.value)}
                  disabled={!selDataset}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select column</option>
                  {availableColumns.map((c) => <option key={c.name} value={c.name}>{c.name} {c.pii ? '(PII)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600">Locked Rule</label>
                <select
                  value={selRule}
                  onChange={(e) => setSelRule(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none"
                >
                  {MASKING_RULE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600">Developer Override</label>
                <select
                  value={devOverride ? 'Allowed' : 'Not Allowed'}
                  onChange={(e) => setDevOverride(e.target.value === 'Allowed')}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none"
                >
                  <option>Not Allowed</option>
                  <option>Allowed</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[12px] font-medium text-slate-600">Reason <span className="text-rose-400">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this rule locked for developers?"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none"
              />
            </div>
            {saveMsg && (
              <div className={`mt-3 rounded-xl px-4 py-2.5 text-[13px] ${saveMsg.includes('saved') || saveMsg.includes('deleted') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {saveMsg}
              </div>
            )}
          </div>
        )}

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={ruleSearch}
              onChange={(e) => setRuleSearch(e.target.value)}
              placeholder="Search column or reason…"
              className="w-52 rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-indigo-300"
            />
          </div>
          <select
            value={ruleFilterType}
            onChange={(e) => setRuleFilterType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 outline-none"
          >
            <option value="">All Rules</option>
            {MASKING_RULE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={ruleFilterOverride}
            onChange={(e) => setRuleFilterOverride(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 outline-none"
          >
            <option value="">All Override</option>
            <option value="allowed">Dev Allowed</option>
            <option value="restricted">Restricted</option>
          </select>
          <select
            value={ruleFilterStatus}
            onChange={(e) => setRuleFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600 outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {(ruleSearch || ruleFilterType || ruleFilterOverride || ruleFilterStatus) && (
            <button
              onClick={() => { setRuleSearch(''); setRuleFilterType(''); setRuleFilterOverride(''); setRuleFilterStatus(''); }}
              className="text-[12px] text-indigo-600 hover:underline"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[12px] text-slate-400">{filteredLockedRules.length} of {lockedRules.length} rules</span>
        </div>

        {/* Locked rules table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Column</th>
                <th className="px-6 py-3">Locked Rule</th>
                <th className="px-6 py-3">Dev Override</th>
                <th className="px-6 py-3">Locked By</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3">Status</th>
                {isAdmin && <th className="px-6 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLockedRules.length === 0 && (
                <tr><td colSpan="7" className="px-6 py-6 text-slate-400">{lockedRules.length === 0 ? 'No locked rules yet.' : 'No rules match your filters.'}</td></tr>
              )}
              {filteredLockedRules.map((rule) => (
                <tr key={rule.column} className="hover:bg-slate-50">
                  <td className="px-6 py-3.5 font-mono font-medium text-slate-900">{rule.column}</td>
                  <td className="px-6 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RULE_COLORS[rule.rule] || 'bg-slate-100 text-slate-600'}`}>{rule.rule}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rule.developer_can_override ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {rule.developer_can_override ? 'Allowed' : 'Restricted'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-600">{rule.locked_by || 'Admin'}</td>
                  <td className="px-6 py-3.5 text-slate-500 max-w-[200px] truncate" title={rule.reason}>{rule.reason}</td>
                  <td className="px-6 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rule.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {rule.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-3.5">
                      <button onClick={() => deleteLockedRule(rule.column)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Global Rules ── */}
      {activeSection === 'global' &&
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">Global Masking Policies</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Default rules applied across all datasets unless overridden at column level.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{globalRules.length} active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Rule Name</th>
                <th className="px-6 py-3">Rule Type</th>
                <th className="px-6 py-3">Condition</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {globalRules.map((rule) => (
                <tr key={rule.name} className="hover:bg-slate-50">
                  <td className="px-6 py-3.5 font-medium text-slate-900">{rule.name}</td>
                  <td className="px-6 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RULE_COLORS[rule.ruleType] || 'bg-slate-100 text-slate-600'}`}>{rule.ruleType}</span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-500">{rule.condition}</td>
                  <td className="px-6 py-3.5">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{rule.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
