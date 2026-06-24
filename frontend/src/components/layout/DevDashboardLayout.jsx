import { useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';

export default function DevDashboardLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-indigo-600 text-sm">TDM Platform</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{currentUser?.name}</span>
          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-medium">developer</span>
          <button onClick={handleLogout} className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <div className="p-6 max-w-7xl mx-auto">
        <Outlet />
      </div>
    </div>
  );
}
