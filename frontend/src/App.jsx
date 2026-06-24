import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConnectorsProvider } from './context/ConnectorsContext';
import { WorkspacesProvider } from './context/WorkspacesContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';
import DeveloperLayout from './components/layout/DeveloperLayout';
import DevDashboardLayout from './components/layout/DevDashboardLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DataInventoryPage from './pages/DataInventoryPage';
import WorkspacesPage from './pages/WorkspacesPage';
import MetadataVersionsPage from './pages/MetadataVersionsPage';
import SourceConnectionsPage from './pages/SourceConnectionsPage';
import DataClassificationPage from './pages/DataClassificationPage';
import MaskingRulesPage from './pages/MaskingRulesPage';
import CreatePipelinePage from './pages/CreatePipelinePage';
import ExistingPipelinesPage from './pages/ExistingPipelinesPage';
import MaskedAssetsPage from './pages/MaskedAssetsPage';
import JobHistoryPage from './pages/JobHistoryPage';
import SandboxManagerPage from './pages/SandboxManagerPage';
import WorkspaceDetailPage from './pages/WorkspaceDetailPage';
import DataAssetDBPage from './pages/DataAssetDBPage';
import DataAssetTablePage from './pages/DataAssetTablePage';
import { PlaceholderPage } from './components/ui/PlaceholderPage';
import { API_BASE_URL } from './lib/constants';

function BackendSessionGuard({ children }) {
  const { logout } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkBackendSession = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/`);
        const latestBackendSessionId = response.data.backend_session_id;
        const storedBackendSessionId = sessionStorage.getItem('tdm_backend_session_id');

        if (storedBackendSessionId && storedBackendSessionId !== latestBackendSessionId) {
          logout();
        }

        if (!storedBackendSessionId && latestBackendSessionId) {
          sessionStorage.setItem('tdm_backend_session_id', latestBackendSessionId);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setChecked(true);
      }
    };
    checkBackendSession();
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen bg-slate-100 p-8 text-slate-700">
        Checking backend session...
      </div>
    );
  }

  return children;
}

function AppRoutes() {
  return (
    <BackendSessionGuard>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="data-inventory" element={<DataInventoryPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="metadata-versions" element={<MetadataVersionsPage />} />
          <Route path="source-connections" element={<SourceConnectionsPage />} />
          <Route path="data-classification" element={<DataClassificationPage />} />
          <Route path="data-assets/:connectionId" element={<DataAssetDBPage />} />
          <Route path="data-assets/:connectionId/table/:datasetId" element={<DataAssetTablePage />} />
          <Route path="masking-rules" element={<MaskingRulesPage />} />
          <Route path="create-pipeline" element={<CreatePipelinePage />} />
          <Route path="pipelines" element={<ExistingPipelinesPage />} />
          <Route path="masked-assets" element={<MaskedAssetsPage />} />
          <Route path="job-history" element={<JobHistoryPage />} />
          <Route path="sandbox-manager" element={<SandboxManagerPage />} />
          <Route path="workspaces/:wsId" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/members" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/connectors" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/data-inventory" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/data-classification" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/masking-rules" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/create-pipeline" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/pipelines" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/masked-assets" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/jobs" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/job-history" element={<WorkspaceDetailPage />} />
          <Route path="workspaces/:wsId/schema-versions" element={<WorkspaceDetailPage />} />
          <Route path="org/members" element={<PlaceholderPage title="Members & Roles" description="Manage organization members and role assignments." />} />
          <Route path="org/billing" element={<PlaceholderPage title="Billing & Usage" description="View usage metrics and billing details." />} />
          <Route path="help" element={<PlaceholderPage title="Documentation" description="TDM platform documentation and usage guides." />} />
        </Route>

        {/* Developer dashboard — no sidebar */}
        <Route
          path="/dev"
          element={
            <ProtectedRoute>
              <DevDashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dev/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="help" element={<PlaceholderPage title="Documentation" description="TDM platform documentation and usage guides." />} />
        </Route>

        {/* Developer workspace routes — with sidebar */}
        <Route
          path="/dev/workspaces"
          element={
            <ProtectedRoute>
              <DeveloperLayout />
            </ProtectedRoute>
          }
        >
          <Route path=":wsId" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/members" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/connectors" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/data-inventory" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/data-classification" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/masking-rules" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/create-pipeline" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/pipelines" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/masked-assets" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/jobs" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/job-history" element={<WorkspaceDetailPage />} />
          <Route path=":wsId/schema-versions" element={<WorkspaceDetailPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BackendSessionGuard>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConnectorsProvider>
          <WorkspacesProvider>
            <AppRoutes />
          </WorkspacesProvider>
        </ConnectorsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
