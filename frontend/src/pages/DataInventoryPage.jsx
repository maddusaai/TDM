import { useEffect, useState } from 'react';
import axios from 'axios';
import { Boxes } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { API_BASE_URL } from '../lib/constants';

export default function DataInventoryPage() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/datasets`);
      setDatasets(response.data.datasets || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Inventory"
        description="View uploaded and generated datasets, detected schema, source type, and available columns."
        icon={Boxes}
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Available Datasets</h2>
              <p className="text-[13px] text-slate-500">Datasets exist for the current backend session.</p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={fetchDatasets}>
              Refresh
            </Button>
          </div>

          {loading && <p className="mt-5 text-[13px] text-slate-500">Loading datasets...</p>}

          {!loading && datasets.length === 0 && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-[13px] text-slate-600">
              No datasets found. Go to Execute → Pipeline Workspace to upload or generate data.
            </div>
          )}

          {!loading && datasets.length > 0 && (
            <div className="mt-6 grid gap-4">
              {datasets.map((dataset) => (
                <div key={dataset.dataset_id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{dataset.filename}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Source: {dataset.source_type} · Uploaded:{' '}
                        {new Date(dataset.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                      {dataset.columns?.length || 0} columns
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(dataset.columns || []).map((column) => (
                      <span
                        key={column.name}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                          column.pii ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {column.name}: {column.rule}
                      </span>
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
