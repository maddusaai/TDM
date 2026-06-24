import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Table2, ArrowLeft, Database } from 'lucide-react';
import { API_BASE_URL } from '../lib/constants';

function getClassification(column) {
  const name = column.name.toLowerCase();
  if (name.includes('ssn') || name.includes('social_security')) return 'Highly Sensitive';
  if (name.includes('name') || name.includes('email') || name.includes('phone') || name.includes('address') || name.includes('username')) return 'PII';
  if (name.includes('dob') || name.includes('birth') || name.includes('date_of_birth')) return 'Sensitive';
  if (name.endsWith('_id') || name === 'id') return 'Identifier';
  if (name.includes('balance') || name.includes('salary') || name.includes('amount') || name.includes('pay')) return 'Financial';
  return 'Non-Sensitive';
}

function getTag(column) {
  const c = getClassification(column);
  if (c === 'Highly Sensitive') return 'CONFIDENTIAL';
  if (c === 'PII') return 'PII';
  if (c === 'Sensitive') return 'SENSITIVE';
  if (c === 'Financial') return 'FINANCIAL';
  if (c === 'Identifier') return 'IDENTIFIER';
  return 'PUBLIC';
}

const TAG_COLORS = {
  CONFIDENTIAL: 'bg-rose-600 text-white',
  PII: 'bg-amber-500 text-white',
  SENSITIVE: 'bg-orange-400 text-white',
  FINANCIAL: 'bg-blue-600 text-white',
  IDENTIFIER: 'bg-slate-600 text-white',
  PUBLIC: 'bg-slate-200 text-slate-600',
};

const CLASS_COLORS = {
  'Highly Sensitive': 'bg-rose-50 text-rose-700',
  'PII': 'bg-amber-50 text-amber-700',
  'Sensitive': 'bg-orange-50 text-orange-700',
  'Financial': 'bg-blue-50 text-blue-700',
  'Identifier': 'bg-slate-100 text-slate-600',
  'Non-Sensitive': 'bg-slate-100 text-slate-400',
};

export default function DataAssetTablePage() {
  const { connectionId, datasetId } = useParams();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState(null);
  const [sandbox, setSandbox] = useState(null);
  const [activeVersion, setActiveVersion] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dsRes, sbRes, vRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/datasets`),
          axios.get(`${API_BASE_URL}/sandboxes`),
          axios.get(`${API_BASE_URL}/metadata/versions`),
        ]);
        const ds = (dsRes.data.datasets || []).find((d) => d.dataset_id === datasetId);
        setDataset(ds || null);
        if (ds?.sandbox_id) {
          const sb = (sbRes.data.sandboxes || []).find((s) => s.sandbox_id === ds.sandbox_id);
          setSandbox(sb || null);
          if (sb) {
            const av = (vRes.data.versions || []).find((v) => v.metadata_version_id === sb.active_metadata_version_id);
            setActiveVersion(av || null);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [datasetId]);

  if (loading) return <div className="p-8 text-[13px] text-slate-400">Loading…</div>;
  if (!dataset) return <div className="p-8 text-[13px] text-slate-400">Table not found.</div>;

  const piiCount = (dataset.columns || []).filter((c) => c.pii).length;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-slate-400">
        <button onClick={() => navigate('/admin/data-classification')} className="hover:text-indigo-600 flex items-center gap-1">
          <ArrowLeft size={13} /> Data Assets
        </button>
        <span>/</span>
        <button onClick={() => navigate(`/admin/data-assets/${connectionId}`)} className="hover:text-indigo-600 flex items-center gap-1">
          <Database size={12} /> {dataset.database_name}
        </button>
        <span>/</span>
        <span className="text-slate-700 font-medium">{dataset.table_name}</span>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-100 p-2.5">
            <Table2 size={18} className="text-slate-500" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-slate-900">{dataset.table_name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{dataset.source_type || 'Connected'}</span>
              {dataset.database_name && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{dataset.database_name}</span>
              )}
              {sandbox && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">
                  {sandbox.project_id} · {sandbox.target_environment}
                </span>
              )}
              {activeVersion && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  {activeVersion.version_label} ACTIVE
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                {dataset.row_count?.toLocaleString() || '—'} rows
              </span>
              {piiCount > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{piiCount} PII cols</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Classification table */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <p className="text-[13px] font-semibold text-slate-800">Column Classification</p>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500">
            {dataset.columns?.length || 0} columns
          </span>
        </div>

        {(!dataset.columns || dataset.columns.length === 0) ? (
          <p className="px-6 py-8 text-[13px] text-slate-400">No column data available for this table.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Column</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Classification</th>
                  <th className="px-6 py-3">Masking Rule</th>
                  <th className="px-6 py-3">Override</th>
                  <th className="px-6 py-3">Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.columns.map((col) => {
                  const cls = getClassification(col);
                  const tag = getTag(col);
                  return (
                    <tr key={col.name} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-medium text-slate-900">{col.name}</td>
                      <td className="px-6 py-3.5 font-mono text-[12px] text-slate-500">{col.type || 'unknown'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASS_COLORS[cls] || 'bg-slate-100 text-slate-500'}`}>
                          {cls}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">{col.rule || 'No Masking'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${col.override_allowed !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {col.override_allowed !== false ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG_COLORS[tag] || 'bg-slate-200 text-slate-600'}`}>
                          {tag}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
