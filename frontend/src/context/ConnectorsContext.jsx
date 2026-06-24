import { createContext, useContext, useState } from 'react';
import { blueprintConnections } from '../lib/constants';

const ConnectorsContext = createContext(null);

export function ConnectorsProvider({ children }) {
  const [connectors, setConnectors] = useState(blueprintConnections);
  const addConnector = (connector) => setConnectors((prev) => [connector, ...prev]);
  const updateConnectorStatus = (name, status) =>
    setConnectors((prev) => prev.map((c) => c.name === name ? { ...c, status } : c));
  return (
    <ConnectorsContext.Provider value={{ connectors, addConnector, updateConnectorStatus }}>
      {children}
    </ConnectorsContext.Provider>
  );
}

export function useConnectors() {
  return useContext(ConnectorsContext);
}
