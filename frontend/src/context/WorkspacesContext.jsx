import { createContext, useContext, useState, useEffect } from 'react';
import { blueprintWorkspaces } from '../lib/constants';

const WorkspacesContext = createContext(null);

const SESSION_KEY = 'tdm_workspaces';

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return blueprintWorkspaces;
    const saved = JSON.parse(raw);
    const savedIds = new Set(saved.map((w) => w.id));
    return [...saved, ...blueprintWorkspaces.filter((w) => !savedIds.has(w.id))];
  } catch {
    return blueprintWorkspaces;
  }
}

export function WorkspacesProvider({ children }) {
  const [workspaces, setWorkspaces] = useState(loadFromSession);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  const addWorkspace = (workspace) => {
    const newWs = {
      id: `ws-${Date.now()}`,
      status: 'Active',
      members: [],
      connector_ids: [],
      domains: [],
      created_by: null,
      ...workspace,
    };
    setWorkspaces((prev) => [newWs, ...prev]);
    return newWs;
  };

  const updateWorkspace = (id, updates) => {
    setWorkspaces((prev) => prev.map((w) => w.id === id ? { ...w, ...updates } : w));
  };

  // Returns workspaces where a user (by id or email) is a member
  const getWorkspacesForUser = (userIdOrEmail) => {
    return workspaces.filter((ws) =>
      ws.members?.some(
        (m) => m.user_id === userIdOrEmail || m.email === userIdOrEmail
      )
    );
  };

  return (
    <WorkspacesContext.Provider value={{ workspaces, addWorkspace, updateWorkspace, getWorkspacesForUser }}>
      {children}
    </WorkspacesContext.Provider>
  );
}

export function useWorkspaces() {
  return useContext(WorkspacesContext);
}
