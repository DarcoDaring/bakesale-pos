import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PermissionProvider, usePermissions } from './context/PermissionContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import Sale from './pages/Sale';
import Purchase from './pages/Purchase';
import Reports from './pages/Reports';
import Stock from './pages/Stock';
import AdminPanel from './pages/AdminPanel';
import ElectronSetup from './components/ElectronSetup';
import KaapiChaiPage    from './KaapiChai/KaapiChaiPage';
import KCSalePage       from './KaapiChai/KCSalePage';
import KCPurchasePage   from './KaapiChai/KCPurchasePage';
import KCStockPage      from './KaapiChai/KCStockPage';
import KCReportPage     from './KaapiChai/KCReportPage';
import KCStoreIssuePage from './KaapiChai/KCStoreIssuePage';
import KCMasterPage     from './KaapiChai/KCMasterPage';

// ── Auto logout when window closes ────────────────────────────────────────────
function AutoLogout() {
  const { logout } = useAuth();
  useEffect(() => {
    const handleClose = () => { logout(); };
    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, [logout]);
  return null;
}

// ── Smart redirect based on permissions ───────────────────────────────────────
function SmartRedirect() {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  if (isAdmin)                                    return <Navigate to="/sale" replace />;
  if (can('can_access_sale'))                     return <Navigate to="/sale" replace />;
  if (can('kc_access') || can('kc_sale'))         return <Navigate to="/kaapi-chai" replace />;
  return <Navigate to="/sale" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth();
  if (!user)    return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/sale" replace />;
  return children;
}

function PermissionedRoute({ children, permKey }) {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  if (isAdmin || can(permKey)) return children;
  if (can('kc_access') || can('kc_sale')) return <Navigate to="/kaapi-chai" replace />;
  return <Navigate to="/sale" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <SmartRedirect /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<SmartRedirect />} />
        <Route path="sale"     element={<PermissionedRoute permKey="can_access_sale"><Sale /></PermissionedRoute>} />
        <Route path="purchase" element={<PermissionedRoute permKey="can_access_purchase"><Purchase /></PermissionedRoute>} />
        <Route path="reports"  element={<PermissionedRoute permKey="can_access_reports"><Reports /></PermissionedRoute>} />
        <Route path="stock"    element={<PermissionedRoute permKey="can_access_stock"><Stock /></PermissionedRoute>} />
        <Route path="admin"    element={<AdminRoute><AdminPanel /></AdminRoute>} />

        {/* ── Kaapi Chai POS ── */}
        <Route path="kaapi-chai"             element={<KaapiChaiPage />} />
        <Route path="kaapi-chai/sale"        element={<PermissionedRoute permKey="kc_sale"><KCSalePage /></PermissionedRoute>} />
        <Route path="kaapi-chai/purchase"    element={<PermissionedRoute permKey="kc_purchase"><KCPurchasePage /></PermissionedRoute>} />
        <Route path="kaapi-chai/stock"       element={<PermissionedRoute permKey="kc_stock"><KCStockPage /></PermissionedRoute>} />
        <Route path="kaapi-chai/report"      element={<PermissionedRoute permKey="kc_report"><KCReportPage /></PermissionedRoute>} />
        <Route path="kaapi-chai/store-issue" element={<PermissionedRoute permKey="kc_store"><KCStoreIssuePage /></PermissionedRoute>} />
        <Route path="kaapi-chai/master"      element={<PermissionedRoute permKey="kc_master"><KCMasterPage /></PermissionedRoute>} />

      </Route>
      <Route path="*" element={<SmartRedirect />} />
    </Routes>
  );
}

export default function App() {
  const isElectron = window.electronAPI?.isElectron;
  const [setupDone, setSetupDone]         = useState(!isElectron);
  const [checkingSetup, setCheckingSetup] = useState(!!isElectron);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.loadServerConfig().then(config => {
      if (config) {
        window.__bakesaleServerConfig = config;
        setSetupDone(true);
      }
      setCheckingSetup(false);
    });
  }, [isElectron]);

  if (checkingSetup) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!setupDone) {
    return <ElectronSetup onComplete={() => setSetupDone(true)} />;
  }

  return (
    <AuthProvider>
      <PermissionProvider>
        <HashRouter>
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3000, style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' } }}
          />
          <AutoLogout />
          <AppRoutes />
        </HashRouter>
      </PermissionProvider>
    </AuthProvider>
  );
}