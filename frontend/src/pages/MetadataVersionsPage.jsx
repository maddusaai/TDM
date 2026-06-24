import { useEffect, useState } from 'react';
import axios from 'axios';
import { History, Briefcase, Database, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { API_BASE_URL } from '../lib/constants';

const SCHEMA_DRIFT_RULES = ['No Masking', 'Hash', 'Fake Value', 'Partial Masking', 'Date Shift'];

const driftBadgeClass = (drift) => {
  if (drift === 'BREAKING_DRIFT') return 'bg-rose-50 text-rose-700';
  if (drift === 'ADDITIVE_DRIFT') return 'bg-amber-50 text-amber-700';
  if (drift === 'NO_DRIFT') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

const driftLabel = (drift) => {
  if (drift === 'BREAKING_DRIFT') return 'Breaking Drift';
  if (drift === 'ADDITIVE_DRIFT') return 'Additive Drift';
  if (drift === 'NO_DRIFT') return 'No Drift';
  return drift || 'Unknown';
};

const liveMessageStyles = {
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-100 bg-amber-50 text-amber-700',
  error: 'border-rose-100 bg-rose-50 text-rose-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

export default function MetadataVersionsPage() {
  // --- shared data ---
  const [sandboxes, setSandboxes] = useState([]);
  const [versions, setVersions] = useState([]);
  const [sourceDatabases, setSourceDatabases] = useState([]);

  // --- create version ---
  const [selectedSandboxId, setSelectedSandboxId] = useState('');
  const [sourceMetadataDatabase, setSourceMetadataDatabase] = useState('healthcare_catalog.patient_schema');
  const [selectedTablesText, setSelectedTablesText] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [createError, setCreateError] = useState('');

  // --- live drift ---
  const [driftDatasets, setDriftDatasets] = useState([]);
  const [driftSelectedId, setDriftSelectedId] = useState('');
  const [liveDrift, setLiveDrift] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState(null);
  const [newColumnRules, setNewColumnRules] = useState({});
  const [acceptRemoved, setAcceptRemoved] = useState(false);
  const [acceptTypeChanges, setAcceptTypeChanges] = useState(false);

  const selectedSandbox = sandboxes.find((s) => s.sandbox_id === selectedSandboxId);

  const fetchAll = async () => {
    try {
      const [sandboxRes, versionRes, dbRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/sandboxes`),
        axios.get(`${API_BASE_URL}/metadata/versions`),
        axios.get(`${API_BASE_URL}/source-metadata/databricks/databases`),
      ]);
      if (sandboxRes.data.status === 'SUCCESS') setSandboxes(sandboxRes.data.sandboxes || []);
      if (versionRes.data.status === 'SUCCESS') setVersions(versionRes.data.versions || []);
      if (dbRes.data.status === 'SUCCESS') {
        const dbs = dbRes.data.databases || [];
        setSourceDatabases(dbs);
        if (dbs.length > 0 && !dbs.includes(sourceMetadataDatabase)) setSourceMetadataDatabase(dbs[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDatasets = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/datasets`);
      const list = res.data.datasets || [];
      setDriftDatasets(list);
      if (!driftSelectedId && list.length) setDriftSelectedId(list[0].dataset_id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    const sandbox = sandboxes.find((s) => s.sandbox_id === selectedSandboxId);
    if (sandbox) setSelectedTablesText((sandbox.selected_tables || []).join(', '));
  }, [selectedSandboxId, sandboxes]);

  // --- per-workspace next label preview ---
  const nextVersionLabel = (() => {
    if (!selectedSandbox) return 'V?';
    const workspaceVersions = versions.filter(
      (v) => v.project_id === selectedSandbox.project_id && v.target_environment === selectedSandbox.target_environment
    );
    const max = workspaceVersions.reduce((m, v) => {
      const n = parseInt(String(v.version_label || '').replace(/[^0-9]/g, ''), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `V${max + 1}`;
  })();

  // --- create version ---
  const createMetadataVersion = async () => {
    setCreateMessage('');
    setCreateError('');
    if (!selectedSandboxId) { setCreateError('Please select a workspace.'); return; }
    const selectedTables = selectedTablesText.split(',').map((t) => t.trim()).filter(Boolean);
    if (selectedTables.length === 0) { setCreateError('Please enter at least one table.'); return; }
    if (!changeSummary.trim()) { setCreateError('Please enter a change summary.'); return; }
    try {
      setCreating(true);
      const res = await axios.post(`${API_BASE_URL}/metadata/versions/from-sandbox`, {
        sandbox_id: selectedSandboxId,
        source_metadata_database: sourceMetadataDatabase,
        selected_tables: selectedTables,
        change_summary: changeSummary.trim(),
      });
      if (res.data.status === 'SUCCESS') {
        setCreateMessage(
          `Created ${res.data.version.version_label} for ${res.data.version.project_id} (${res.data.version.target_environment}).`
        );
        setChangeSummary('');
        await fetchAll();
      } else {
        setCreateError(res.data.message || 'Failed to create metadata version.');
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || err.message || 'Failed to create metadata version.');
    } finally {
      setCreating(false);
    }
  };

  // --- live drift ---
  const initResolution = (result) => {
    const added = result?.diff?.added || [];
    const suggested = result?.suggested_rules || {};
    const rules = {};
    added.forEach((col) => { rules[col] = suggested[col] || 'No Masking'; });
    setNewColumnRules(rules);
    setAcceptRemoved(false);
    setAcceptTypeChanges(false);
  };

  const scanDrift = async (id) => {
    const datasetId = id || driftSelectedId;
    if (!datasetId) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/schema-drift`);
      setLiveDrift(res.data);
      initResolution(res.data);
    } catch (err) {
      console.error(err);
      setLiveMessage({ type: 'error', text: 'Scan failed.' });
    } finally {
      setLiveLoading(false);
    }
  };

  const simulateDrift = async () => {
    if (!driftSelectedId) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/datasets/${driftSelectedId}/schema-drift/simulate-change`);
      setLiveDrift(res.data);
      initResolution(res.data);
      setLiveMessage({ type: 'info', text: res.data.message });
    } catch (err) {
      setLiveMessage({ type: 'error', text: 'Simulate failed.' });
    } finally {
      setLiveLoading(false);
    }
  };

  const resolveDrift = async () => {
    if (!driftSelectedId) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/datasets/${driftSelectedId}/schema-drift/resolve`, {
        new_column_rules: newColumnRules,
        accept_removed: acceptRemoved,
        accept_type_changes: acceptTypeChanges,
      });
      if (res.data.status === 'SUCCESS') {
        setLiveMessage({ type: 'success', text: res.data.message });
        await scanDrift(driftSelectedId);
        await fetchAll();
      } else if (res.data.status === 'REQUIRES_INPUT') {
        setLiveMessage({ type: 'warn', text: res.data.message });
        setLiveDrift((prev) => ({ ...(prev || {}), ...res.data }));
        initResolution(res.data);
      } else {
        setLiveMessage({ type: 'error', text: res.data.message || 'Resolve failed.' });
      }
    } catch (err) {
      setLiveMessage({ type: 'error', text: 'Resolve failed.' });
    } finally {
      setLiveLoading(false);
    }
  };

  const liveDiff = liveDrift?.diff || { added: [], removed: [], type_changed: [] };
  const hasLiveDrift = Boolean(liveDrift && liveDrift.drift_type && liveDrift.drift_type !== 'NO_DRIFT');
  const liveBaselineSchema = liveDrift?.registered_schema || liveDrift?.baseline_schema || {};
  const liveActiveVersion = liveDrift?.active_metadata_version_label;

  // --- metrics ---
  const activeVersions = versions.filter((v) => v.status === 'ACTIVE').length;
  const totalWorkspaces = new Set(
    versions.map((v) => `${v.project_id}__${v.target_environment}`).filter(Boolean)
  ).size;
  const totalColumns = versions.reduce((sum, v) => sum + (v.column_count || 0), 0);

  // --- version history grouped by workspace ---
  const workspaceGroups = (() => {
    const groups = {};
    [...versions].sort((a, b) => a.created_at?.localeCompare(b.created_at)).forEach((v) => {
      const key = `${v.project_id}__${v.target_environment}`;
      if (!groups[key]) groups[key] = { project_id: v.project_id, target_environment: v.target_environment, versions: [] };
      groups[key].versions.push(v);
    });
    return Object.values(groups);
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metadata Versions"
        description="Manage source metadata snapshots per workspace. Each workspace maintains its own version history. Schema drift is detected against the active version and resolved by creating a successor."
        icon={History}
      />

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={History} label="Metadata Versions" value={versions.length} helper="All saved source metadata snapshots" />
        <MetricCard icon={Briefcase} label="Workspaces" value={totalWorkspaces} helper="Distinct project + environment pairs" />
        <MetricCard icon={Database} label="Columns Versioned" value={totalColumns} helper="Columns captured across all versions" />
      </div>

      {/* ── Create Metadata Version ─────────────────────────────────────── */}
      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Create Metadata Version</h2>
              <p className="mt-1 max-w-3xl text-[13px] text-slate-500">
                Snapshot the source schema for a workspace. Each workspace maintains its own sequential version history (V1, V2, V3…) independently of other workspaces.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
              Per-Workspace Versioning
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Workspace</label>
              <select
                value={selectedSandboxId}
                onChange={(e) => setSelectedSandboxId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              >
                <option value="">Select workspace</option>
                {sandboxes.map((s) => (
                  <option key={s.sandbox_id} value={s.sandbox_id}>
                    {s.project_id} — {s.target_environment}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Source</label>
              <select
                value={sourceMetadataDatabase}
                onChange={(e) => setSourceMetadataDatabase(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              >
                {sourceDatabases.map((db) => (
                  <option key={db} value={db}>{db}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Next Version Label</label>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-[13px] font-semibold text-slate-900">{nextVersionLabel}</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">Auto</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">Sequential within this workspace.</p>
            </div>

            <div className="flex items-end">
              <Button
                onClick={createMetadataVersion}
                disabled={creating}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                {creating ? 'Creating…' : 'Create Metadata Version'}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Tables in this version</label>
              <textarea
                value={selectedTablesText}
                onChange={(e) => setSelectedTablesText(e.target.value)}
                rows={2}
                placeholder="patient_records, appointments, insurance_claims"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Change Summary <span className="text-rose-400">*</span></label>
              <textarea
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                rows={2}
                placeholder="Why are you creating this version? e.g. Added insurance_claims table for Q3 audit."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              />
            </div>
          </div>

          {selectedSandbox && (
            <p className="mt-2 text-[11px] text-slate-500">
              Workspace: <span className="font-semibold text-slate-700">{selectedSandbox.sandbox_schema}</span>
              {' · '}Owner: {selectedSandbox.owner}
              {' · '}Target: {selectedSandbox.target_environment}
            </p>
          )}

          {createMessage && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
              {createMessage}
            </div>
          )}
          {createError && (
            <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              {createError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Live Schema Drift Detection ─────────────────────────────────── */}
      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-slate-700" />
                <h2 className="text-base font-semibold text-slate-900">Live Schema Drift Detection</h2>
              </div>
              <p className="mt-1 max-w-3xl text-[13px] text-slate-500">
                Introspect a dataset's live source file and compare it against its workspace's active metadata version.
                Resolving drift creates a successor version automatically.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
              Additive = Allow · Breaking = Block
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Dataset</label>
              <select
                value={driftSelectedId}
                onChange={(e) => { setDriftSelectedId(e.target.value); setLiveDrift(null); setLiveMessage(null); }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
              >
                <option value="">Select a dataset…</option>
                {driftDatasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id}>{d.filename}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
              <Button onClick={() => scanDrift()} disabled={!driftSelectedId || liveLoading} className="rounded-xl">
                {liveLoading ? 'Working…' : 'Scan for drift'}
              </Button>
              <Button variant="outline" onClick={simulateDrift} disabled={!driftSelectedId || liveLoading} className="rounded-xl text-slate-500">
                Simulate source change (demo)
              </Button>
              <Button variant="outline" onClick={fetchDatasets} disabled={liveLoading} className="rounded-xl">
                Refresh
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            "Simulate source change" modifies the dataset's source file to introduce real drift for demo purposes.
          </p>

          {liveMessage && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${liveMessageStyles[liveMessage.type] || liveMessageStyles.info}`}>
              {liveMessage.text}
            </div>
          )}

          {liveDrift && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">Drift Status</p>
                  <p className="mt-1 text-[13px] text-slate-600">{liveDrift.summary}</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-medium ${driftBadgeClass(liveDrift.drift_type)}`}>
                  {driftLabel(liveDrift.drift_type)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {liveActiveVersion && (
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
                    Active version: {liveActiveVersion}
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                  Baseline columns: {Object.keys(liveBaselineSchema).length}
                </span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${liveDrift.can_run ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {liveDrift.can_run ? 'Run allowed' : 'Run blocked'}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-white p-4">
                  <p className="text-[12px] font-semibold text-emerald-700">Added ({liveDiff.added.length})</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {liveDiff.added.length === 0 && <span className="text-[12px] text-slate-400">None</span>}
                    {(liveDiff.added_detail || liveDiff.added.map((c) => ({ column: c, type: '' }))).map((c) => (
                      <span key={c.column} className="text-[12px] text-slate-700">
                        {c.column}{c.type ? ` (${c.type})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-[12px] font-semibold text-rose-700">Removed ({liveDiff.removed.length})</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {liveDiff.removed.length === 0 && <span className="text-[12px] text-slate-400">None</span>}
                    {liveDiff.removed.map((c) => <span key={c} className="text-[12px] text-slate-700">{c}</span>)}
                  </div>
                </div>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-[12px] font-semibold text-amber-700">Type changed ({liveDiff.type_changed.length})</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {liveDiff.type_changed.length === 0 && <span className="text-[12px] text-slate-400">None</span>}
                    {liveDiff.type_changed.map((c) => (
                      <span key={c.column} className="text-[12px] text-slate-700">
                        {c.column}: {c.from} → {c.to}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {(liveDrift.blockers || []).length > 0 && (
                <div className="mt-4 rounded-xl bg-rose-50 p-3">
                  {liveDrift.blockers.map((b, i) => (
                    <p key={i} className="text-[12px] text-rose-700">• {b}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasLiveDrift && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-[13px] font-semibold text-slate-900">Resolve Drift</p>
              <p className="mt-1 text-[13px] text-slate-500">
                Assign masking rules to new columns and accept any breaking changes. Resolving will create a successor metadata version automatically.
              </p>

              {liveDiff.added.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12px] font-medium text-slate-600">New columns — assign a masking rule</p>
                  <div className="mt-2 grid gap-2">
                    {liveDiff.added.map((col) => (
                      <div key={col} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                        <span className="text-[13px] text-slate-800">{col}</span>
                        <select
                          value={newColumnRules[col] || 'No Masking'}
                          onChange={(e) => setNewColumnRules((prev) => ({ ...prev, [col]: e.target.value }))}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 outline-none"
                        >
                          {SCHEMA_DRIFT_RULES.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {liveDiff.removed.length > 0 && (
                <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={acceptRemoved} onChange={(e) => setAcceptRemoved(e.target.checked)} className="mt-0.5" />
                  <span className="text-[13px] text-slate-700">
                    Accept removal of: <strong>{liveDiff.removed.join(', ')}</strong>
                  </span>
                </label>
              )}

              {liveDiff.type_changed.length > 0 && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={acceptTypeChanges} onChange={(e) => setAcceptTypeChanges(e.target.checked)} className="mt-0.5" />
                  <span className="text-[13px] text-slate-700">
                    Accept type changes: <strong>{liveDiff.type_changed.map((c) => `${c.column} (${c.from}→${c.to})`).join(', ')}</strong>
                  </span>
                </label>
              )}

              <div className="mt-5">
                <Button onClick={resolveDrift} disabled={liveLoading} className="rounded-xl bg-indigo-600 hover:bg-indigo-700">
                  {liveLoading ? 'Working…' : 'Resolve & create successor version'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Version History ─────────────────────────────────────────────── */}
      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Version History</h2>
              <p className="text-[13px] text-slate-500">
                Grouped by workspace. Each workspace has its own version chain — old versions are preserved and marked superseded.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
              {activeVersions} Active
            </span>
          </div>

          {workspaceGroups.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-500">No metadata versions created yet.</p>
          ) : (
            <div className="space-y-6">
              {workspaceGroups.map((group) => (
                <div key={`${group.project_id}__${group.target_environment}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-700">{group.project_id}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {group.target_environment}
                    </span>
                  </div>

                  {/* lineage chain */}
                  <div className="flex flex-wrap items-center gap-1">
                    {group.versions.map((v, idx) => (
                      <div key={v.metadata_version_id} className="flex items-center gap-1">
                        <div className={`rounded-xl border px-3 py-2 text-[12px] ${v.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${v.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {v.version_label}
                            </span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {v.status}
                            </span>
                          </div>
                          <p className="mt-1 max-w-[200px] truncate text-[11px] text-slate-500" title={v.change_summary}>
                            {v.change_summary || '—'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {v.table_count}t · {v.column_count}c · {v.created_at ? new Date(v.created_at).toLocaleDateString() : '—'}
                          </p>
                        </div>
                        {idx < group.versions.length - 1 && (
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
