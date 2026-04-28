import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';

const SECTIONS = [
  { key: 'sale',        label: 'Sale',          icon: '🧾', color: 'var(--accent)', perm: 'kc_sale' },
  { key: 'purchase',    label: 'Purchase',       icon: '📦', color: 'var(--blue)',   perm: 'kc_purchase' },
  { key: 'stock',       label: 'Stock',          icon: '🗃️', color: 'var(--green)', perm: 'kc_stock' },
  { key: 'report',      label: 'Report',         icon: '📊', color: 'var(--purple)', perm: 'kc_report' },
  { key: 'store-issue', label: 'Store Issue',    icon: '🏪', color: 'var(--yellow)', perm: 'kc_store' },
  { key: 'master',      label: 'Master Control', icon: '⚙️', color: 'var(--text)',   perm: 'kc_master' },
];

export default function KaapiChaiPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { can } = usePermissions();

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 40, marginTop: 20 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800 }}>☕ Kaapi Chai POS</h1>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        maxWidth: 700,
        margin: '60px auto 0',
      }}>
        {SECTIONS.filter(s => isAdmin || can(s.perm)).map(s => (
          <div
            key={s.key}
            className="card"
            onClick={() => navigate(`/kaapi-chai/${s.key}`)}
            style={{
              cursor: 'pointer',
              transition: 'transform 0.15s',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            <div style={{ fontSize: 36 }}>{s.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: s.color }}>{s.label}</div>
            <div style={{ marginTop: 'auto' }}>
              <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}