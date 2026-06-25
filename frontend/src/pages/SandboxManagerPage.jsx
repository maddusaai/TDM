import { useEffect, useState } from 'react';
import axios from 'axios';
import { Layers, Database, Shield } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { API_BASE_URL } from '../lib/constants';
import { useWorkspaces } from '../context/WorkspacesContext';
import { useAuth } from '../context/AuthContext';

const ENV_BY_ROLE = {
  admin: ['DEV', 'QA', 'PROD'],
  developer: ['DEV'],
  qa: ['DEV', 'QA'],
  viewer: [],
};

export default function SandboxManagerPage() {
  const { workspaces } = useWorkspaces();
  const { user } = useAuth();
  const allowedEnvs = ENV_BY_ROLE[user?.role] ?? ['DEV'];

  const [sandboxes, setSandboxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [owner, setOwner] = useState(() => user?.name || '');
  const [projectId, setProjectId] = useState('Project_001');
  const [targetEnvironment, setTargetEnvironment] = useState(allowedEnvs[0] ?? 'DEV');
  const [selectedTablesText, setSelectedTablesText] = useState('patient_records, appointments');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchSandboxes = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/sandboxes`);
      if (response.data.status === 'SUCCESS') {
        setSandboxes(response.data.sandboxes || []);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError('Unable to load sandboxes from backend.');
    }
  };

  useEffect(() => {
    fetchSandboxes();
  }, []);

  const createSandbox = async () => {
    setMessage('');
    setError('');

    if (!workspaceId) { setError('Please select a workspace.'); return; }
    if (!owner.trim()) { setError('Please enter an owner.'); return; }
    if (!projectId.trim()) { setError('Please enter a project ID.'); return; }

    const selectedTables = selectedTablesText.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      setCreating(true);
      const response = await axios.post(`${API_BASE_URL}/sandboxes`, {
        workspace_id: workspaceId,
        owner: owner.trim(),
        project_id: projectId.trim(),
        target_environment: targetEnvironment,
        source_system: 'SQL Server PROD',
        source_database: 'DDB',
        source_schema: 'dbo',
        selected_tables: selectedTables,
      });

      if (response.data.status === 'SUCCESS') {
        const sandbox = response.data.sandbox;
        setMessage(`Created sandbox ${sandbox.sandbox_schema} for ${sandbox.owner}.`);
        await fetchSandboxes();
      } else {
        setError(response.data.message || 'Failed to create sandbox.');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.response?.data?.detail || err.message || 'Failed to create sandbox.');
    } finally {
      setCreating(false);
    }
  };

  const totalSandboxes = sandboxes.length;
  const totalTables = sandboxes.reduce((count, sandbox) => count + (sandbox.selected_tables?.length || 0), 0);
  const tableUsage = sandboxes.reduce((acc, sandbox) => {
    (sandbox.selected_tables || []).forEach((table) => { acc[table] = (acc[table] || 0) + 1; });
    return acc;
  }, {});
  const overlappingTables = Object.entries(tableUsage).filter(([, count]) => count > 1).map(([table]) => table);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sandbox Manager"
        description="Create and monitor isolated schema-level sandboxes for users and projects. Overlapping source tables remain isolated by sandbox schema."
        icon={Layers}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={Layers} label="Sandboxes" value={totalSandboxes} helper="User/project schemas" />
        <MetricCard icon={Database} label="Registered Tables" value={totalTables} helper="Across all sandboxes" />
        <MetricCard icon={Shield} label="Overlapping Tables" value={overlappingTables.length} helper="Still isolated by schema" />
      </div>

      <Card className="rounded-3xl border border-indigo-100 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Create Sandbox</h2>
              <p className="text-[13px] text-slate-500">Create a separate working schema for each person or project.</p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
              Required · Schema-Level Isolation
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Workspace</label>
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none">
                <option value="">— Select Workspace —</option>
                {workspaces.map((ws) => <option key={ws.id || ws.name} value={ws.id || ws.name}>{ws.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Owner</label>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={user?.name || 'Your name'} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Target Environment</label>
              <select value={targetEnvironment} onChange={(e) => setTargetEnvironment(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none">
                {allowedEnvs.map((env) => <option key={env} value={env}>{env}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Project ID</label>
              <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project_001" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none" />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Tables (comma-separated)</label>
              <input value={selectedTablesText} onChange={(e) => setSelectedTablesText(e.target.value)} placeholder="patient_records, appointments" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={createSandbox} disabled={creating} className="rounded-xl">
              {creating ? 'Creating...' : 'Create Sandbox'}
            </Button>
            <Button variant="outline" onClick={fetchSandboxes} className="rounded-xl">Refresh</Button>
          </div>

          {message && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{message}</div>}
          {error && <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Existing Sandboxes</h2>
              <p className="text-[13px] text-slate-500">Each sandbox has its own schema, owner, project, tables, and isolation boundary.</p>
            </div>
            <Button variant="outline" onClick={fetchSandboxes} className="rounded-xl">Refresh Sandboxes</Button>
          </div>

          {loading && <p className="mt-5 text-[13px] text-slate-500">Loading sandboxes...</p>}

          {!loading && sandboxes.length === 0 && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-[13px] text-slate-600">
              No sandboxes found. Create one here or from Pipeline Workspace → Source.
            </div>
          )}

          {!loading && sandboxes.length > 0 && (
            <div className="mt-6 grid gap-4">
              {sandboxes.map((sandbox) => {
                const overlappingForSandbox = (sandbox.selected_tables || []).filter((table) => overlappingTables.includes(table));
                return (
                  <div key={sandbox.sandbox_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 break-all leading-snug">{sandbox.sandbox_schema}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Owner: {sandbox.owner} · Project: {sandbox.project_id} · Target: {sandbox.target_environment}</p>
                        <p className="mt-1 text-[11px] text-slate-500">Source: {sandbox.source_system} → {sandbox.source_database} → {sandbox.source_schema}</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">{sandbox.isolation_status || 'ISOLATED'}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(sandbox.selected_tables || []).length === 0 ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">No tables registered</span>
                      ) : (
                        sandbox.selected_tables.map((table) => (
                          <span key={table} className={`rounded-full px-3 py-1 text-[11px] font-medium ${overlappingTables.includes(table) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {table}{overlappingTables.includes(table) ? ' · overlap' : ''}
                          </span>
                        ))
                      )}
                    </div>
                    {overlappingForSandbox.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] text-amber-800">
                        Overlap detected for {overlappingForSandbox.join(', ')}. This is allowed because changes are scoped to this sandbox schema.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
