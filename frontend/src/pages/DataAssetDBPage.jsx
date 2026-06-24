import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Database, ArrowLeft, Table2, ChevronRight, AlertTriangle,
  CheckCircle2, ScanLine, GitBranch, Users, ExternalLink, Download,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { API_BASE_URL } from '../lib/constants';

const MASKING_RULES = ['No Masking', 'Hash', 'Fake Value', 'Partial Masking', 'Date Shift'];

const ENV_COLORS = {
  PROD: 'bg-red-50 text-red-600',
  UAT:  'bg-yellow-50 text-yellow-600',
  DEV:  'bg-green-50 text-green-700',
};

const TABS = [
  { key: 'tables',     label: 'Tables' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'versions',   label: 'Schema Versions' },
  { key: 'drift', label: 'Drift Inbox' },
];

function computeSnapshotDiff(prevSnapshot, currSnapshot) {
  const prev = prevSnapshot || {};
  const curr = currSnapshot || {};
  const allTables = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const byTable = [];
  let totalAdded = 0, totalRemoved = 0, totalTypeChanged = 0;

  for (const table of allTables) {
    const prevCols = prev[table] || [];
    const currCols = curr[table] || [];
    const prevMap = Object.fromEntries(prevCols.map(c => [c.name, c.type]));
    const currMap = Object.fromEntries(currCols.map(c => [c.name, c.type]));
    const added = currCols.filter(c => !prevMap[c.name]);
    const removed = prevCols.filter(c => !currMap[c.name]);
    const typeChanged = currCols
      .filter(c => prevMap[c.name] && prevMap[c.name] !== c.type)
      .map(c => ({ column: c.name, from: prevMap[c.name], to: c.type }));

    if (added.length || removed.length || typeChanged.length) {
      byTable.push({ table, added, removed, typeChanged });
      totalAdded += added.length;
      totalRemoved += removed.length;
      totalTypeChanged += typeChanged.length;
    }
  }

  return { byTable, totalAdded, totalRemoved, totalTypeChanged };
}

function downloadVersionJson(version) {
  const blob = new Blob([JSON.stringify(version, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${version.version_label}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const driftBadgeClass = (type) => {
  if (type === 'BREAKING_DRIFT') return 'bg-rose-50 text-rose-700';
  if (type === 'ADDITIVE_DRIFT') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

const msgStyles = {
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-100 bg-amber-50 text-amber-700',
  error: 'border-rose-100 bg-rose-50 text-rose-700',
};

export default function DataAssetDBPage() {
  const { connectionId } = useParams();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState([]);
  const [sandboxes, setSandboxes] = useState([]);
  const [versions, setVersions] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tables');

  const [reviewState, setReviewState] = useState({});
  const [acting, setActing] = useState(null);
  const [expandedDiffTables, setExpandedDiffTables] = useState({});
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dsRes, sbRes, vRes, ibRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/datasets`),
        axios.get(`${API_BASE_URL}/sandboxes`),
        axios.get(`${API_BASE_URL}/metadata/versions`),
        axios.get(`${API_BASE_URL}/drift-inbox`),
      ]);
      setDatasets(dsRes.data.datasets || []);
      setSandboxes(sbRes.data.sandboxes || []);
      setVersions(vRes.data.versions || []);
      setInbox((ibRes.data.reviews || []).filter((r) => r.status === 'PENDING_REVIEW'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // tables belonging to this DB
  const dbTables = datasets
    .filter((d) => d.connection_id === connectionId)
    .map((d) => {
      const sb = d.sandbox_id ? sandboxes.find((s) => s.sandbox_id === d.sandbox_id) : null;
      const av = sb ? versions.find((v) => v.metadata_version_id === sb.active_metadata_version_id) : null;
      const pending = sb ? inbox.filter((r) => r.sandbox_id === sb.sandbox_id) : [];
      return { ...d, sandbox: sb, activeVersion: av, pendingCount: pending.length, piiCount: (d.columns || []).filter((c) => c.pii).length };
    });

  const dbName = dbTables[0]?.database_name || connectionId;

  // representative sandbox for this DB (first one found)
  const repSandbox = dbTables.find((t) => t.sandbox)?.sandbox || null;

  // workspace versions for this DB's sandbox
  const workspaceVersions = repSandbox
    ? [...versions]
        .filter((v) => v.project_id === repSandbox.project_id && v.target_environment === repSandbox.target_environment)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    : [];

  const activeVersion = repSandbox
    ? versions.find((v) => v.metadata_version_id === repSandbox.active_metadata_version_id)
    : null;

  // drift inbox for this DB's sandbox
  const dbInbox = repSandbox
    ? inbox.filter((r) => r.sandbox_id === repSandbox.sandbox_id)
    : [];

  const totalPii = dbTables.reduce((s, t) => s + t.piiCount, 0);
  const totalDrift = dbTables.reduce((s, t) => s + t.pendingCount, 0);

  // drift review state helpers
  const initReviewState = (review) => {
    const added = review.diff?.added || [];
    const rules = {};
    added.forEach((col) => { rules[col] = review.suggested_rules?.[col] || 'No Masking'; });
    setReviewState((prev) => ({
      ...prev,
      [review.review_id]: { acceptedCols: new Set(added), rules, acceptRemoved: false, acceptTypeChanges: false, changeSummary: '', rejecting: false, rejectReason: '' },
    }));
  };

  useEffect(() => {
    dbInbox.forEach((r) => { if (!reviewState[r.review_id]) initReviewState(r); });
  }, [dbInbox.length]);

  const rs = (id) => reviewState[id] || {};
  const setRs = (id, patch) => setReviewState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const scanDrift = async () => {
    if (!repSandbox) { setScanMsg({ type: 'warn', text: 'No workspace linked to this database — drift detection unavailable.' }); return; }
    setScanning(true); setScanMsg(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/drift-inbox/detect`, { sandbox_id: repSandbox.sandbox_id });
      if (res.data.status === 'NO_DRIFT') {
        setScanMsg({ type: 'success', text: res.data.message });
      } else if (res.data.status === 'PENDING_REVIEW') {
        const dt = res.data.review?.drift_type;
        setScanMsg({ type: 'warn', text: `${dt === 'BREAKING_DRIFT' ? 'Breaking' : 'Additive'} drift detected — review required.` });
        await fetchAll();
        setActiveTab('drift');
      } else {
        setScanMsg({ type: 'error', text: res.data.message || 'Scan failed.' });
      }
    } catch (err) {
      setScanMsg({ type: 'error', text: err.response?.data?.message || 'Scan failed.' });
    } finally {
      setScanning(false);
    }
  };

  const approveDrift = async (reviewId) => {
    const state = rs(reviewId);
    setActing(reviewId);
    try {
      const res = await axios.post(`${API_BASE_URL}/drift-inbox/${reviewId}/approve`, {
        accepted_columns: Array.from(state.acceptedCols || []),
        new_column_rules: state.rules || {},
        accept_removed: state.acceptRemoved || false,
        accept_type_changes: state.acceptTypeChanges || false,
        change_summary: state.changeSummary || '',
      });
      if (res.data.status === 'SUCCESS') { setScanMsg({ type: 'success', text: res.data.message }); await fetchAll(); }
      else setScanMsg({ type: 'error', text: res.data.message });
    } catch (err) {
      setScanMsg({ type: 'error', text: err.response?.data?.message || 'Approve failed.' });
    } finally { setActing(null); }
  };

  const rejectDrift = async (reviewId) => {
    const state = rs(reviewId);
    if (!state.rejectReason?.trim()) { setScanMsg({ type: 'error', text: 'Enter a rejection reason.' }); return; }
    setActing(reviewId);
    try {
      const res = await axios.post(`${API_BASE_URL}/drift-inbox/${reviewId}/reject`, { reason: state.rejectReason.trim() });
      if (res.data.status === 'SUCCESS') { setScanMsg({ type: 'success', text: 'Drift review rejected.' }); await fetchAll(); }
      else setScanMsg({ type: 'error', text: res.data.message });
    } catch (err) {
      setScanMsg({ type: 'error', text: 'Reject failed.' });
    } finally { setActing(null); }
  };

  if (loading) return <div className="p-8 text-[13px] text-slate-400">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <button
        onClick={() => navigate('/admin/data-classification')}
        className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft size={14} /> Back to Data Assets
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-100 p-2">
                <Database size={16} className="text-indigo-600" />
              </div>
              <h1 className="text-[18px] font-bold text-slate-900">{dbName}</h1>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{connectionId}</span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">Connected</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{dbTables.length} tables</span>
              {totalPii > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{totalPii} PII cols</span>}
              {activeVersion && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{activeVersion.version_label} ACTIVE</span>}
              {repSandbox && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">{repSandbox.project_id} · {repSandbox.target_environment}</span>}
            </div>
          </div>
          <button
            onClick={scanDrift}
            disabled={scanning || !repSandbox}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <ScanLine size={14} />
            {scanning ? 'Scanning…' : 'Scan for Drift'}
          </button>
        </div>
        {scanMsg && (
          <div className={`mt-3 rounded-xl border px-4 py-2.5 text-[13px] ${msgStyles[scanMsg.type]}`}>
            {scanMsg.text}
          </div>
        )}
        {!repSandbox && (
          <p className="mt-2 text-[11px] text-slate-400">No workspace linked — schema versioning and drift detection are not available for this database.</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.key === 'drift' && totalDrift > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{totalDrift}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tables tab ── */}
      {activeTab === 'tables' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {dbTables.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">No tables found for this database.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Table</th>
                  <th className="px-5 py-3">Rows</th>
                  <th className="px-5 py-3">Columns</th>
                  <th className="px-5 py-3">PII</th>
                  <th className="px-5 py-3">Version</th>
                  <th className="px-5 py-3">Drift</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dbTables.map((t) => (
                  <tr
                    key={t.dataset_id}
                    className="group cursor-pointer hover:bg-indigo-50/40 transition-colors"
                    onClick={() => navigate(`/admin/data-assets/${connectionId}/table/${t.dataset_id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Table2 size={13} className="flex-shrink-0 text-slate-300" />
                        <span className="font-medium text-slate-900">{t.table_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{t.row_count?.toLocaleString() || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{t.columns?.length || 0}</td>
                    <td className="px-5 py-3.5">
                      {t.piiCount > 0
                        ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{t.piiCount} cols</span>
                        : <span className="text-slate-300">None</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      {t.activeVersion
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{t.activeVersion.version_label}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      {t.pendingCount > 0
                        ? <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><AlertTriangle size={10} />{t.pendingCount}</span>
                        : <span className="flex items-center gap-1 text-[11px] text-slate-300"><CheckCircle2 size={11} /> Clean</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Workspaces tab ── */}
      {activeTab === 'workspaces' && (() => {
        // collect unique sandboxes linked to this DB's datasets
        const linkedSandboxes = dbTables
          .filter((t) => t.sandbox)
          .reduce((acc, t) => {
            if (!acc.find((s) => s.sandbox_id === t.sandbox.sandbox_id)) acc.push(t.sandbox);
            return acc;
          }, []);

        return (
          <div className="space-y-4">
            {linkedSandboxes.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-400">
                No workspaces are linked to this database yet.
              </div>
            ) : linkedSandboxes.map((sb) => {
              const sbVersion = versions.find((v) => v.metadata_version_id === sb.active_metadata_version_id);
              const sbTables  = dbTables.filter((t) => t.sandbox?.sandbox_id === sb.sandbox_id);
              const sbDrift   = sbTables.reduce((s, t) => s + t.pendingCount, 0);
              return (
                <div key={sb.sandbox_id} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-indigo-50 p-2.5">
                        <Users size={16} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-slate-900">{sb.project_id}</h3>
                        <p className="mt-0.5 text-[12px] text-slate-400">{sb.sandbox_schema}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ENV_COLORS[sb.target_environment] || 'bg-slate-100 text-slate-500'}`}>
                            {sb.target_environment}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                            Owner: {sb.owner}
                          </span>
                          {sbVersion && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              {sbVersion.version_label} ACTIVE
                            </span>
                          )}
                          {sbDrift > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              <AlertTriangle size={10} /> {sbDrift} drift pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/workspaces/${sb.sandbox_id}`)}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      Open Workspace <ExternalLink size={12} />
                    </button>
                  </div>

                  {/* Tables used by this workspace */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tables in this workspace</p>
                    <div className="flex flex-wrap gap-2">
                      {sbTables.map((t) => (
                        <span
                          key={t.dataset_id}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700"
                        >
                          <Table2 size={11} className="text-slate-300" />
                          {t.table_name}
                          {t.piiCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">{t.piiCount}P</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Schema Versions tab ── */}
      {activeTab === 'versions' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          {!repSandbox ? (
            <p className="text-[13px] text-slate-400">No workspace linked — schema versioning not available.</p>
          ) : workspaceVersions.length === 0 ? (
            <p className="text-[13px] text-slate-400">No metadata versions yet for this database.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <GitBranch size={14} className="text-indigo-500" />
                <p className="text-[13px] font-semibold text-slate-800">
                  {repSandbox.project_id} / {repSandbox.target_environment} — Version History
                </p>
              </div>
              <div className="space-y-3">
                {workspaceVersions.map((v) => {
                  const prevVersion = v.predecessor_metadata_version_id
                    ? workspaceVersions.find(w => w.metadata_version_id === v.predecessor_metadata_version_id)
                    : null;
                  const diff = prevVersion
                    ? computeSnapshotDiff(prevVersion.metadata_snapshot, v.metadata_snapshot)
                    : null;

                  return (
                    <div key={v.metadata_version_id} className={`rounded-xl border p-4 ${v.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-bold ${v.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-700'}`}>{v.version_label}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v.status}</span>
                          {prevVersion && (
                            <span className="text-[11px] text-slate-400">← {prevVersion.version_label}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-400">{v.table_count}t · {v.column_count}c · {v.created_at ? new Date(v.created_at).toLocaleDateString() : '—'}</span>
                          <button
                            onClick={() => downloadVersionJson(v)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors"
                            title={`Download ${v.version_label} JSON`}
                          >
                            <Download size={11} />
                            JSON
                          </button>
                        </div>
                      </div>

                      {/* Change summary */}
                      {v.change_summary && (
                        <p className="mt-2 text-[12px] text-slate-500">{v.change_summary}</p>
                      )}

                      {/* Drift diff — grouped by table */}
                      {diff ? (
                        diff.byTable.length === 0 ? (
                          <p className="mt-3 text-[11px] text-emerald-600 italic">No schema changes from {prevVersion.version_label}.</p>
                        ) : (
                          <div className="mt-3 space-y-1">
                            {/* Summary bar */}
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[11px] text-slate-500">{diff.byTable.length} table{diff.byTable.length !== 1 ? 's' : ''} changed</span>
                              {diff.totalAdded > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">+{diff.totalAdded} added</span>}
                              {diff.totalRemoved > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">−{diff.totalRemoved} removed</span>}
                              {diff.totalTypeChanged > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{diff.totalTypeChanged} type changed</span>}
                            </div>
                            {/* Per-table rows */}
                            {diff.byTable.map(({ table, added, removed, typeChanged }) => {
                              const key = `${v.metadata_version_id}::${table}`;
                              const expanded = expandedDiffTables[key];
                              return (
                                <div key={table} className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                                  <button
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100 transition-colors"
                                    onClick={() => setExpandedDiffTables(s => ({ ...s, [key]: !s[key] }))}
                                  >
                                    <span className="font-mono text-[12px] font-medium text-slate-700">{table}</span>
                                    <div className="flex items-center gap-2">
                                      {added.length > 0 && <span className="text-[10px] text-emerald-600">+{added.length}</span>}
                                      {removed.length > 0 && <span className="text-[10px] text-rose-600">−{removed.length}</span>}
                                      {typeChanged.length > 0 && <span className="text-[10px] text-amber-600">~{typeChanged.length}</span>}
                                      <ChevronRight size={12} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                    </div>
                                  </button>
                                  {expanded && (
                                    <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                                      <div>
                                        <p className="text-[10px] font-semibold text-emerald-700 mb-1">Added</p>
                                        {added.length === 0 ? <p className="text-[10px] text-slate-400">—</p>
                                          : added.map(c => <p key={c.name} className="text-[11px] font-mono text-slate-700">{c.name} <span className="text-slate-400">({c.type})</span></p>)}
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold text-rose-700 mb-1">Removed</p>
                                        {removed.length === 0 ? <p className="text-[10px] text-slate-400">—</p>
                                          : removed.map(c => <p key={c.name} className="text-[11px] font-mono text-slate-700">{c.name} <span className="text-slate-400">({c.type})</span></p>)}
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold text-amber-700 mb-1">Type Changed</p>
                                        {typeChanged.length === 0 ? <p className="text-[10px] text-slate-400">—</p>
                                          : typeChanged.map(c => <p key={c.column} className="text-[11px] font-mono text-slate-700">{c.column}: <span className="text-rose-500">{c.from}</span>→<span className="text-emerald-600">{c.to}</span></p>)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <p className="mt-3 text-[11px] text-slate-400 italic">Initial snapshot — no previous version to diff against.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Drift Inbox tab ── */}
      {activeTab === 'drift' && (
        <div className="space-y-4">
          {dbInbox.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-400">
              No pending drift reviews. Click "Scan for Drift" to check for schema changes.
            </div>
          ) : dbInbox.map((review) => {
            const state = rs(review.review_id);
            const diff = review.diff || {};
            const added = diff.added || [];
            const removed = diff.removed || [];
            const typeChanged = diff.type_changed || [];
            const isActing = acting === review.review_id;

            return (
              <div key={review.review_id} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${driftBadgeClass(review.drift_type)}`}>
                    {review.drift_type === 'BREAKING_DRIFT' ? 'Breaking Drift' : 'Additive Drift'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    vs {review.last_approved_version_label} · {new Date(review.detected_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="grid gap-3 grid-cols-3">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-[11px] font-semibold text-emerald-700">Added ({added.length})</p>
                    {added.length === 0 && <p className="mt-1 text-[11px] text-slate-400">None</p>}
                    {(diff.added_detail || added.map((c) => ({ column: c, type: '' }))).map((c) => (
                      <p key={c.column} className="mt-1 text-[12px] text-slate-700">{c.column}{c.type ? ` (${c.type})` : ''}</p>
                    ))}
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[11px] font-semibold text-rose-700">Removed ({removed.length})</p>
                    {removed.length === 0 && <p className="mt-1 text-[11px] text-slate-400">None</p>}
                    {removed.map((c) => <p key={c} className="mt-1 text-[12px] text-slate-700">{c}</p>)}
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold text-amber-700">Type Changed ({typeChanged.length})</p>
                    {typeChanged.length === 0 && <p className="mt-1 text-[11px] text-slate-400">None</p>}
                    {typeChanged.map((c) => <p key={c.column} className="mt-1 text-[12px] text-slate-700">{c.column}: {c.from} → {c.to}</p>)}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[12px] font-semibold text-slate-700">Review & Resolve</p>
                  {added.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] text-slate-500">Select new columns to include:</p>
                      <div className="space-y-2">
                        {added.map((col) => (
                          <div key={col} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={state.acceptedCols?.has(col) ?? true}
                                onChange={(e) => {
                                  const s = new Set(state.acceptedCols || []);
                                  e.target.checked ? s.add(col) : s.delete(col);
                                  setRs(review.review_id, { acceptedCols: s });
                                }}
                              />
                              <span className="font-mono text-[13px] text-slate-800">{col}</span>
                            </label>
                            {(state.acceptedCols?.has(col) ?? true) && (
                              <select
                                value={state.rules?.[col] || 'No Masking'}
                                onChange={(e) => setRs(review.review_id, { rules: { ...state.rules, [col]: e.target.value } })}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] outline-none"
                              >
                                {MASKING_RULES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {removed.length > 0 && (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                      <input type="checkbox" checked={state.acceptRemoved || false} onChange={(e) => setRs(review.review_id, { acceptRemoved: e.target.checked })} className="mt-0.5" />
                      <span className="text-[13px] text-slate-700">Accept removal of: <strong>{removed.join(', ')}</strong></span>
                    </label>
                  )}
                  {typeChanged.length > 0 && (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                      <input type="checkbox" checked={state.acceptTypeChanges || false} onChange={(e) => setRs(review.review_id, { acceptTypeChanges: e.target.checked })} className="mt-0.5" />
                      <span className="text-[13px] text-slate-700">Accept type changes: <strong>{typeChanged.map((c) => `${c.column} (${c.from}→${c.to})`).join(', ')}</strong></span>
                    </label>
                  )}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Change Summary <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={state.changeSummary || ''}
                      onChange={(e) => setRs(review.review_id, { changeSummary: e.target.value })}
                      placeholder="Why are you approving this change?"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={() => approveDrift(review.review_id)} disabled={isActing} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-[13px]">
                      {isActing ? 'Working…' : 'Approve & Create Version'}
                    </Button>
                    <Button variant="outline" onClick={() => setRs(review.review_id, { rejecting: !state.rejecting })} className="rounded-xl text-[13px]">
                      Reject
                    </Button>
                  </div>
                  {state.rejecting && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={state.rejectReason || ''}
                        onChange={(e) => setRs(review.review_id, { rejectReason: e.target.value })}
                        placeholder="Reason for rejection…"
                        className="flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[13px] outline-none"
                      />
                      <Button onClick={() => rejectDrift(review.review_id)} disabled={isActing} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-[13px]">
                        Confirm Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
