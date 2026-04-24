import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/sale',     label: 'Sale',       icon: '🛒', perm: 'can_access_sale' },
    { to: '/purchase', label: 'Purchase',   icon: '📦', perm: 'can_access_purchase' },
    { to: '/reports',  label: 'Reports',    icon: '📊', perm: 'can_access_reports' },
    { to: '/stock',    label: 'Stock',      icon: '🗃️', perm: 'can_access_stock' },
    { to: '/admin',    label: 'Admin Panel', icon: '⚙️', adminOnly: true },
  ];

  // Filter nav items by permission
  const visibleNav = navItems.filter(n => {
    if (n.adminOnly) return isAdmin;
    return isAdmin || can(n.perm);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 24px',
        height: 60, position: 'sticky', top: 0, zIndex: 100, gap: 8,
      }}>
        {/* Logo */}
        <div style={{ marginRight: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🧁</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            Bake<span style={{ color: 'var(--accent)' }}>sale</span>
          </span>
        </div>

        {/* Nav Links */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {visibleNav.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)',
              textDecoration: 'none', transition: 'all 0.15s',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              color:      isActive ? 'var(--accent)'     : 'var(--text2)',
              border:     isActive ? '1px solid var(--accent)' : '1px solid transparent',
            })}>
              <span>{item.icon}</span> {item.label}
            </NavLink>
          ))}
        </div>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{user?.role}</div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">Logout</button>
        </div>
      </nav>

      <main style={{ flex: 1, padding: '28px 28px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}