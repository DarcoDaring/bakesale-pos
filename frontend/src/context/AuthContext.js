import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { login as apiLogin } from '../services/api';

const AuthContext = createContext(null);

// We need a way to call PermissionContext.reload from here.
// Simplest approach: expose a callback ref that PermissionContext sets.
export const permissionReloadRef = { current: null };

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token    = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user_data');
    if (token && userData) {
      try { setUser(JSON.parse(userData)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const { data } = await apiLogin(username, password);
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    const userData = { id: data.user_id, username: data.username, role: data.role };
    localStorage.setItem('user_data', JSON.stringify(userData));
    setUser(userData);
    // Reload permissions after login
    setTimeout(() => permissionReloadRef.current?.(), 100);
    return userData;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    // Clear permissions on logout
    setTimeout(() => permissionReloadRef.current?.(), 100);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);