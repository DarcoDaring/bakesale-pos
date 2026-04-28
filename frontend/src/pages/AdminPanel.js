import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getUsers, createUser, updateUser, deleteUser,
  getInternalMasters, createInternalMaster, updateInternalMaster,
  getDirectMasters, createDirectMaster, updateDirectMaster,
  getStockAdjustments, approveStockAdjustment, rejectStockAdjustment
} from '../services/api';

import {
  getAllUserPermissions, updateUserPermissions, downloadBackup, uploadBackup,
  getPhysicalStockRequests, approvePhysicalStockRequest, rejectPhysicalStockRequest,
} from '../services/api';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;

// ─────────────────────────────────────────────────────────────────────────────
// User Master Modal
// ─────────────────────────────────────────────────────────────────────────────
function UserMasterModal({ onClose }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await getUsers();
    setUsers(data); setLoading(false);
  };
  useEffect(() => { fetchUsers(); }, []);

  const toggleActive = async u => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      toast.success(`User ${u.is_active ? 'disabled' : 'enabled'}`);
      fetchUsers();
    } catch { toast.error('Failed to update user'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>👤 User Master</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>+ Add User</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Username</th><th>Role</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>{u.role}</span></td>
                    <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal(u)}>✏️ Edit</button>
                        {u.role !== 'admin' && (
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => toggleActive(u)}>
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <div className="empty-state"><div className="icon">👤</div>No users yet</div>}
          </div>
        )}
        {modal && <UserFormModal user={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={fetchUsers} />}
      </div>
    </div>
  );
}

function UserFormModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ username: user?.username || '', password: '', role: user?.role || 'general' });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!user;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.username.trim()) { toast.error('Username required'); return; }
    if (!isEdit && !form.password) { toast.error('Password required'); return; }
    setLoading(true);
    try {
      const payload = { username: form.username, role: form.role };
      if (form.password) payload.password = form.password;
      if (isEdit) { await updateUser(user.id, payload); toast.success('User updated'); }
      else        { await createUser(payload);           toast.success('User created'); }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.username?.[0] || 'Failed to save user'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }}>
        <h2>{isEdit ? '✏️ Edit User' : '+ Add User'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Username *</label><input autoFocus value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. john_doe" /></div>
          <div className="form-group"><label>{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" /></div>
          <div className="form-group"><label>Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="general">General</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>{loading ? 'Saving…' : isEdit ? '✓ Update' : '✓ Create'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// User Permissions Modal
// ─────────────────────────────────────────────────────────────────────────────
function UserPermissionsModal({ onClose }) {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null);
  const [selected, setSelected] = useState(null);
  const permScrollRef = useRef();

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const { data } = await getAllUserPermissions();
      setUsers(data);
      if (data.length > 0 && !selected) setSelected(data[0].user_id);
    } catch { toast.error('Failed to load permissions'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPermissions(); }, []);

  const selectedUser = users.find(u => u.user_id === selected);

  const togglePerm = async (field) => {
    if (!selectedUser) return;
    const savedScroll = permScrollRef.current?.scrollTop ?? 0;
    const newVal = !selectedUser[field];
    const updated = { ...selectedUser, [field]: newVal };
    setUsers(prev => prev.map(u => u.user_id === selected ? updated : u));
    requestAnimationFrame(() => { if (permScrollRef.current) permScrollRef.current.scrollTop = savedScroll; });
    setSaving(field);
    try {
      await updateUserPermissions(selected, { [field]: newVal });
    } catch {
      toast.error('Failed to save permission');
      setUsers(prev => prev.map(u => u.user_id === selected ? selectedUser : u));
      requestAnimationFrame(() => { if (permScrollRef.current) permScrollRef.current.scrollTop = savedScroll; });
    } finally { setSaving(null); }
  };

  const PermToggle = ({ label, field, description }) => {
    const val = selectedUser?.[field];
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          {description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{description}</div>}
        </div>
        <button onClick={() => togglePerm(field)} disabled={saving === field}
          style={{ padding: '6px 18px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none',
            background: val ? 'var(--green)' : 'var(--bg3)', color: val ? '#fff' : 'var(--text3)',
            opacity: saving === field ? 0.6 : 1, transition: 'all 0.2s' }}>
          {saving === field ? '…' : val ? 'ON' : 'OFF'}
        </button>
      </div>
    );
  };

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid var(--accent)' }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 860, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>🔑 User Permissions</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden' }}>
            <div style={{ width: 200, flexShrink: 0, overflowY: 'auto', background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 10 }}>Users</div>
              {users.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>No general users found</div>}
              {users.map(u => (
                <div key={u.user_id} onClick={() => setSelected(u.user_id)}
                  style={{ padding: '10px 12px', borderRadius: 'var(--radius)', marginBottom: 6, cursor: 'pointer',
                    background: selected === u.user_id ? 'var(--accent)' : 'var(--surface)',
                    color: selected === u.user_id ? '#fff' : 'var(--text)',
                    fontWeight: selected === u.user_id ? 700 : 400 }}>
                  <div style={{ fontSize: 14 }}>{u.username}</div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{u.is_active ? 'Active' : 'Disabled'}</div>
                </div>
              ))}
            </div>
            <div ref={permScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedUser ? (
                <div className="empty-state"><div className="icon">🔑</div>Select a user to manage permissions</div>
              ) : (
                <div style={{ padding: '0 4px' }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 32 }}>👤</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedUser.username}</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>General user · {selectedUser.is_active ? 'Active' : 'Disabled'}</div>
                    </div>
                  </div>
                  <Section title="Page Access">
                    <PermToggle label="Sale"     field="can_access_sale"     description="Access the Sale page" />
                    <PermToggle label="Purchase" field="can_access_purchase" description="Access the Purchase page" />
                    <PermToggle label="Reports"  field="can_access_reports"  description="Access the Reports page" />
                    <PermToggle label="Stock"    field="can_access_stock"    description="Access the Stock page" />
                    <PermToggle label="Kaapi Chai"  field="kc_access"           description="Access the Kaapi Chai POS page" />
                  </Section>
                  <Section title="Sale — Sub Permissions">
                    <PermToggle label="Edit Bill"    field="can_edit_bill"           description="Edit payment mode of existing bills" />
                    <PermToggle label="Delete Bill"  field="can_delete_bill"         description="Delete bills and restore stock" />
                    <PermToggle label="Direct Sale"  field="can_access_direct_sale"  description="Access the Direct Sale feature" />
                  </Section>
                  <Section title="Purchase — Sub Permissions">
                    <PermToggle label="Vendor Master"     field="can_access_vendor_master"   description="Add, edit, enable/disable vendors" />
                    <PermToggle label="Product Master"    field="can_access_product_master"  description="Add, edit, enable/disable products" />
                    <PermToggle label="Purchase Return"   field="can_access_purchase_return" description="Record purchase returns to vendor" />
                  </Section>
                  <Section title="Reports — Sub Permissions">
                    <PermToggle label="Sale Report"           field="can_view_sale_report" />
                    <PermToggle label="Item-wise Report"      field="can_view_itemwise_report" />
                    <PermToggle label="Internal Sale Report"  field="can_view_internal_report" />
                    <PermToggle label="Purchase Return Report" field="can_view_purreturn_report" />
                    <PermToggle label="Purchase Report"       field="can_view_purchase_report" />
                    <PermToggle label="Sales Tax Report"      field="can_view_salestax_report" />
                    <PermToggle label="Purchase Tax Report"   field="can_view_purtax_report" />
                    <PermToggle label="Direct Sale Report"    field="can_view_direct_report" />
                    <PermToggle label="Print Reports"         field="can_print_reports"       description="Print any report" />
                  </Section>
                  <Section title="Stock — Sub Permissions">
                    <PermToggle label="Opening Stock"    field="can_opening_stock"   description="Add opening stock from old software" />
                    <PermToggle label="Physical Stock"   field="can_physical_stock"  description="Submit physical stock count requests" />
                    <PermToggle label="Stock Report"     field="can_stock_report"    description="View stock count and physical stock reports" />
                    <PermToggle label="Stock Transfer"   field="can_stock_transfer"  description="Legacy stock transfer access" />
                  </Section>
                  <Section title="Kaapi Chai POS">
                    <PermToggle label="Sale"           field="kc_sale"     description="Access Kaapi Chai Sale page" />
                    <PermToggle label="Delete Bill"    field="kc_delete_bill"  description="Delete bills in Kaapi Chai Sale" />
                    <PermToggle label="Purchase"       field="kc_purchase" description="Access Kaapi Chai Purchase page" />
                    <PermToggle label="Stock"          field="kc_stock"    description="Access Kaapi Chai Stock page" />
                    <PermToggle label="Report"         field="kc_report"   description="Access Kaapi Chai Reports" />
                    <PermToggle label="Store Issue"    field="kc_store"    description="Access Kaapi Chai Store Issue" />
                    <PermToggle label="Master Control" field="kc_master"   description="Access Sale Item Master" />
                  </Section>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal / Direct Sale Master Modals (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function InternalMasterModal({ onClose }) {
  const [masters, setMasters] = useState([]); const [loading, setLoading] = useState(true);
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false);
  const fetchMasters = async () => { setLoading(true); const { data } = await getInternalMasters(); setMasters(data); setLoading(false); };
  useEffect(() => { fetchMasters(); }, []);
  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try { await createInternalMaster({ name: name.trim() }); toast.success('Destination added'); setName(''); fetchMasters(); }
    catch (err) { toast.error(err.response?.data?.name?.[0] || 'Failed to add'); }
    finally { setSaving(false); }
  };
  const toggleActive = async m => {
    try { await updateInternalMaster(m.id, { is_active: !m.is_active }); toast.success(`${m.is_active ? 'Disabled' : 'Enabled'} "${m.name}"`); fetchMasters(); }
    catch { toast.error('Failed to update'); }
  };
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h2 style={{ margin: 0 }}>🏭 Internal Sale Master</h2><button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} placeholder="Destination name (e.g. Kitchen, Canteen)…" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'Adding…' : '+ Add'}</button>
      </div>
      {loading ? <div className="spinner" /> : (
        <table><thead><tr><th>Name</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{masters.map(m => (<tr key={m.id}><td style={{ fontWeight: 600 }}>{m.name}</td><td><span className={`badge ${m.is_active ? 'badge-green' : 'badge-red'}`}>{m.is_active ? 'Active' : 'Disabled'}</span></td><td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className={`btn btn-sm ${m.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => toggleActive(m)}>{m.is_active ? 'Disable' : 'Enable'}</button></div></td></tr>))}</tbody>
        </table>
      )}
      {!loading && masters.length === 0 && <div className="empty-state"><div className="icon">🏭</div>No destinations yet</div>}
    </div></div>
  );
}

function DirectMasterModal({ onClose }) {
  const [masters, setMasters] = useState([]); const [loading, setLoading] = useState(true);
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false);
  const fetchMasters = async () => { setLoading(true); const { data } = await getDirectMasters(); setMasters(data); setLoading(false); };
  useEffect(() => { fetchMasters(); }, []);
  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try { await createDirectMaster({ name: name.trim() }); toast.success('Item added'); setName(''); fetchMasters(); }
    catch (err) { toast.error(err.response?.data?.name?.[0] || 'Failed to add'); }
    finally { setSaving(false); }
  };
  const toggleActive = async m => {
    try { await updateDirectMaster(m.id, { is_active: !m.is_active }); toast.success(`${m.is_active ? 'Disabled' : 'Enabled'} "${m.name}"`); fetchMasters(); }
    catch { toast.error('Failed to update'); }
  };
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h2 style={{ margin: 0 }}>⚡ Direct Sale Master</h2><button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} placeholder="Item name (e.g. Service Charge, Packaging)…" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'Adding…' : '+ Add'}</button>
      </div>
      {loading ? <div className="spinner" /> : (
        <table><thead><tr><th>Name</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>{masters.map(m => (<tr key={m.id}><td style={{ fontWeight: 600 }}>{m.name}</td><td><span className={`badge ${m.is_active ? 'badge-green' : 'badge-red'}`}>{m.is_active ? 'Active' : 'Disabled'}</span></td><td><div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className={`btn btn-sm ${m.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => toggleActive(m)}>{m.is_active ? 'Disable' : 'Enable'}</button></div></td></tr>))}</tbody>
        </table>
      )}
      {!loading && masters.length === 0 && <div className="empty-state"><div className="icon">⚡</div>No items yet</div>}
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Approval Modal — updated for PhysicalStockRequest (grouped, PS number)
// ─────────────────────────────────────────────────────────────────────────────
function StockApprovalModal({ onClose }) {
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filterTab, setFilterTab] = useState('pending');
  const [actingId,  setActingId]  = useState(null);
  const [expanded,  setExpanded]  = useState(null);  // expanded PS request id

  const fetchRequests = async () => {
    setLoading(true);
    try { const { data } = await getPhysicalStockRequests(); setRequests(data); }
    catch { toast.error('Failed to load requests'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async id => {
    setActingId(id);
    try { await approvePhysicalStockRequest(id); toast.success('✅ Approved — stock updated'); fetchRequests(); }
    catch { toast.error('Failed to approve'); } finally { setActingId(null); }
  };

  const handleReject = async id => {
    setActingId(id);
    try { await rejectPhysicalStockRequest(id); toast.success('Rejected'); fetchRequests(); }
    catch { toast.error('Failed to reject'); } finally { setActingId(null); }
  };

  const FILTER_TABS = ['pending', 'approved', 'rejected', 'all'];
  const filtered = filterTab === 'all' ? requests : requests.filter(r => r.status === filterTab);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 960, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📋 Physical Stock Approval</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {FILTER_TABS.map(t => (
            <button key={t} className="btn btn-sm" onClick={() => setFilterTab(t)} style={{
              background: filterTab === t ? 'var(--accent)' : 'var(--bg3)',
              color:      filterTab === t ? '#fff' : 'var(--text2)',
              border:    `1px solid ${filterTab === t ? 'var(--accent)' : 'var(--border)'}`,
              textTransform: 'capitalize', fontWeight: filterTab === t ? 700 : 400,
            }}>
              {t} <span style={{ marginLeft: 4, fontSize: 11, background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '0 5px' }}>
                {t === 'all' ? requests.length : requests.filter(r => r.status === t).length}
              </span>
            </button>
          ))}
        </div>

        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty-state"><div className="icon">📋</div>No {filterTab} requests</div>
            ) : filtered.map(req => (
              <div key={req.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 12, overflow: 'hidden' }}>

                {/* Request header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--bg2)', cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === req.id ? null : req.id)}>
                  <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{req.request_number}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{req.item_count} item{req.item_count !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 12 }}>by {req.requested_by} · {new Date(req.created_at).toLocaleString()}</span>
                    {req.reason && <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 12 }}>"{req.reason}"</span>}
                  </div>
                  <span className={`badge ${req.status === 'approved' ? 'badge-green' : req.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                    {req.status}
                  </span>
                  {req.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-green" onClick={() => handleApprove(req.id)} disabled={actingId === req.id}>
                        {actingId === req.id ? '…' : '✅ Approve All'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleReject(req.id)} disabled={actingId === req.id}>
                        ✕ Reject
                      </button>
                    </div>
                  )}
                  <span style={{ color: 'var(--text3)', fontSize: 14 }}>{expanded === req.id ? '▲' : '▼'}</span>
                </div>

                {/* Expanded items */}
                {expanded === req.id && (
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th><th>Barcode</th><th>MRP</th>
                        <th>System Stock</th><th>Physical Count</th><th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(req.items || []).map((item, i) => {
                        const diff = parseFloat(item.physical_stock) - parseFloat(item.system_stock);
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                            <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{item.product_barcode}</span></td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(item.mrp || 0)}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{parseFloat(item.system_stock).toFixed(2)}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{parseFloat(item.physical_stock).toFixed(2)}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                              color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text3)' }}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup Modal (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function BackupModal({ onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadDone,  setUploadDone]  = useState(false);
  const [confirm,     setConfirm]     = useState(false);
  const [selectedFile,setSelectedFile]= useState(null);
  const fileRef = useRef();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await downloadBackup();
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a   = document.createElement('a');
      const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url; a.download = `bakesale_backup_${ts}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully!');
    } catch { toast.error('Failed to download backup'); }
    finally { setDownloading(false); }
  };

  const handleUpload = async () => {
    if (!selectedFile) { toast.error('Select a backup file first'); return; }
    setUploading(true);
    try { await uploadBackup(selectedFile); setUploadDone(true); toast.success('Backup restored! Please refresh the page.'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Restore failed'); }
    finally { setUploading(false); setConfirm(false); }
  };

  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>💾 Manage Backups</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
      </div>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>⬇️</span>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>Download Backup</div><div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Export all your data as a JSON file.</div></div>
        </div>
        <button className="btn btn-primary" onClick={handleDownload} disabled={downloading} style={{ width: '100%', justifyContent: 'center' }}>
          {downloading ? '⏳ Downloading…' : '⬇️ Download Backup Now'}
        </button>
      </div>
      <div style={{ background: 'var(--bg2)', border: `1px solid ${confirm ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>⬆️</span>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>Restore from Backup</div><div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Upload a backup file. <b style={{ color: 'var(--red)' }}>This will overwrite ALL current data.</b></div></div>
        </div>
        {uploadDone ? (
          <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 700, color: 'var(--green)' }}>Backup restored successfully!</div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>🔄 Refresh Now</button>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { setSelectedFile(e.target.files[0]); setConfirm(false); setUploadDone(false); }} />
            <button className="btn btn-secondary" onClick={() => fileRef.current.click()} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
              📂 {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose Backup File (.json)'}
            </button>
            {selectedFile && !confirm && (
              <button className="btn" onClick={() => setConfirm(true)} style={{ width: '100%', justifyContent: 'center', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}>
                ⬆️ Restore This Backup
              </button>
            )}
            {confirm && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: 14 }}>
                <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>⚠️ Are you sure? This cannot be undone.</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn" onClick={handleUpload} disabled={uploading} style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}>
                    {uploading ? '⏳ Restoring…' : '✓ Yes, Restore'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Panel Main
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [showUsers,       setShowUsers]       = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showInternal,    setShowInternal]    = useState(false);
  const [showDirect,      setShowDirect]      = useState(false);
  const [showApproval,    setShowApproval]    = useState(false);
  const [showBackup,      setShowBackup]      = useState(false);

  const sections = [
    { icon: '👤', title: 'User Master',          desc: 'Create and manage user accounts',                  color: 'var(--blue)',   onClick: () => setShowUsers(true) },
    { icon: '🔑', title: 'User Permissions',     desc: 'Set per-user page and feature access',             color: 'var(--purple)', onClick: () => setShowPermissions(true) },
    { icon: '🏭', title: 'Internal Sale Master', desc: 'Manage internal transfer destinations',             color: 'var(--green)',  onClick: () => setShowInternal(true) },
    { icon: '⚡', title: 'Direct Sale Master',   desc: 'Manage off-catalogue direct sale items',            color: 'var(--accent)', onClick: () => setShowDirect(true) },
    { icon: '📋', title: 'Stock Approval',        desc: 'Review and approve physical stock count requests', color: 'var(--yellow)', onClick: () => setShowApproval(true) },
    { icon: '💾', title: 'Manage Backups',        desc: 'Download or restore a full data backup',          color: 'var(--green)',  onClick: () => setShowBackup(true) },
  ];

  return (
    <div>
      <div className="page-header"><h1>⚙️ Admin Panel</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {sections.map(s => (
          <div key={s.title} className="card" onClick={s.onClick}
            style={{ cursor: 'pointer', transition: 'transform 0.15s', display: 'flex', flexDirection: 'column', gap: 10 }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}>
            <div style={{ fontSize: 32 }}>{s.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: s.color }}>{s.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{s.desc}</div>
            </div>
            <div style={{ marginTop: 'auto' }}><span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>Open →</span></div>
          </div>
        ))}
      </div>
      {showUsers       && <UserMasterModal      onClose={() => setShowUsers(false)} />}
      {showPermissions && <UserPermissionsModal onClose={() => setShowPermissions(false)} />}
      {showInternal    && <InternalMasterModal  onClose={() => setShowInternal(false)} />}
      {showDirect      && <DirectMasterModal    onClose={() => setShowDirect(false)} />}
      {showApproval    && <StockApprovalModal   onClose={() => setShowApproval(false)} />}
      {showBackup      && <BackupModal          onClose={() => setShowBackup(false)} />}
    </div>
  );
}