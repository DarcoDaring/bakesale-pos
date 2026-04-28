import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const KaapiPermContext = createContext({ can: () => false, permissions: {}, reload: () => {} });

export function KaapiPermissionProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState({});

  const load = async () => {
    if (!user || isAdmin) return;
    try {
      const { data } = await api.get('/kaapi-permissions/me/');
      setPermissions(data || {});
    } catch {
      setPermissions({});
    }
  };

  useEffect(() => { load(); }, [user]);

  const can = key => !!permissions[key];

  return (
    <KaapiPermContext.Provider value={{ can, permissions, reload: load }}>
      {children}
    </KaapiPermContext.Provider>
  );
}

export function useKaapiPermissions() {
  return useContext(KaapiPermContext);
}
