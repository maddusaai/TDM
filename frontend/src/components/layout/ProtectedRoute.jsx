import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (requiredRole && currentUser.role !== requiredRole) {
    return <Navigate to={currentUser.role === 'admin' ? '/admin/dashboard' : '/dev/dashboard'} replace />;
  }
  return children;
}
