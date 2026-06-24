import { useState } from 'react';
import { History } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { blueprintPipelines, blueprintWorkspaces, blueprintConnections } from '../lib/constants';

export default function ExistingPipelinesPage() {
  const [pipelines, setPipelines] = useState(blueprintPipelines);
  const [selectedPipelineName, setSelectedPipelineName] = useState(blueprintPipelines[0].name);
  const [message, setMessage] = useState('');

  const selectedPipeline = pipelines.find((pipeline) => pipeline.name === selectedPipelineName) || pipelines[0];
  const availableTables = [
    'patient_records', 'appointments', 'insurance_claims',
    'customer_profile', 'customer_contact', 'doctor_reference',
  ];

  const toggleTable = (tableName) => {
    setPipelines((current) =>
      current.map((pipeline) => {
        if (pipeline.name !== selectedPipeline.name) return pipeline;
        const alreadySelected = pipeline.tables.includes(tableName);
        return {
          ...pipeline,
          tables: alreadySelected ? pipeline.tables.filter((t) => t !== tableName) : [...pipeline.tables, tableName],
        };
      })
    );
  };

  const updatePipelineField = (field, value) => {
    setPipelines((current) =>
      current.map((pipeline) => pipeline.name === selectedPipeline.name ? { ...pipeline, [field]: value } : pipeline)
    );
  };

  const savePipeline = () => {
    setMessage(`Saved ${selectedPipeline.name}. ${selectedPipeline.tables.length} table(s) are now selected.`);
  };

  const duplicatePipeline = () => {
    const copyName = `${selectedPipeline.name}_Copy`;
    const copiedPipeline = { ...selectedPipeline, name: copyName, status: 'Draft', lastRun: 'Not executed yet' };
    setPipelines((current) => [copiedPipeline, ...current]);
    setSelectedPipelineName(copyName);
    setMessage(`Duplicated pipeline as ${copyName}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Existing Pipelines"
        description="Open saved pipelines, update source/target mappings, select or unselect tables, and preserve reusable configurations."
        icon={History}
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Pipeline Catalog</h2>
              <p className="text-[13px] text-slate-500">Click a pipeline to edit its configuration.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">Editable</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[960px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Sandbox</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Tables</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipelines.map((pipeline) => (
                  <tr
                    key={pipeline.name}
                    onClick={() => setSelectedPipelineName(pipeline.name)}
                    className={`cursor-pointer ${selectedPipeline.name === pipeline.name ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{pipeline.name}</td>
                    <td className="px-4 py-3 text-slate-600">{pipeline.workspace}</td>
                    <td className="px-4 py-3 text-slate-600">{pipeline.sandbox}</td>
                    <td className="px-4 py-3 text-slate-600">{pipeline.source}</td>
                    <td className="px-4 py-3 text-slate-600">{pipeline.target}</td>
                    <td className="px-4 py-3 text-slate-600">{pipeline.tables.length}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">{pipeline.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Edit Pipeline: {selectedPipeline.name}</h2>
              <p className="text-[13px] text-slate-500">Change mappings and table selection without touching other sandbox configurations.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={duplicatePipeline}>Duplicate</Button>
              <Button className="rounded-xl" onClick={savePipeline}>Save Changes</Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Workspace</label>
              <select value={selectedPipeline.workspace} onChange={(e) => updatePipelineField('workspace', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                {blueprintWorkspaces.map((ws) => <option key={ws.name}>{ws.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Source</label>
              <select value={selectedPipeline.source} onChange={(e) => updatePipelineField('source', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                {blueprintConnections.map((conn) => <option key={conn.name}>{conn.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Target</label>
              <select value={selectedPipeline.target} onChange={(e) => updatePipelineField('target', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                {blueprintConnections.map((conn) => <option key={conn.name}>{conn.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Status</label>
              <select value={selectedPipeline.status} onChange={(e) => updatePipelineField('status', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none">
                <option>Draft</option>
                <option>Ready</option>
                <option>In Review</option>
                <option>Active</option>
              </select>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[13px] font-semibold text-slate-900">Select / Unselect Tables</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {availableTables.map((tableName) => (
                <label key={tableName} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-[13px] text-slate-700">
                  <input type="checkbox" checked={selectedPipeline.tables.includes(tableName)} onChange={() => toggleTable(tableName)} />
                  <span>{tableName}</span>
                </label>
              ))}
            </div>
          </div>

          {message && (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">{message}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
