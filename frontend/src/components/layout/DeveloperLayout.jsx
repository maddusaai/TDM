import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronLeft, ChevronRight, LogOut, Briefcase, HelpCircle,
} from 'lucide-react';
import { blueprintWorkspaces, wsSlug, ENV_BADGE, WS_NAV } from '../../lib/constants';

const MY_WORKSPACES = blueprintWorkspaces.slice(0, 2).map((ws, i) => ({
  id: `ws-${i}`,
  name: ws.name,
  environment: ws.environment,
  slug: wsSlug(ws.name),
}));

export default function DeveloperLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive active workspace from URL
  const wsMatch = location.pathname.match(/\/dev\/workspaces\/([^/]+)/);
  const activeWsSlug = wsMatch ? wsMatch[1] : null;
  const activeWorkspace = MY_WORKSPACES.find((w) => w.slug === activeWsSlug) || null;

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          {!collapsed && (
            <div>
              <span className="font-bold text-indigo-600 text-sm">TDM Platform</span>
              <p className="text-xs text-gray-400 truncate">{currentUser?.email}</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-gray-100 text-gray-500 ml-auto">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">

          {/* Dashboard link — always visible */}
          {!collapsed && (
            <NavLink
              to="/dev/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-3 transition-colors ${
                  isActive && !activeWsSlug ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <LayoutDashboard size={16} className="flex-shrink-0" />
              <span>Dashboard</span>
            </NavLink>
          )}

          {/* Workspace list */}
          {!collapsed && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">My Workspaces</p>
          )}

          {activeWorkspace && !collapsed && (
            <div className="space-y-0.5">
              {WS_NAV.map((item) => {
                const to = item.tab === ''
                  ? `/dev/workspaces/${activeWorkspace.slug}`
                  : `/dev/workspaces/${activeWorkspace.slug}/${item.tab}`;
                const isNavActive = item.tab === ''
                  ? location.pathname === `/dev/workspaces/${activeWorkspace.slug}`
                  : location.pathname === to;
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(to)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isNavActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon size={16} className="flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Help — always visible */}
          {!collapsed && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <NavLink
                to="/dev/help"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
                  }`
                }
              >
                <HelpCircle size={16} className="flex-shrink-0" />
                <span>Documentation</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-gray-100">
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{currentUser?.name}</p>
                <p className="text-xs text-indigo-500 truncate">developer</p>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 ml-2" title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Logout">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {activeWorkspace && (
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Briefcase size={14} className="text-gray-400" />
              <span className="font-medium text-gray-700">{activeWorkspace.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ENV_BADGE[activeWorkspace.environment] || 'bg-slate-100 text-slate-500'}`}>
                {activeWorkspace.environment}
              </span>
            </div>
            <span className="text-xs text-gray-400">Workspace scope</span>
          </div>
        )}
        <div className="p-6">
          <Outlet context={{ activeWorkspace }} />
        </div>
      </main>
    </div>
  );
}
