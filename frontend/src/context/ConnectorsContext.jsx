import { createContext, useContext, useState, useEffect } from 'react';
import { blueprintConnections } from '../lib/constants';

const ConnectorsContext = createContext(null);

const SESSION_KEY = 'tdm_connectors';

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return blueprintConnections;
    const saved = JSON.parse(raw);
    const savedIds = new Set(saved.map((c) => c.id));
    return [...saved, ...blueprintConnections.filter((c) => !savedIds.has(c.id))];
  } catch {
    return blueprintConnections;
  }
}

export function ConnectorsProvider({ children }) {
  const [connectors, setConnectors] = useState(loadFromSession);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(connectors));
  }, [connectors]);

  const addConnector = (connector) => {
    const newConn = {
      id: `conn-${Date.now()}`,
      created_by: null,
      ...connector,
    };
    setConnectors((prev) => [newConn, ...prev]);
    return newConn;
  };

  const updateConnectorStatus = (name, status) =>
    setConnectors((prev) => prev.map((c) => c.name === name ? { ...c, status } : c));

  // Returns connectors available to a workspace (by connector_ids list on workspace)
  const getConnectorsForWorkspace = (workspace) => {
    if (!workspace?.connector_ids?.length) return connectors;
    return connectors.filter((c) => workspace.connector_ids.includes(c.id));
  };

  return (
    <ConnectorsContext.Provider value={{ connectors, addConnector, updateConnectorStatus, getConnectorsForWorkspace }}>
      {children}
    </ConnectorsContext.Provider>
  );
}

export function useConnectors() {
  return useContext(ConnectorsContext);
}
