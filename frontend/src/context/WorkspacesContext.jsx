import { createContext, useContext, useState } from 'react';
import { blueprintWorkspaces } from '../lib/constants';

const WorkspacesContext = createContext(null);

export function WorkspacesProvider({ children }) {
  const [workspaces, setWorkspaces] = useState(blueprintWorkspaces);
  const addWorkspace = (workspace) => setWorkspaces((prev) => [workspace, ...prev]);
  return (
    <WorkspacesContext.Provider value={{ workspaces, addWorkspace }}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces() {
  return useContext(WorkspacesContext);
}
