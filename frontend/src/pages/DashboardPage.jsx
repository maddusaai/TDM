import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { LayoutDashboard, Activity, CheckCircle2, Database, FileText, Briefcase, Shield, ChevronRight, Play, Users } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { blueprintWorkspaces, blueprintPipelines, maskedAssetSamples, API_BASE_URL } from '../lib/constants';
import { useAuth } from '../context/AuthContext';

function wsSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

const ENV_BADGE = {
  PROD: 'bg-red-100 text-red-700',
  UAT: 'bg-yellow-100 text-yellow-700',
  QA: 'bg-blue-100 text-blue-700',
  DEV: 'bg-green-100 text-green-700',
};

function WorkspaceCards() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const basePath = isAdmin ? '/admin' : '/dev';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(`${basePath}/workspaces`)}
          className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
        >
          My Workspaces
        </button>
        <span className="text-xs text-slate-400">{blueprintWorkspaces.length} workspaces</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blueprintWorkspaces.map((ws) => {
          const pipelines = blueprintPipelines.filter((p) => p.workspace === ws.name);
          const totalTables = ws.domains.reduce((s, d) => s + d.tables.length, 0);
          return (
            <button
              key={ws.name}
              onClick={() => navigate(`${basePath}/workspaces/${wsSlug(ws.name)}`)}
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                  <Briefcase size={16} className="text-indigo-600" />
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ENV_BADGE[ws.environment] || 'bg-slate-100 text-slate-600'}`}>
                  {ws.environment}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm group-hover:text-indigo-700 transition-colors">{ws.name}</h3>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ws.description}</p>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Database size={12} /> {totalTables} tables
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Play size={12} /> {pipelines.length} pipelines
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users size={12} /> {ws.owner}
                </span>
              </div>
              <div className="flex items-center justify-end mt-2 text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                Open workspace <ChevronRight size={13} className="ml-1" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EnterpriseBlueprintMetrics() {
  const totalDomains = blueprintWorkspaces.reduce((sum, ws) => sum + ws.domains.length, 0);
  const sourceAssets = blueprintWorkspaces.reduce(
    (sum, ws) => sum + ws.domains.reduce((inner, domain) => inner + domain.tables.length, 0),
    0
  );
  const activePipelines = blueprintPipelines.length;
  const maskedAssets = maskedAssetSamples.length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard icon={Briefcase} label="Workspaces" value={blueprintWorkspaces.length} helper={`${totalDomains} business domains`} />
      <MetricCard icon={Database} label="Source Assets" value={sourceAssets} helper="Tables across domains" />
      <MetricCard icon={Shield} label="Masked Assets" value={maskedAssets} helper="Sandbox-scoped outputs" />
      <MetricCard icon={Activity} label="Pipelines" value={activePipelines} helper="Editable configurations" />
    </div>
  );
}

function DashboardSummary() {
  const [summary, setSummary] = useState({
    totalJobs: 0,
    latestStatus: 'No Runs',
    latestRows: 0,
    outputAvailable: 'No',
  });

  const fetchSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/jobs/history`);
      const jobs = response.data.jobs || [];

      if (jobs.length === 0) {
        setSummary({ totalJobs: 0, latestStatus: 'No Runs', latestRows: 0, outputAvailable: 'No' });
        return;
      }

      const latestJob = jobs[0];
      setSummary({
        totalJobs: jobs.length,
        latestStatus: latestJob.status,
        latestRows: latestJob.rows_processed || 0,
        outputAvailable: latestJob.output_target ? 'Yes' : 'No',
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <MetricCard icon={Activity} label="Total Jobs" value={summary.totalJobs} helper="Backend session runs" />
      <MetricCard icon={CheckCircle2} label="Latest Status" value={summary.latestStatus} helper="Most recent job" />
      <MetricCard icon={Database} label="Latest Rows" value={summary.latestRows.toLocaleString()} helper="Rows processed" />
      <MetricCard icon={FileText} label="Masked Output" value={summary.outputAvailable} helper="CSV available" />
    </div>
  );
}

function JobHistory() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/jobs/history`);
      setJobs(response.data.jobs || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError('Unable to load job history from backend.');
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Job History</h2>
            <p className="text-[13px] text-slate-500">Tracks anonymization runs submitted during this backend session.</p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={fetchHistory}>
            Refresh History
          </Button>
        </div>

        {loading && <p className="mt-5 text-[13px] text-slate-500">Loading job history...</p>}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-[13px] text-slate-600">
            No jobs yet. Run an anonymization job to populate history.
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Job ID</th>
                  <th className="px-4 py-3 font-medium">Dataset</th>
                  <th className="px-4 py-3 font-medium">Source Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created At</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Columns Masked</th>
                  <th className="px-4 py-3 font-medium">Execution Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.job_id} className="bg-white">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{job.job_id}</td>
                    <td className="px-4 py-3 text-slate-700">{job.dataset_name || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-700">{job.source_type || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{new Date(job.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-900">{job.rows_processed?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-900">{job.columns_masked}</td>
                    <td className="px-4 py-3 text-slate-600">{job.execution_mode}</td>
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

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="High-level view of pipeline activity, recent jobs, anonymization status, and output readiness."
        icon={LayoutDashboard}
      />
      <EnterpriseBlueprintMetrics />
      <DashboardSummary />
      <WorkspaceCards />
      <JobHistory />
    </div>
  );
}
