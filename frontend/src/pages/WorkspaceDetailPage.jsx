import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  Briefcase, Users, Network, Play, Clock, Shield,
  ChevronRight, ArrowLeft, CheckCircle2, AlertCircle,
  Database, FileText, Activity, History, Search, Filter,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { blueprintPipelines, maskedAssetSamples, connectorTableData, sampleColumns } from '../lib/constants';
import { useConnectors } from '../context/ConnectorsContext';
import { useWorkspaces } from '../context/WorkspacesContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/constants';
import DataInventoryPage from './DataInventoryPage';
import DataClassificationPage from './DataClassificationPage';
import MaskingRulesPage from './MaskingRulesPage';
import CreatePipelinePage from './CreatePipelinePage';
import ExistingPipelinesPage from './ExistingPipelinesPage';
import MaskedAssetsPage from './MaskedAssetsPage';
import JobHistoryPage from './JobHistoryPage';

const STATUS_BADGE = {
  Ready: 'bg-emerald-50 text-emerald-700',
  Draft: 'bg-slate-100 text-slate-600',
  'In Review': 'bg-yellow-50 text-yellow-700',
  Connected: 'bg-emerald-50 text-emerald-700',
  Disconnected: 'bg-red-50 text-red-700',
};

const TABS = [
  { label: 'Overview',          tab: '' },
  { label: 'Members',           tab: 'members' },
  { label: 'Connectors',        tab: 'connectors' },
  { label: 'Data Inventory',    tab: 'data-inventory' },
  { label: 'Data Assets',       tab: 'data-assets' },
  { label: 'Masking Rules',     tab: 'masking-rules' },
  { label: 'Subsetting',        tab: 'subsetting' },
  { label: 'Pipelines',         tab: 'pipelines' },
  { label: 'Masked Assets',     tab: 'masked-assets' },
  { label: 'Jobs',              tab: 'jobs' },
  { label: 'Job History',       tab: 'job-history' },
  { label: 'Schema Versions',   tab: 'schema-versions' },
  { label: 'Legacy Classification', tab: 'data-classification' },
];

const MASKING_RULES = ['No Masking', 'Hash', 'Fake Value', 'Partial Masking', 'Date Shift'];

const driftBadgeClass = (type) => {
  if (type === 'BREAKING_DRIFT') return 'bg-rose-50 text-rose-700';
  if (type === 'ADDITIVE_DRIFT') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

function SchemaVersionsTab({ workspace }) {
  const [sandboxes, setSandboxes] = useState([]);
  const [selectedSandboxId, setSelectedSandboxId] = useState('');
  const [versions, setVersions] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [reviewState, setReviewState] = useState({});
  const [acting, setActing] = useState(null);

  const fetchData = async (sandboxId) => {
    try {
      const [sandboxRes, versionsRes, inboxRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/sandboxes`),
        axios.get(`${API_BASE_URL}/metadata/versions`),
        axios.get(`${API_BASE_URL}/drift-inbox${sandboxId ? `?sandbox_id=${sandboxId}` : ''}`),
      ]);
      const sbList = sandboxRes.data.sandboxes || [];
      setSandboxes(sbList);
      setVersions(versionsRes.data.versions || []);
      setInbox((inboxRes.data.reviews || []).filter((r) => r.status === 'PENDING_REVIEW'));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchData(selectedSandboxId); }, [selectedSandboxId]);

  const selectedSandbox = sandboxes.find((s) => s.sandbox_id === selectedSandboxId);
  const activeVersion = selectedSandbox
    ? versions.find((v) => v.metadata_version_id === selectedSandbox.active_metadata_version_id)
    : null;

  // Per-workspace lineage
  const workspaceVersions = selectedSandbox
    ? [...versions]
        .filter((v) => v.project_id === selectedSandbox.project_id && v.target_environment === selectedSandbox.target_environment)
        .sort((a, b) => a.created_at?.localeCompare(b.created_at))
    : [];

  const sandboxInbox = selectedSandboxId
    ? inbox.filter((r) => r.sandbox_id === selectedSandboxId)
    : inbox;

  const initReviewState = (review) => {
    const added = review.diff?.added || [];
    const rules = {};
    added.forEach((col) => { rules[col] = review.suggested_rules?.[col] || 'No Masking'; });
    setReviewState((prev) => ({
      ...prev,
      [review.review_id]: {
        acceptedCols: new Set(added),
        rules,
        acceptRemoved: false,
        acceptTypeChanges: false,
        changeSummary: '',
        rejecting: false,
        rejectReason: '',
      },
    }));
  };

  useEffect(() => {
    sandboxInbox.forEach((r) => {
      if (!reviewState[r.review_id]) initReviewState(r);
    });
  }, [sandboxInbox.length]);

  const rs = (id) => reviewState[id] || {};
  const setRs = (id, patch) => setReviewState((prev) => ({
    ...prev,
    [id]: { ...prev[id], ...patch },
  }));

  const scanDrift = async () => {
    if (!selectedSandboxId) { setScanMsg({ type: 'warn', text: 'Select a data asset first.' }); return; }
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/drift-inbox/detect`, { sandbox_id: selectedSandboxId });
      if (res.data.status === 'NO_DRIFT') {
        setScanMsg({ type: 'success', text: res.data.message });
      } else if (res.data.status === 'PENDING_REVIEW') {
        setScanMsg({ type: 'warn', text: `${res.data.review.drift_type === 'BREAKING_DRIFT' ? 'Breaking' : 'Additive'} drift detected. Review below.` });
        await fetchData(selectedSandboxId);
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
      if (res.data.status === 'SUCCESS') {
        setScanMsg({ type: 'success', text: res.data.message });
        await fetchData(selectedSandboxId);
      } else {
        setScanMsg({ type: 'error', text: res.data.message });
      }
    } catch (err) {
      setScanMsg({ type: 'error', text: err.response?.data?.message || 'Approve failed.' });
    } finally {
      setActing(null);
    }
  };

  const rejectDrift = async (reviewId) => {
    const state = rs(reviewId);
    if (!state.rejectReason?.trim()) { setScanMsg({ type: 'error', text: 'Enter a rejection reason.' }); return; }
    setActing(reviewId);
    try {
      const res = await axios.post(`${API_BASE_URL}/drift-inbox/${reviewId}/reject`, {
        reason: state.rejectReason.trim(),
      });
      if (res.data.status === 'SUCCESS') {
        setScanMsg({ type: 'success', text: 'Drift review rejected. Active version unchanged.' });
        await fetchData(selectedSandboxId);
      } else {
        setScanMsg({ type: 'error', text: res.data.message });
      }
    } catch (err) {
      setScanMsg({ type: 'error', text: 'Reject failed.' });
    } finally {
      setActing(null);
    }
  };

  const msgStyles = {
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-100 bg-amber-50 text-amber-700',
    error: 'border-rose-100 bg-rose-50 text-rose-700',
  };

  return (
    <div className="space-y-6">
      {/* Asset selector + active version header */}
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Data Asset (Workspace)</label>
              <select
                value={selectedSandboxId}
                onChange={(e) => { setSelectedSandboxId(e.target.value); setScanMsg(null); }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              >
                <option value="">Select a data asset…</option>
                {sandboxes.map((s) => (
                  <option key={s.sandbox_id} value={s.sandbox_id}>
                    {s.project_id} — {s.target_environment} ({s.owner})
                  </option>
                ))}
              </select>
            </div>

            {activeVersion && (
              <div className="flex flex-wrap gap-2 md:justify-end">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  Active: {activeVersion.version_label}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600">
                  {activeVersion.table_count} tables · {activeVersion.column_count} columns
                </span>
              </div>
            )}

            <Button onClick={scanDrift} disabled={scanning || !selectedSandboxId} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2">
              <Search size={14} />
              {scanning ? 'Scanning…' : 'Scan for Drift'}
            </Button>
          </div>

          {scanMsg && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${msgStyles[scanMsg.type] || msgStyles.warn}`}>
              {scanMsg.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drift Inbox */}
      {sandboxInbox.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Drift Inbox</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {sandboxInbox.length} pending
            </span>
          </div>

          {sandboxInbox.map((review) => {
            const state = rs(review.review_id);
            const diff = review.diff || {};
            const added = diff.added || [];
            const removed = diff.removed || [];
            const typeChanged = diff.type_changed || [];
            const isActing = acting === review.review_id;

            return (
              <Card key={review.review_id} className="rounded-2xl border-amber-100">
                <CardContent className="p-5 space-y-4">
                  {/* Review header */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${driftBadgeClass(review.drift_type)}`}>
                          {review.drift_type === 'BREAKING_DRIFT' ? 'Breaking Drift' : 'Additive Drift'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          vs {review.last_approved_version_label} · {new Date(review.detected_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-slate-500">{review.project_id} — {review.target_environment}</p>
                    </div>
                  </div>

                  {/* Diff columns */}
                  <div className="grid gap-3 md:grid-cols-3">
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

                  {/* Resolution controls */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[12px] font-semibold text-slate-700">Review & Resolve</p>

                    {/* New columns — partial acceptance */}
                    {added.length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-2">Select which new columns to include in the next version:</p>
                        <div className="space-y-2">
                          {added.map((col) => (
                            <div key={col} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={state.acceptedCols?.has(col) ?? true}
                                  onChange={(e) => {
                                    const s = new Set(state.acceptedCols || []);
                                    e.target.checked ? s.add(col) : s.delete(col);
                                    setRs(review.review_id, { acceptedCols: s });
                                  }}
                                />
                                <span className="text-[13px] text-slate-800 font-mono">{col}</span>
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
                      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer">
                        <input type="checkbox" checked={state.acceptRemoved || false} onChange={(e) => setRs(review.review_id, { acceptRemoved: e.target.checked })} className="mt-0.5" />
                        <span className="text-[13px] text-slate-700">Accept removal of: <strong>{removed.join(', ')}</strong></span>
                      </label>
                    )}

                    {typeChanged.length > 0 && (
                      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Version history for selected asset */}
      {selectedSandbox && (
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">
              Version History — {selectedSandbox.project_id} / {selectedSandbox.target_environment}
            </h3>
            {workspaceVersions.length === 0 ? (
              <p className="text-[13px] text-slate-400">No metadata versions yet for this asset.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {workspaceVersions.map((v, idx) => (
                  <div key={v.metadata_version_id} className="flex items-center gap-1">
                    <div className={`rounded-xl border px-3 py-2 text-[12px] ${v.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${v.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'}`}>{v.version_label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{v.status}</span>
                      </div>
                      <p className="mt-1 max-w-[200px] truncate text-[11px] text-slate-500" title={v.change_summary}>{v.change_summary || '—'}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{v.table_count}t · {v.column_count}c · {v.created_at ? new Date(v.created_at).toLocaleDateString() : '—'}</p>
                    </div>
                    {idx < workspaceVersions.length - 1 && <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Derive slug from name for URL matching
function wsSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function OverviewTab({ workspace }) {
  const pipelines = blueprintPipelines.filter((p) => p.workspace === workspace.name);
  const assets = maskedAssetSamples.filter((a) => a.workspace === workspace.name);
  const totalTables = workspace.domains.reduce((s, d) => s + d.tables.length, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Domains', value: workspace.domains.length, icon: Database, helper: 'Business domains' },
          { label: 'Source Tables', value: totalTables, icon: FileText, helper: 'Across all domains' },
          { label: 'Pipelines', value: pipelines.length, icon: Play, helper: 'Configured pipelines' },
          { label: 'Masked Assets', value: assets.length, icon: Shield, helper: 'Output assets' },
        ].map((m) => (
          <Card key={m.label} className="rounded-2xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="p-2 rounded-xl bg-indigo-50">
                <m.icon size={18} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                <p className="text-sm font-medium text-slate-700">{m.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.helper}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Domains & Tables</h3>
          <div className="space-y-4">
            {workspace.domains.map((domain) => (
              <div key={domain.name} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-800 text-sm">{domain.name}</span>
                  <span className="text-xs text-slate-400">{domain.asset}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {domain.tables.map((t) => (
                    <span key={t} className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-600 font-mono">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {domain.pipelines.map((p) => (
                    <span key={p} className="text-xs bg-indigo-50 text-indigo-700 rounded-md px-2 py-1 flex items-center gap-1">
                      <Play size={10} /> {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersTab({ workspace }) {
  const members = workspace.members?.length
    ? workspace.members.map((m) => ({
        name: m.name || m.email,
        email: m.email,
        role: m.role || 'developer',
        joined: m.joined_at || workspace.date || '—',
      }))
    : [
        { name: workspace.owner || workspace.createdBy || 'Admin User', email: '', role: 'workspace_owner', joined: workspace.date || '—' },
      ];
  const ROLE_BADGE = {
    workspace_owner: 'bg-indigo-50 text-indigo-700',
    developer: 'bg-green-50 text-green-700',
    viewer: 'bg-slate-100 text-slate-600',
  };
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Workspace Members</h3>
          <Button variant="outline" className="rounded-xl text-xs">Invite Member</Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.email} className="bg-white">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                  <td className="px-4 py-3 text-slate-500">{m.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_BADGE[m.role]}`}>{m.role}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{m.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorTablePreview({ tableData }) {
  const [open, setOpen] = useState(false);
  if (!tableData) return null;
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        <Database size={12} /> {tableData.tables.length} tables available {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {tableData.tables.map((table) => (
            <div key={table.name} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <FileText size={13} className="text-indigo-500" />
                <span className="text-xs font-semibold text-slate-700">{table.name}</span>
                <span className="text-[10px] text-slate-400 ml-auto">{table.rows.length} rows shown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 text-slate-400 uppercase tracking-wide">
                    <tr>
                      {table.columns.map((col) => (
                        <th key={col} className="px-3 py-1.5 font-medium whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {table.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {table.columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectorsTab({ workspace }) {
  const { getConnectorsForWorkspace } = useConnectors();
  const wsConnectors = getConnectorsForWorkspace(workspace);
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Connectors</h3>
          <Button variant="outline" className="rounded-xl text-xs">Add Connector</Button>
        </div>
        <div className="space-y-4">
          {wsConnectors.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">No connectors assigned to this workspace.</div>
          ) : wsConnectors.map((conn) => {
            const tableData = connectorTableData[conn.connection];
            return (
              <div key={conn.name} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-white border border-slate-200">
                      <Network size={16} className="text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{conn.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{conn.connection}</p>
                      <p className="text-xs text-slate-400 mt-1">{conn.purpose}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[conn.status] || 'bg-slate-100 text-slate-500'}`}>
                      {conn.status}
                    </span>
                    <span className="text-xs text-slate-400">{conn.type} · {conn.sourceType}</span>
                  </div>
                </div>
                {conn.status === 'Connected' && <ConnectorTablePreview tableData={tableData} />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelinesTab({ workspace }) {
  const sessionPipelines = (() => {
    try { return JSON.parse(sessionStorage.getItem('tdm_pipelines') || '[]'); } catch { return []; }
  })();
  const allPipelines = [...blueprintPipelines, ...sessionPipelines.filter((sp) => !blueprintPipelines.some((bp) => bp.name === sp.name))];
  const pipelines = allPipelines.filter(
    (p) => p.workspace === workspace.name || p.workspace_id === workspace.id
  );
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Pipelines</h3>
          <Button variant="outline" className="rounded-xl text-xs">New Pipeline</Button>
        </div>
        {pipelines.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">No pipelines in this workspace yet.</div>
        ) : (
          <div className="space-y-3">
            {pipelines.map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-100 p-4 bg-slate-50 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500 mt-1">Source: {p.source} → Target: {p.target}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.tables.map((t) => (
                      <span key={t} className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-500 font-mono">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 ml-4 flex-shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[p.status] || 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                  <span className="text-xs text-slate-400">Last: {p.lastRun}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JobsTab({ workspace }) {
  const assets = maskedAssetSamples.filter((a) => a.workspace === workspace.name);
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Masked Output Jobs</h3>
        {assets.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">No jobs have run in this workspace yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Sandbox</th>
                  <th className="px-4 py-3 font-medium">Tables</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((a) => (
                  <tr key={a.asset} className="bg-white">
                    <td className="px-4 py-3 font-medium text-slate-800">{a.asset}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.sandbox}</td>
                    <td className="px-4 py-3 text-slate-600">{a.tables.join(', ')}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{a.rows}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[a.status] || 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaskingRulesTab() {
  const rules = [
    { column: 'ssn', rule: 'Partial Masking', scope: 'org', locked: true, override: false },
    { column: 'email', rule: 'Fake Value', scope: 'workspace', locked: false, override: true },
    { column: 'date_of_birth', rule: 'Date Shift', scope: 'workspace', locked: false, override: true },
    { column: 'patient_id', rule: 'Hash', scope: 'org', locked: true, override: false },
    { column: 'phone_number', rule: 'Fake Value', scope: 'workspace', locked: false, override: true },
  ];
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Effective Masking Rules</h3>
          <Button variant="outline" className="rounded-xl text-xs">Add Rule</Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Column Pattern</th>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Dev Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.column} className="bg-white">
                  <td className="px-4 py-3 font-mono text-slate-800">{r.column}</td>
                  <td className="px-4 py-3 text-slate-700">{r.rule}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.scope === 'org' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {r.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.override
                      ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 size={13} /> Allowed</span>
                      : <span className="flex items-center gap-1 text-red-500 text-xs"><AlertCircle size={13} /> Locked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SubsettingTab({ workspace }) {
  const storageKey = `tdm_subsetting_${workspace?.id || workspace?.name || 'workspace'}`;
  const defaultConfig = {
    enabled: false,
    rowLimit: 1000,
    samplePercent: 100,
    includeColumns: [],
  };

  const [config, setConfig] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      return { ...defaultConfig, ...(saved || {}) };
    } catch {
      return defaultConfig;
    }
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(config));
  }, [config, storageKey]);

  const toggleColumn = (name) => {
    setConfig((prev) => ({
      ...prev,
      includeColumns: prev.includeColumns?.includes(name)
        ? prev.includeColumns.filter((col) => col !== name)
        : [...(prev.includeColumns || []), name],
    }));
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Workspace subsetting</h3>
              <p className="mt-1 text-[13px] text-slate-500">Define row and column limits for this workspace before a pipeline run is started.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-medium text-indigo-700">
              <Filter size={13} />
              {config.enabled ? 'Enabled' : 'Off'}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">Apply subsetting to runs</p>
                  <p className="mt-1 text-[12px] text-slate-500">Limit the amount of data used in this workspace’s masking jobs.</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
              </label>

              {config.enabled && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Max rows</label>
                    <input
                      type="number"
                      min="1"
                      value={config.rowLimit}
                      onChange={(e) => setConfig((prev) => ({ ...prev, rowLimit: Number(e.target.value) || 1 }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Sample %</label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={config.samplePercent}
                      onChange={(e) => setConfig((prev) => ({ ...prev, samplePercent: Number(e.target.value) }))}
                      className="w-full accent-indigo-600"
                    />
                    <p className="mt-1 text-[12px] text-slate-500">{config.samplePercent}% of rows</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">Included columns</label>
                    <div className="flex flex-wrap gap-2">
                      {sampleColumns.map((col) => {
                        const active = config.includeColumns?.includes(col.name);
                        return (
                          <button
                            key={col.name}
                            type="button"
                            onClick={() => toggleColumn(col.name)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`}
                          >
                            {col.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">Leave this empty to keep the full schema in the run.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h4 className="text-[13px] font-semibold text-slate-800">How it will apply</h4>
              <ul className="mt-3 space-y-2 text-[12px] text-slate-600">
                <li>• Limit preview rows to {config.rowLimit} before execution.</li>
                <li>• Sample {config.samplePercent}% of rows for the current workspace run.</li>
                <li>• Restrict the pipeline to {config.includeColumns?.length ? config.includeColumns.join(', ') : 'all available columns'}.</li>
              </ul>
              <Button
                className="mt-5 rounded-xl"
                onClick={() => {
                  setSaved(true);
                  window.setTimeout(() => setSaved(false), 1400);
                }}
              >
                {saved ? 'Saved' : 'Save preset'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WorkspaceDetailPage() {
  const { wsId, tab = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { workspaces } = useWorkspaces();

  const [sandboxList, setSandboxList] = useState([]);
  useEffect(() => {
    axios.get(`${API_BASE_URL}/sandboxes`).then((r) => setSandboxList(r.data.sandboxes || [])).catch(() => {});
  }, []);

  // Try blueprint workspace first; fall back to a sandbox match
  const blueprintWs = workspaces.find((w) => wsSlug(w.name) === wsId);
  const sandboxMatch = !blueprintWs ? sandboxList.find((s) => s.sandbox_id === wsId) : null;
  const workspace = blueprintWs || (sandboxMatch ? {
    name: `${sandboxMatch.project_id} — ${sandboxMatch.target_environment}`,
    description: sandboxMatch.sandbox_schema,
    status: 'Active',
    owner: sandboxMatch.owner,
    members: [],
    connector_ids: [],
    domains: [],
  } : null);

  const basePath = isAdmin ? '/admin' : '/dev';

  // Derive active tab from URL
  const pathSuffix = location.pathname.replace(`${basePath}/workspaces/${wsId}`, '').replace(/^\//, '');
  const activeTab = TABS.find((t) => t.tab === pathSuffix) || TABS[0];

  if (!workspace && sandboxList.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500 text-sm">Workspace not found.</p>
        <Button variant="outline" onClick={() => navigate(`${basePath}/dashboard`)}>Back to Dashboard</Button>
      </div>
    );
  }

  if (!workspace) return null; // still loading sandboxes

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <button onClick={() => navigate(`${basePath}/dashboard`)} className="hover:text-indigo-600 flex items-center gap-1">
          <ArrowLeft size={14} /> Dashboard
        </button>
        <ChevronRight size={14} />
        <span className="text-slate-700 font-medium">{workspace.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <Briefcase size={22} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{workspace.name}</h1>
            <p className="text-sm text-slate-500 mt-1">{workspace.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${workspace.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : workspace.status === 'Archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                {workspace.status || 'Active'}
              </span>
              <span className="text-xs text-slate-400">Owner: {workspace.owner || workspace.createdBy}</span>
              {workspace.members?.length > 0 && (
                <span className="text-xs text-slate-400">· {workspace.members.length} member{workspace.members.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      </div>



      {/* Tab Content */}
      {activeTab.tab === '' && <OverviewTab workspace={workspace} />}
      {activeTab.tab === 'members' && <MembersTab workspace={workspace} />}
      {activeTab.tab === 'connectors' && <ConnectorsTab workspace={workspace} />}
      {activeTab.tab === 'data-inventory' && <DataInventoryPage />}
      {(activeTab.tab === 'data-assets' || activeTab.tab === 'data-classification') && <DataClassificationPage />}
      {activeTab.tab === 'masking-rules' && <MaskingRulesTab />}
      {activeTab.tab === 'subsetting' && <SubsettingTab workspace={workspace} />}
      {activeTab.tab === 'pipelines' && <ExistingPipelinesPage />}
      {activeTab.tab === 'masked-assets' && <MaskedAssetsPage />}
      {activeTab.tab === 'jobs' && <JobsTab workspace={workspace} />}
      {activeTab.tab === 'job-history' && <JobHistoryPage />}
      {activeTab.tab === 'schema-versions' && <SchemaVersionsTab workspace={workspace} />}
    </div>
  );
}
