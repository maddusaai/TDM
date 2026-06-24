import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { API_BASE_URL } from '../lib/constants';

export default function JobHistoryPage() {
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
    <div className="space-y-6">
      <PageHeader
        title="Job History"
        description="Track all anonymization runs submitted during this backend session."
        icon={History}
      />

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
    </div>
  );
}
