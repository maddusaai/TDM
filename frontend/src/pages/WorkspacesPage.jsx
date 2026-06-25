import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Database, Layers, Shield, ChevronDown, Network, Plus, X } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { blueprintWorkspaces, maskedAssetSamples, API_BASE_URL, wsSlug } from '../lib/constants';
import { useConnectors } from '../context/ConnectorsContext';
import { useWorkspaces } from '../context/WorkspacesContext';

const ORG_MEMBERS = [
  { name: 'Priya Shah',  email: 'priya.shah@org.com',  role: 'developer' },
  { name: 'Alex Chen',   email: 'alex.chen@org.com',   role: 'developer' },
  { name: 'Maya Patel',  email: 'maya.patel@org.com',  role: 'developer' },
  { name: 'Dev User',    email: 'developer@tdm.com',   role: 'developer' },
  { name: 'Viewer One',  email: 'viewer@org.com',      role: 'viewer' },
];

const CONN_TYPES = ['SQL Server', 'Databricks', 'Oracle', 'SFTP', 'Salesforce'];

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const { connectors, addConnector } = useConnectors();
  const { workspaces, addWorkspace } = useWorkspaces();

  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState(blueprintWorkspaces[0]?.name || '');
  const [sandboxes, setSandboxes] = useState([]);
  const [loadingSandboxes, setLoadingSandboxes] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [showExistingWorkspaceDetails, setShowExistingWorkspaceDetails] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceCreatedBy, setNewWorkspaceCreatedBy] = useState('Admin User');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
  const [newWorkspaceOwner, setNewWorkspaceOwner] = useState('');
  const [openDomainKeys, setOpenDomainKeys] = useState({});
  const [openSandboxIds, setOpenSandboxIds] = useState({});

  // Step 2 — connectors
  const [selectedConnectorNames, setSelectedConnectorNames] = useState([]);
  const [showNewConnForm, setShowNewConnForm] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnType, setNewConnType] = useState('SQL Server');
  const [newConnConnection, setNewConnConnection] = useState('');
  const [newConnPurpose, setNewConnPurpose] = useState('');

  // Step 3 — members
  const [selectedMemberEmails, setSelectedMemberEmails] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.name === selectedWorkspaceName) || workspaces[0];

  const fetchSandboxes = async () => {
    try {
      setLoadingSandboxes(true);
      const response = await axios.get(`${API_BASE_URL}/sandboxes`);
      if (response.data.status === 'SUCCESS') {
        setSandboxes(response.data.sandboxes || []);
      }
    } catch (err) {
      console.error(err);
      setWorkspaceError('Unable to load sandbox schemas from backend.');
    } finally {
      setLoadingSandboxes(false);
    }
  };

  useEffect(() => { fetchSandboxes(); }, []);

  const resetCreateWorkspaceForm = () => {
    setNewWorkspaceName('');
    setNewWorkspaceCreatedBy('Admin User');
    setNewWorkspaceDescription('');
    setNewWorkspaceOwner('');
    setCreateStep(1);
    setSelectedConnectorNames([]);
    setShowNewConnForm(false);
    setNewConnName(''); setNewConnType('SQL Server'); setNewConnConnection(''); setNewConnPurpose('');
    setSelectedMemberEmails([]);
    setMemberSearch('');
  };

  const validateStep1 = () => {
    setWorkspaceError('');
    const workspaceName = newWorkspaceName.trim();
    if (!workspaceName) { setWorkspaceError('Please enter a workspace name.'); return false; }
    if (workspaces.some((ws) => ws.name.toLowerCase() === workspaceName.toLowerCase())) {
      setWorkspaceError('A workspace with this name already exists.'); return false;
    }
    return true;
  };

  const addNewConnector = () => {
    if (!newConnName.trim()) return;
    const conn = {
      name: newConnName.trim(),
      type: newConnType,
      sourceType: newConnType === 'SFTP' ? 'File' : 'DB',
      connection: newConnConnection.trim() || (newConnType === 'SFTP' ? 'sftp://feeds.company.com/inbound' : 'server.company.com:1433/DDB'),
      status: 'Draft',
      purpose: newConnPurpose.trim() || 'New connection created from UI simulation',
    };
    addConnector(conn);
    setSelectedConnectorNames((prev) => [...prev, conn.name]);
    setNewConnName(''); setNewConnType('SQL Server'); setNewConnConnection(''); setNewConnPurpose('');
    setShowNewConnForm(false);
  };

  const finishCreateWorkspace = (membersOverride) => {
    const selectedMembers = (membersOverride ?? selectedMemberEmails)
      .map((email) => ORG_MEMBERS.find((m) => m.email === email))
      .filter(Boolean);
    const workspace = {
      name: newWorkspaceName.trim(),
      owner: newWorkspaceOwner.trim() || newWorkspaceCreatedBy.trim() || 'Admin User',
      createdBy: newWorkspaceCreatedBy.trim() || 'Admin User',
      date: new Date().toISOString().slice(0, 10),
      description: newWorkspaceDescription.trim() || 'Workspace created for source metadata, sandbox schemas, masked outputs, and pipeline execution.',
      status: 'Active',
      domains: [],
      pipelines: [],
      connectors: selectedConnectorNames,
      members: selectedMembers,
    };
    addWorkspace(workspace);
    setSelectedWorkspaceName(workspace.name);
    setShowExistingWorkspaceDetails(true);
    setWorkspaceMessage(`Workspace ${workspace.name} created successfully.`);
    setIsCreateOpen(false);
    resetCreateWorkspaceForm();
    navigate('/admin/workspaces');
  };

  const toggleDomain = (domainName) => {
    const key = `${selectedWorkspace?.name || 'workspace'}-${domainName}`;
    setOpenDomainKeys((current) => ({ ...current, [key]: !current[key] }));
  };

  const isDomainOpen = (domainName) => {
    const key = `${selectedWorkspace?.name || 'workspace'}-${domainName}`;
    return Boolean(openDomainKeys[key]);
  };

  const toggleSandbox = (sandboxId) => {
    setOpenSandboxIds((current) => ({ ...current, [sandboxId]: !current[sandboxId] }));
  };

  const expandAllSandboxes = () => {
    const updated = {};
    sandboxes.forEach((sandbox) => { updated[sandbox.sandbox_id] = true; });
    setOpenSandboxIds(updated);
  };

  const collapseAllSandboxes = () => { setOpenSandboxIds({}); };

  const totalDomains = workspaces.reduce((sum, ws) => sum + ws.domains.length, 0);
  const sourceAssets = workspaces.reduce((sum, ws) => sum + ws.domains.reduce((inner, domain) => inner + domain.tables.length, 0), 0);
  const maskedAssets = maskedAssetSamples.length;
  const totalSandboxTables = sandboxes.reduce((count, sandbox) => count + (sandbox.selected_tables?.length || 0), 0);

  const tableUsage = sandboxes.reduce((acc, sandbox) => {
    (sandbox.selected_tables || []).forEach((table) => { acc[table] = (acc[table] || 0) + 1; });
    return acc;
  }, {});
  const overlappingTables = Object.entries(tableUsage).filter(([, count]) => count > 1).map(([table]) => table);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workspace"
        description="One business container for domains, source assets, sandbox schemas, masked outputs, metadata versions, and pipelines."
        icon={Briefcase}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Briefcase} label="Workspaces" value={workspaces.length} helper={`${totalDomains} business domains`} />
        <MetricCard icon={Database} label="Source Assets" value={sourceAssets} helper="Tables across domains" />
        <MetricCard icon={Layers} label="Sandbox Schemas" value={sandboxes.length} helper={`${totalSandboxTables} registered tables`} />
        <MetricCard icon={Shield} label="Masked Assets" value={maskedAssets} helper="Sandbox-scoped outputs" />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Workspace Catalog</h2>
              <p className="text-xs text-slate-500">Create a new workspace or open an existing workspace to view domains and sandbox schemas.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setShowExistingWorkspaceDetails((current) => !current)} className="rounded-xl px-3 py-2 text-xs">
                {showExistingWorkspaceDetails ? 'Hide Existing Workspace' : 'Existing Workspace'}
              </Button>
              <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl px-3 py-2 text-xs">
                + Create Workspace
              </Button>
            </div>
          </div>

          {workspaceMessage && (
            <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{workspaceMessage}</div>
          )}
          {workspaceError && (
            <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workspaceError}</div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Workspace Name</th>
                  <th className="px-3 py-2.5">Created By</th>
                  <th className="px-3 py-2.5">Members</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Domains</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspaces.map((workspace) => (
                  <tr
                    key={workspace.name}
                    onClick={() => { setSelectedWorkspaceName(workspace.name); setShowExistingWorkspaceDetails(true); navigate('/admin/workspaces/' + wsSlug(workspace.name)); }}
                    className={`cursor-pointer ${selectedWorkspace?.name === workspace.name ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{workspace.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{workspace.createdBy || workspace.owner}</td>
                    <td className="px-3 py-2.5 text-slate-600">{workspace.members?.length ?? 0}</td>
                    <td className="max-w-[360px] px-3 py-2.5 text-slate-600">
                      <span className="line-clamp-2">{workspace.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{workspace.domains.length}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${workspace.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {workspace.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!showExistingWorkspaceDetails && (
        <Card className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Existing workspace details are collapsed</h3>
                <p className="text-xs text-slate-500">Select a workspace row or click Existing Workspace to view domains, source tables, sandbox schemas, overlaps, and linked pipelines.</p>
              </div>
              <Button variant="outline" onClick={() => setShowExistingWorkspaceDetails(true)} className="w-fit rounded-xl px-3 py-2 text-xs">
                Open Existing Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedWorkspace && showExistingWorkspaceDetails && (
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{selectedWorkspace.name}</h2>
                  <p className="text-xs text-slate-500">Domains, source tables, masked assets, and linked pipelines.</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">{selectedWorkspace.status || 'Active'}</span>
              </div>

              {selectedWorkspace.domains.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No domains imported yet. Use Source Connections and Data Assets to onboard metadata into this workspace.</div>
              ) : (
                <div className="space-y-2.5">
                  {selectedWorkspace.domains.map((domain) => {
                    const open = isDomainOpen(domain.name);
                    return (
                      <div key={domain.name} className="rounded-xl border border-slate-200 bg-white">
                        <button type="button" onClick={() => toggleDomain(domain.name)} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-slate-50">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{domain.name}</p>
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">{domain.tables.length} tables</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">Masked asset: {domain.asset}</p>
                          </div>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="border-t border-slate-100 px-3.5 py-3">
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Source Tables</p>
                              <div className="flex flex-wrap gap-2">
                                {domain.tables.map((table) => (
                                  <span key={table} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700">{table}</span>
                                ))}
                              </div>
                            </div>
                            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                              <span className="font-medium text-slate-800">Pipelines:</span> {domain.pipelines.join(', ')}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Sandbox Schemas</h2>
                  <p className="max-w-xl text-xs leading-5 text-slate-500">Isolated user/project schemas. Expand only when table details are needed.</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={fetchSandboxes} className="rounded-xl px-3 py-1.5 text-xs">Refresh</Button>
                  {sandboxes.length > 0 && (
                    <>
                      <Button variant="outline" onClick={expandAllSandboxes} className="rounded-xl px-3 py-1.5 text-xs">Expand All</Button>
                      <Button variant="outline" onClick={collapseAllSandboxes} className="rounded-xl px-3 py-1.5 text-xs">Collapse All</Button>
                    </>
                  )}
                </div>
              </div>

              {loadingSandboxes && <p className="text-xs text-slate-500">Loading sandbox schemas...</p>}

              {!loadingSandboxes && sandboxes.length === 0 && (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">No sandbox schemas found. Create one from Pipeline Workspace → Sandbox & Source.</div>
              )}

              {!loadingSandboxes && sandboxes.length > 0 && (
                <div className="space-y-2.5">
                  {sandboxes.map((sandbox) => {
                    const open = Boolean(openSandboxIds[sandbox.sandbox_id]);
                    const selectedTables = sandbox.selected_tables || [];
                    const overlappingForSandbox = selectedTables.filter((table) => overlappingTables.includes(table));

                    return (
                      <div key={sandbox.sandbox_id} className="rounded-xl border border-slate-200 bg-white">
                        <button type="button" onClick={() => toggleSandbox(sandbox.sandbox_id)} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-slate-50">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-full break-words text-xs font-semibold leading-snug text-slate-900">{sandbox.sandbox_schema}</p>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">{sandbox.isolation_status || 'ISOLATED'}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">{sandbox.owner} · {sandbox.project_id} · {sandbox.target_environment}</p>
                          </div>
                          <div className="hidden shrink-0 items-center gap-2 md:flex">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{selectedTables.length} tables</span>
                            {overlappingForSandbox.length > 0 && (
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700">{overlappingForSandbox.length} overlaps</span>
                            )}
                          </div>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="border-t border-slate-100 px-3.5 py-3">
                            <div className="grid gap-3 text-xs md:grid-cols-3">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Owner</p>
                                <p className="mt-1 font-medium text-slate-800">{sandbox.owner}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Project / Target</p>
                                <p className="mt-1 font-medium text-slate-800">{sandbox.project_id} · {sandbox.target_environment}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Source</p>
                                <p className="mt-1 font-medium text-slate-800">{sandbox.source_system} → {sandbox.source_database} → {sandbox.source_schema}</p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Registered Tables</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedTables.length === 0 ? (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">No tables registered</span>
                                ) : (
                                  selectedTables.map((table) => (
                                    <span key={table} className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${overlappingTables.includes(table) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {table}{overlappingTables.includes(table) ? ' · overlap' : ''}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                            {overlappingForSandbox.length > 0 && (
                              <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                                Overlap detected for {overlappingForSandbox.join(', ')}. This is allowed because changes are scoped to this sandbox schema.
                              </div>
                            )}
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
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            {/* Step indicator */}
            <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-slate-100">
              {['Details', 'Connectors', 'Members'].map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${createStep === i + 1 ? 'bg-indigo-600 text-white' : createStep > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</div>
                  <span className={`text-xs font-medium ${createStep === i + 1 ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
                  {i < 2 && <span className="text-slate-200 mx-1">›</span>}
                </div>
              ))}
              <button onClick={() => { setIsCreateOpen(false); resetCreateWorkspaceForm(); }} className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>

            {/* Step 1 — Details */}
            {createStep === 1 && (
              <>
                <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[13px] font-semibold text-slate-700">Workspace Name</label>
                    <input value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="e.g., Finance QA Workspace" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                  </div>
                  <div>
                    <label className="mb-2 block text-[13px] font-semibold text-slate-700">Created By</label>
                    <input value={newWorkspaceCreatedBy} onChange={(e) => setNewWorkspaceCreatedBy(e.target.value)} placeholder="Admin User" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-[13px] font-semibold text-slate-700">Description</label>
                    <textarea value={newWorkspaceDescription} onChange={(e) => setNewWorkspaceDescription(e.target.value)} placeholder="Purpose, environment, business domain and data scope" className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                  </div>
                  <div>
                    <label className="mb-2 block text-[13px] font-semibold text-slate-700">Business Owner</label>
                    <input value={newWorkspaceOwner} onChange={(e) => setNewWorkspaceOwner(e.target.value)} placeholder="Owner name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-50" />
                  </div>
                  {workspaceError && <div className="md:col-span-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workspaceError}</div>}
                </div>
                <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                  <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetCreateWorkspaceForm(); }} className="rounded-xl">Cancel</Button>
                  <Button onClick={() => { if (validateStep1()) setCreateStep(2); }} className="rounded-xl">Next: Connectors →</Button>
                </div>
              </>
            )}

            {/* Step 2 — Connectors */}
            {createStep === 2 && (
              <>
                <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
                  <p className="text-xs text-slate-500">Select connectors to assign to this workspace.</p>
                  {connectors.map((conn) => {
                    const checked = selectedConnectorNames.includes(conn.name);
                    return (
                      <label key={conn.name} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                        <input type="checkbox" checked={checked} onChange={() => setSelectedConnectorNames((prev) => checked ? prev.filter((n) => n !== conn.name) : [...prev, conn.name])} className="accent-indigo-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{conn.name}</p>
                          <p className="text-xs text-slate-500 truncate">{conn.connection}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-slate-400 flex-shrink-0">
                          <span>{conn.type} · {conn.sourceType}</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${conn.status === 'Connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{conn.status}</span>
                        </div>
                      </label>
                    );
                  })}

                  {/* Add new connector inline */}
                  <button onClick={() => setShowNewConnForm((v) => !v)} className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1">
                    <Plus size={14} /> {showNewConnForm ? 'Cancel new connector' : 'Add New Connector'}
                  </button>

                  {showNewConnForm && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-600">Connector Name</label>
                          <input value={newConnName} onChange={(e) => setNewConnName(e.target.value)} placeholder="e.g., SQL_FINANCE_PROD" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-600">Type</label>
                          <select value={newConnType} onChange={(e) => setNewConnType(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300">
                            {CONN_TYPES.map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-600">Connection String</label>
                          <input value={newConnConnection} onChange={(e) => setNewConnConnection(e.target.value)} placeholder="server.company.com:1433/DB" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-600">Purpose</label>
                          <input value={newConnPurpose} onChange={(e) => setNewConnPurpose(e.target.value)} placeholder="e.g., Source for finance metadata" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300" />
                        </div>
                      </div>
                      <Button onClick={addNewConnector} className="rounded-xl text-xs" disabled={!newConnName.trim()}>Add Connector</Button>
                    </div>
                  )}
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-100 px-6 py-4">
                  <Button variant="outline" onClick={() => setCreateStep(1)} className="rounded-xl">← Back</Button>
                  <Button onClick={() => setCreateStep(3)} className="rounded-xl">Next: Members →</Button>
                </div>
              </>
            )}

            {/* Step 3 — Members (optional) */}
            {createStep === 3 && (
              <>
                <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
                  <p className="text-xs text-slate-500">Assign members to this workspace. <span className="text-slate-400">(Optional — can be changed later from the Members tab)</span></p>
                  <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search members..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300" />
                  {ORG_MEMBERS.filter((m) => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || m.email.toLowerCase().includes(memberSearch.toLowerCase())).map((member) => {
                    const checked = selectedMemberEmails.includes(member.email);
                    return (
                      <label key={member.email} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                        <input type="checkbox" checked={checked} onChange={() => setSelectedMemberEmails((prev) => checked ? prev.filter((e) => e !== member.email) : [...prev, member.email])} className="accent-indigo-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{member.role}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-100 px-6 py-4">
                  <Button variant="outline" onClick={() => setCreateStep(2)} className="rounded-xl">← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => finishCreateWorkspace([])} className="rounded-xl">Skip & Create</Button>
                    <Button onClick={() => finishCreateWorkspace()} className="rounded-xl">Create Workspace</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
