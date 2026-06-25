import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Shield, Upload, Network, Tag,
  ChevronLeft, ChevronRight, LogOut, Briefcase,
  Play, List, Eye, Clock, CreditCard, Users, History
} from 'lucide-react';

import { blueprintWorkspaces, wsSlug, ENV_BADGE, WS_NAV, API_BASE_URL } from '../../lib/constants';

const BLUEPRINT_WORKSPACES = blueprintWorkspaces.map((ws, i) => ({
  id: `ws-${i}`,
  name: ws.name,
  environment: ws.environment,
  slug: wsSlug(ws.name),
}));

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [sandboxes, setSandboxes] = useState([]);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    axios.get(`${API_BASE_URL}/sandboxes`).then((r) => setSandboxes(r.data.sandboxes || [])).catch(() => {});
  }, []);

  const wsMatch = location.pathname.match(/\/admin\/workspaces\/([^/]+)/);
  const activeWsSlug = wsMatch ? wsMatch[1] : null;

  const blueprintMatch = BLUEPRINT_WORKSPACES.find((w) => w.slug === activeWsSlug) || null;
  const sandboxMatch   = !blueprintMatch && activeWsSlug
    ? sandboxes.find((s) => s.sandbox_id === activeWsSlug)
    : null;

  const activeWorkspace = blueprintMatch || (sandboxMatch ? {
    slug: sandboxMatch.sandbox_id,
    name: `${sandboxMatch.project_id} — ${sandboxMatch.target_environment}`,
    environment: sandboxMatch.target_environment,
  } : null);

  useEffect(() => {
    setCollapsed(!!activeWorkspace);
  }, [activeWsSlug]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navSections = [
    {
      label: 'Main',
      items: [
        { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/admin/data-inventory', icon: Upload, label: 'Data Inventory' },
        { to: '/admin/workspaces', icon: Briefcase, label: 'Workspaces' },
        { to: '/admin/metadata-versions', icon: History, label: 'Metadata Versions' },
      ],
    },
    {
      label: 'Configure',
      items: [
        { to: '/admin/source-connections', icon: Network, label: 'Source Connections' },
        { to: '/admin/data-classification', icon: Tag, label: 'Data Assets' },
        { to: '/admin/masking-rules', icon: Shield, label: 'Masking Rules' },
      ],
    },
    {
      label: 'Execute',
      items: [
        { to: '/admin/pipelines', icon: List, label: 'Pipelines' },
        { to: '/admin/masked-assets', icon: Eye, label: 'Masked Data Assets' },
        { to: '/admin/job-history', icon: Clock, label: 'Job History' },
      ],
    },
    {
      label: 'Org Settings',
      items: [
        { to: '/admin/org/members', icon: Users, label: 'Members' },
        { to: '/admin/org/billing', icon: CreditCard, label: 'Billing' },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          {!collapsed && (
            <span className="font-bold text-indigo-600 text-sm">TDM Platform</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 ml-auto"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navSections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={16} className="flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-gray-100">
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{currentUser?.name}</p>
                <p className="text-xs text-gray-400 truncate">{currentUser?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 ml-2"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center p-1.5 rounded hover:bg-gray-100 text-gray-400"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Workspace slide-in panel */}
      {activeWorkspace && (
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspace</p>
            <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{activeWorkspace.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${ENV_BADGE[activeWorkspace.environment] || 'bg-slate-100 text-slate-500'}`}>
              {activeWorkspace.environment}
            </span>
          </div>

          {/* Nav items */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
            {WS_NAV.map((item) => {
              const to = item.tab === ''
                ? `/admin/workspaces/${activeWsSlug}`
                : `/admin/workspaces/${activeWsSlug}/${item.tab}`;
              const isNavActive = item.tab === ''
                ? location.pathname === `/admin/workspaces/${activeWsSlug}`
                : location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <button
                  key={item.tab}
                  onClick={() => navigate(to)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isNavActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <item.icon size={16} className="flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Briefcase size={14} />
            {activeWorkspace ? (
              <>
                <span className="text-gray-700 font-medium">{activeWorkspace.name}</span>
                <span className="text-gray-300">/</span>
                <span>Workspace View</span>
              </>
            ) : (
              <span className="text-gray-700 font-medium">Admin View</span>
            )}
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium">
            org_admin
          </span>
        </div>
        <div className="p-6">
          <Outlet context={{ activeWorkspace }} />
        </div>
      </main>
    </div>
  );
}
