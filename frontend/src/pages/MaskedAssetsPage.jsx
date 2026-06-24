import { useState } from 'react';
import { TableProperties, Shield, Layers, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { maskedAssetSamples } from '../lib/constants';

export default function MaskedAssetsPage() {
  const [selectedAsset, setSelectedAsset] = useState(maskedAssetSamples[0]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Masked Data Assets"
        description="Browse masked outputs by workspace, sandbox schema, table group, and readiness status."
        icon={TableProperties}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={Shield} label="Masked Assets" value={maskedAssetSamples.length} helper="Cataloged outputs" />
        <MetricCard icon={Layers} label="Sandbox Scoped" value="100%" helper="Isolated by schema" />
        <MetricCard icon={CheckCircle2} label="Ready Assets" value={maskedAssetSamples.filter((asset) => asset.status === 'Ready').length} helper="Available to testers" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Masked Asset Catalog</h2>
            <div className="mt-5 space-y-3">
              {maskedAssetSamples.map((asset) => (
                <button
                  key={asset.asset}
                  type="button"
                  onClick={() => setSelectedAsset(asset)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedAsset.asset === asset.asset
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{asset.asset}</p>
                      <p className="mt-1 break-all text-[11px] text-slate-500">{asset.sandbox}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium text-emerald-700">{asset.status}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-slate-600">{asset.tables.length} tables · {asset.rows} rows</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{selectedAsset.asset}</h2>
                <p className="text-[13px] text-slate-500">Preview masked data asset details and table coverage.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">Masked Ready</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-medium text-slate-500">Workspace</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedAsset.workspace}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-medium text-slate-500">Sandbox Schema</p>
                <p className="mt-1 break-all font-semibold text-slate-900">{selectedAsset.sandbox}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-medium text-slate-500">Rows</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedAsset.rows}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-[11px] font-medium text-slate-500">Isolation</p>
                <p className="mt-1 font-semibold text-slate-900">ISOLATED</p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[13px] font-semibold text-slate-900">Tables</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAsset.tables.map((table) => (
                  <span key={table} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">{table}</span>
                ))}
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">patient_id</th>
                    <th className="px-4 py-3">first_name</th>
                    <th className="px-4 py-3">ssn</th>
                    <th className="px-4 py-3">email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[1, 2, 3, 4].map((index) => (
                    <tr key={index}>
                      <td className="px-4 py-3">a4e76f{index}</td>
                      <td className="px-4 py-3">FakeName{index}</td>
                      <td className="px-4 py-3">10*****0{index}</td>
                      <td className="px-4 py-3">masked{index}@example.com</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
