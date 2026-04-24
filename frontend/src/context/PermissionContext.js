import React, { createContext, useContext, useState, useEffect } from 'react';
import { getMyPermissions } from '../services/api';
import { permissionReloadRef } from './AuthContext';

const PermissionContext = createContext({ isAdmin: true, can: () => true, reload: () => {} });

export function PermissionProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(true);
  const [perms,   setPerms]   = useState(null);

  const load = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      // Not logged in — reset to defaults
      setIsAdmin(true);
      setPerms(null);
      return;
    }
    try {
      const { data } = await getMyPermissions();
      if (data.is_admin) {
        setIsAdmin(true);
        setPerms(null);
      } else {
        setIsAdmin(false);
        setPerms(data);
      }
    } catch {
      // On error (e.g. after logout), reset
      setIsAdmin(true);
      setPerms(null);
    }
  };

  // Register load with AuthContext so it gets called after login/logout
  useEffect(() => {
    permissionReloadRef.current = load;
  }, []);

  // Initial load
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) load();
  }, []);

  const can = (field) => {
    if (isAdmin) return true;
    if (!perms) return true; // no perms loaded yet = allow (prevents flicker)
    // If field exists and is explicitly false → deny. Otherwise allow.
    if (field in perms) return !!perms[field];
    return true; // unknown field = allow by default
  };

  return (
    <PermissionContext.Provider value={{ isAdmin, perms, can, reload: load }}>
      {children}
    </PermissionContext.Provider>
  );
}

export const usePermissions = () => useContext(PermissionContext);