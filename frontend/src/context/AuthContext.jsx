import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = sessionStorage.getItem('tdm_user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = (user) => {
    sessionStorage.setItem('tdm_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const logout = () => {
    sessionStorage.removeItem('tdm_user');
    sessionStorage.removeItem('tdm_backend_session_id');
    setCurrentUser(null);
  };

  const isAdmin = currentUser?.role === 'admin';
  const permissions = currentUser?.permissions || [];

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, isAdmin, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
