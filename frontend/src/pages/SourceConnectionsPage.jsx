import { useState } from 'react';
import { Plug, Info } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useConnectors } from '../context/ConnectorsContext';
import { TEST_CONNECTOR_STRINGS, connectorTableData } from '../lib/constants';

export default function SourceConnectionsPage() {
  const { connectors: connections, addConnector, updateConnectorStatus } = useConnectors();
  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState('SQL Server');
  const [connectionString, setConnectionString] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('');
  const [showTestGuide, setShowTestGuide] = useState(false);

  const addConnection = () => {
    if (!connectionName.trim()) return;
    const isTestConn = TEST_CONNECTOR_STRINGS.includes(connectionString.trim());
    const newConnection = {
      name: connectionName.trim(),
      type: connectionType,
      sourceType: connectionType === 'SFTP' ? 'File' : 'DB',
      connection: connectionString.trim() || (connectionType === 'SFTP' ? 'sftp://feeds.company.com/inbound' : 'server.company.com:1433/DDB'),
      status: isTestConn ? 'Connected' : 'Draft',
      purpose: isTestConn
        ? `Test connector — ${connectorTableData[connectionString.trim()]?.database} database`
        : 'New connection created from UI simulation',
    };
    addConnector(newConnection);
    setConnectionStatus(
      isTestConn
        ? `✓ Connection ${newConnection.name} verified and connected. ${Object.values(connectorTableData[connectionString.trim()]?.tables || []).length} tables available.`
        : `Connection ${newConnection.name} added as Draft.`
    );
    setConnectionName(''); setConnectionString('');
  };

  const testConnection = (conn) => {
    if (TEST_CONNECTOR_STRINGS.includes(conn.connection)) {
      updateConnectorStatus(conn.name, 'Connected');
      const tableCount = connectorTableData[conn.connection]?.tables?.length || 0;
      setConnectionStatus(`✓ Test successful for ${conn.name}. ${tableCount} tables discovered.`);
    } else {
      setConnectionStatus(`Connection test successful for ${conn.name}.`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Source Connections"
        description="Enterprise-style connection catalog for source and target systems used by TDM pipelines."
        icon={Plug}
      />

      {/* Test connector reference card */}
      <Card className="rounded-2xl border-indigo-100 bg-indigo-50/60 shadow-sm">
        <CardContent className="p-4">
          <button
            onClick={() => setShowTestGuide((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-700 w-full text-left"
          >
            <Info size={15} /> Test Connectors — use these connection strings to simulate a real connection
            <span className="ml-auto text-xs text-indigo-400">{showTestGuide ? 'Hide ▲' : 'Show ▼'}</span>
          </button>
          {showTestGuide && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-indigo-100 bg-white">
              <table className="w-full text-[13px]">
                <thead className="bg-indigo-50 text-[11px] uppercase text-indigo-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Connector Name</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Connection String (paste this)</th>
                    <th className="px-4 py-2 text-left">Tables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { name: 'TEST_RETAIL_DB',  type: 'SQL Server', conn: 'test-retail.tdm.local:1433/RetailDB' },
                    { name: 'TEST_FINANCE_DB', type: 'Oracle',     conn: 'test-finance.tdm.local:1521/FinanceDB' },
                    { name: 'TEST_HR_DB',      type: 'Databricks', conn: 'test-hr-catalog.tdm.local/hr_schema' },
                  ].map((r) => (
                    <tr key={r.name}>
                      <td className="px-4 py-2 font-semibold text-slate-800">{r.name}</td>
                      <td className="px-4 py-2 text-slate-500">{r.type}</td>
                      <td className="px-4 py-2 font-mono text-indigo-600 text-[12px]">{r.conn}</td>
                      <td className="px-4 py-2 text-slate-500">{connectorTableData[r.conn]?.tables.map(t => t.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Create Connection</h2>
              <p className="text-[13px] text-slate-500">Enter connection details. Use a test connection string above to auto-verify.</p>
            </div>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-medium text-purple-700">Connection Manager</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Connection Name</label>
              <input
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="e.g., TEST_RETAIL_DB"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Database / Source Type</label>
              <select
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300"
              >
                <option>SQL Server</option>
                <option>Databricks</option>
                <option>Oracle</option>
                <option>SFTP</option>
                <option>Salesforce</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Connection String</label>
              <input
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="e.g., test-retail.tdm.local:1433/RetailDB"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-300"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={addConnection} className="rounded-xl" disabled={!connectionName.trim()}>Add Connection</Button>
          </div>

          {connectionStatus && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${connectionStatus.startsWith('✓') ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
              {connectionStatus}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Connection Catalog</h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Connection</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Source Type</th>
                  <th className="px-4 py-3">Connection String</th>
                  <th className="px-4 py-3">Tables</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {connections.map((connection) => {
                  const tableInfo = connectorTableData[connection.connection];
                  return (
                    <tr key={connection.name}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{connection.name}</td>
                      <td className="px-4 py-3 text-slate-600">{connection.type}</td>
                      <td className="px-4 py-3 text-slate-600">{connection.sourceType}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[12px]">{connection.connection}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {tableInfo ? (
                          <span className="text-indigo-600 font-medium">{tableInfo.tables.length} tables</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${connection.status === 'Connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {connection.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="outline" className="rounded-xl" onClick={() => testConnection(connection)}>
                          Test
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
