import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Tags, Search, ChevronRight, ChevronDown,
  Database, Table2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { API_BASE_URL } from '../lib/constants';

const ENV_COLORS = {
  PROD: 'bg-red-50 text-red-600',
  UAT: 'bg-yellow-50 text-yellow-600',
  DEV: 'bg-green-50 text-green-700',
};

export default function DataClassificationPage() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState([]);
  const [sandboxes, setSandboxes] = useState([]);
  const [versions, setVersions] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedDbs, setExpandedDbs] = useState(new Set());
  const [selectedConnId, setSelectedConnId] = useState(null);

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

  // enrich datasets
  const enriched = datasets.map((d) => {
    const sb = d.sandbox_id ? sandboxes.find((s) => s.sandbox_id === d.sandbox_id) : null;
    const av = sb ? versions.find((v) => v.metadata_version_id === sb.active_metadata_version_id) : null;
    const pending = sb ? inbox.filter((r) => r.sandbox_id === sb.sandbox_id) : [];
    const piiCount = (d.columns || []).filter((c) => c.pii).length;
    return { ...d, sandbox: sb, activeVersion: av, pendingCount: pending.length, piiCount };
  });

  // group by database_name
  const dbGroups = enriched.reduce((acc, d) => {
    const key = d.connection_id || 'unlinked';
    if (!acc[key]) acc[key] = { connection_id: key, database_name: d.database_name || 'Unlinked Datasets', tables: [] };
    acc[key].tables.push(d);
    return acc;
  }, {});

  const dbList = Object.values(dbGroups);

  // filter by search
  const filteredDbs = dbList.map((db) => ({
    ...db,
    tables: db.tables.filter((t) =>
      !search || t.table_name?.toLowerCase().includes(search.toLowerCase()) || t.filename?.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((db) => db.tables.length > 0 || !search);

  const toggleDb = (connId) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      next.has(connId) ? next.delete(connId) : next.add(connId);
      return next;
    });
    setSelectedConnId(connId);
  };

  const selectedDb = dbGroups[selectedConnId];
  const selectedTables = selectedDb?.tables || [];

  const dbPiiCount = (db) => db.tables.reduce((s, t) => s + t.piiCount, 0);
  const dbDriftCount = (db) => db.tables.reduce((s, t) => s + t.pendingCount, 0);
  const dbActiveVersion = (db) => {
    for (const t of db.tables) { if (t.activeVersion) return t.activeVersion; }
    return null;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Assets"
        description="Source databases and their tables — browse, classify, and govern schema versions."
        icon={Tags}
      />

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpandedDbs(new Set(dbList.map((d) => d.connection_id))); }}
            placeholder="Search tables…"
            className="w-60 rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
        </div>
        <span className="text-[12px] text-slate-400">{enriched.length} tables across {dbList.length} databases</span>
        <button onClick={fetchAll} className="ml-auto text-[12px] text-indigo-600 hover:underline">Refresh</button>
      </div>

      <div className="flex gap-4 items-start">

        {/* ── Left: DB tree ── */}
        <div className="w-64 flex-shrink-0 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Databases</p>
          </div>

          {loading && <p className="py-6 text-center text-[12px] text-slate-400">Loading…</p>}

          <div className="divide-y divide-slate-100">
            {filteredDbs.map((db) => {
              const isOpen = expandedDbs.has(db.connection_id);
              const isSelected = selectedConnId === db.connection_id;
              const driftCount = dbDriftCount(db);

              return (
                <div key={db.connection_id}>
                  {/* DB header */}
                  <button
                    onClick={() => toggleDb(db.connection_id)}
                    className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${isSelected ? 'bg-indigo-50' : ''}`}
                  >
                    {isOpen
                      ? <ChevronDown size={13} className="flex-shrink-0 text-slate-400" />
                      : <ChevronRight size={13} className="flex-shrink-0 text-slate-400" />
                    }
                    <Database size={13} className={`flex-shrink-0 ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {db.database_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-400">{db.tables.length} tables</span>
                        {driftCount > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                            {driftCount} drift
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Table rows */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50">
                      {db.tables.map((t) => (
                        <button
                          key={t.dataset_id}
                          onClick={() => navigate(`/admin/data-assets/${db.connection_id}/table/${t.dataset_id}`)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 pl-9 text-left hover:bg-indigo-50 transition-colors group"
                        >
                          <Table2 size={11} className="flex-shrink-0 text-slate-300 group-hover:text-indigo-400" />
                          <span className="flex-1 truncate text-[12px] text-slate-700 group-hover:text-indigo-700">{t.table_name}</span>
                          <div className="flex items-center gap-1">
                            {t.piiCount > 0 && (
                              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">{t.piiCount}P</span>
                            )}
                            {t.pendingCount > 0 && (
                              <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-medium text-rose-600">!</span>
                            )}
                          </div>
                          <ChevronRight size={11} className="flex-shrink-0 text-slate-300 group-hover:text-indigo-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && filteredDbs.length === 0 && (
              <p className="py-6 text-center text-[12px] text-slate-400">No databases found.</p>
            )}
          </div>
        </div>

        {/* ── Right: selected DB summary + table grid ── */}
        <div className="flex-1 min-w-0">
          {!selectedDb ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-24 text-center">
              <Database size={32} className="mb-3 text-slate-200" />
              <p className="text-[14px] font-medium text-slate-400">Select a database</p>
              <p className="mt-1 text-[12px] text-slate-300">Click a database in the tree to explore its tables</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* DB header card */}
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-indigo-500" />
                      <h2 className="text-[15px] font-semibold text-slate-900">{selectedDb.database_name}</h2>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                        {selectedTables.length} tables
                      </span>
                      {dbPiiCount(selectedDb) > 0 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                          {dbPiiCount(selectedDb)} PII columns
                        </span>
                      )}
                      {dbActiveVersion(selectedDb) && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {dbActiveVersion(selectedDb).version_label} ACTIVE
                        </span>
                      )}
                      {dbDriftCount(selectedDb) > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <AlertTriangle size={10} /> {dbDriftCount(selectedDb)} drift pending
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/data-assets/${selectedDb.connection_id}`)}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-indigo-700"
                  >
                    Open DB Overview
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* Tables grid */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Table</th>
                      <th className="px-5 py-3">Rows</th>
                      <th className="px-5 py-3">PII Cols</th>
                      <th className="px-5 py-3">Version</th>
                      <th className="px-5 py-3">Drift</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTables.map((t) => (
                      <tr
                        key={t.dataset_id}
                        className="group cursor-pointer hover:bg-indigo-50/40 transition-colors"
                        onClick={() => navigate(`/admin/data-assets/${selectedDb.connection_id}/table/${t.dataset_id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <Table2 size={13} className="flex-shrink-0 text-slate-300" />
                            <span className="font-medium text-slate-900">{t.table_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{t.row_count?.toLocaleString() || '—'}</td>
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
                            ? <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><AlertTriangle size={10} />{t.pendingCount} pending</span>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
