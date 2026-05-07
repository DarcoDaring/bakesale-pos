  import React, { useState, useEffect } from 'react';
  import toast from 'react-hot-toast';
  import { useNavigate } from 'react-router-dom';
  import { getKCSaleItems, createKCSaleItem, updateKCSaleItem, deleteKCSaleItem } from './kaapiApi';

  // ── Sub-item editor ────────────────────────────────────────────────────────────
  function SubItemsEditor({ subItems, onChange }) {
    const add    = () => onChange([...subItems, { _key: Date.now(), name: '', price: '' }]);
    const update = (idx, field, val) => onChange(subItems.map((s, i) => i === idx ? { ...s, [field]: val } : s));
    const remove = idx => onChange(subItems.filter((_, i) => i !== idx));

    return (
      <div style={{ marginTop: 12 }}>
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label>Sub-items in this group</label>
        </div>
        {subItems.map((s, i) => (
          <div key={s._key || s.id || i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input
              className="sub-name-input"
              value={s.name}
              onChange={e => update(i, 'name', e.target.value)}
              placeholder="Item name"
              style={{ flex: 2 }}
              autoFocus={i === subItems.length - 1 && !s.name}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // move to price input of same row
                  const priceInputs = document.querySelectorAll('.sub-price-input');
                  if (priceInputs[i]) priceInputs[i].focus();
                }
              }}
            />
            <input
              className="sub-price-input"
              type="number" min="0" step="0.01"
              value={s.price}
              onChange={e => update(i, 'price', e.target.value)}
              placeholder="Price ₹"
              style={{ width: 110 }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i === subItems.length - 1) {
                    // last row → add new row → focus its name input
                    onChange([...subItems, { _key: Date.now(), name: '', price: '' }]);
                    setTimeout(() => {
                      const nameInputs = document.querySelectorAll('.sub-name-input');
                      if (nameInputs[subItems.length]) nameInputs[subItems.length].focus();
                    }, 50);
                  } else {
                    // go to next row's name input
                    const nameInputs = document.querySelectorAll('.sub-name-input');
                    if (nameInputs[i + 1]) nameInputs[i + 1].focus();
                  }
                }
              }}
            />
            <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={add}>+ Add Sub-item</button>
      </div>
    );
  }

  // ── Create / Edit Modal ────────────────────────────────────────────────────────
  function ItemFormModal({ item, onClose, onSaved }) {
    const isEdit = !!item;
    const [form, setForm] = useState({
      name:              item?.name              || '',
      item_type:         item?.item_type         || 'direct',
      price:             item?.price             || '',
      is_active:         item?.is_active         !== false,
      purchase_required: item?.purchase_required || false,
      sub_items:         (item?.sub_items || []).map(s => ({ ...s, _key: s.id })),
    });
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
      if (!form.name.trim()) { toast.error('Name required'); return; }
      if (form.item_type === 'direct' && (!form.price || parseFloat(form.price) <= 0)) {
        toast.error('Price required for direct items'); return;
      }
      if (form.item_type === 'group' && form.sub_items.length === 0) {
        toast.error('Add at least one sub-item'); return;
      }
      for (const s of form.sub_items) {
        if (!s.name.trim())                        { toast.error('Sub-item name required'); return; }
        if (!s.price || parseFloat(s.price) <= 0) { toast.error(`Price required for "${s.name}"`); return; }
      }
      setSaving(true);
      try {
        const payload = {
          name:              form.name.trim(),
          item_type:         form.item_type,
          price:             form.item_type === 'direct' ? parseFloat(form.price) : 0,
          is_active:         form.is_active,
          purchase_required: form.item_type === 'group' ? form.purchase_required : false,
          sub_items:         form.item_type === 'group'
            ? form.sub_items.map(s => ({ name: s.name.trim(), price: parseFloat(s.price) }))
            : [],
        };
        if (isEdit) { await updateKCSaleItem(item.id, payload); toast.success('Updated'); }
        else        { await createKCSaleItem(payload);           toast.success('Item created'); }
        onSaved();
        onClose();
      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
      finally { setSaving(false); }
    };

    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 520, maxHeight: '88vh', overflowY: 'auto' }}>
          <h2>{isEdit ? '✏️ Edit Item' : '+ New Sale Item'}</h2>

          {/* Name */}
          <div className="form-group">
            <label>Button Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Tea, Snacks, Coffee…"
              autoFocus
            />
          </div>

          {/* Type selector */}
          <div className="form-group">
            <label>Button Type *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { v: 'direct', label: '⚡ Direct Item', desc: 'Fixed price — always available, no purchase needed' },
                { v: 'group',  label: '📂 Group Item',  desc: 'Opens a sub-item list' },
              ].map(t => (
                <div
                  key={t.v}
                  onClick={() => set('item_type', t.v)}
                  style={{
                    flex: 1, padding: '12px 14px',
                    border: `1.5px solid ${form.item_type === t.v ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    background: form.item_type === t.v ? 'var(--accent-dim)' : 'var(--surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, color: form.item_type === t.v ? 'var(--accent)' : 'var(--text)', fontSize: 14 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Direct: price */}
          {form.item_type === 'direct' && (
            <div className="form-group">
              <label>Price (₹) *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Group: purchase_required toggle + sub-items */}
          {form.item_type === 'group' && (
            <>
              {/* Purchase Required toggle */}
              <div className="form-group">
                <label>Stock Control</label>
                <div
                  onClick={() => set('purchase_required', !form.purchase_required)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    border: `1.5px solid ${form.purchase_required ? 'var(--green)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    background: form.purchase_required ? 'var(--green-dim)' : 'var(--surface)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.purchase_required}
                    onChange={e => set('purchase_required', e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--green)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: form.purchase_required ? 'var(--green)' : 'var(--text)' }}>
                      Purchase Required
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {form.purchase_required
                        ? '✅ Stock controlled — sub-items only show after purchase, qty limited'
                        : '☐ No purchase needed — all sub-items always available on sale page'}
                    </div>
                  </div>
                </div>
              </div>

              <SubItemsEditor subItems={form.sub_items} onChange={v => set('sub_items', v)} />
            </>
          )}

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <label style={{ margin: 0 }}>Active</label>
              <input
                type="checkbox" checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? '✓ Update' : '✓ Create'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Master Control Page ───────────────────────────────────────────────────
  export default function KCMasterPage() {
    const navigate = useNavigate();
    const [items, setItems]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal]     = useState(null);
    const [search, setSearch]   = useState('');
    const [filter, setFilter]   = useState('all');

    const load = async () => {
      setLoading(true);
      try { const { data } = await getKCSaleItems(); setItems(data || []); }
      catch { toast.error('Failed to load items'); }
      finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const handleToggle = async (item) => {
      try { await updateKCSaleItem(item.id, { is_active: !item.is_active }); toast.success(`${item.is_active ? 'Disabled' : 'Enabled'} "${item.name}"`); load(); }
      catch { toast.error('Failed'); }
    };

    const handleDelete = async (item) => {
      if (!window.confirm(`Delete "${item.name}"?`)) return;
      try { await deleteKCSaleItem(item.id); toast.success('Deleted'); load(); }
      catch { toast.error('Failed to delete'); }
    };

    const filtered = items
      .filter(i => filter === 'all' || i.item_type === filter)
      .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    return (
      <div>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
            <h1>⚙️ Master Control</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setModal('create')}>+ New Item</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🛒 Sale Item Master</h2>
          
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search items…"
            style={{ flex: 1, minWidth: 200 }}
          />
          {[
            { k: 'all',    label: `All (${items.length})` },
            { k: 'direct', label: `Direct (${items.filter(i => i.item_type === 'direct').length})` },
            { k: 'group',  label: `Group (${items.filter(i => i.item_type === 'group').length})` },
          ].map(f => (
            <button
              key={f.k}
              className="btn btn-sm"
              onClick={() => setFilter(f.k)}
              style={{
                background: filter === f.k ? 'var(--accent)' : 'var(--surface)',
                color:      filter === f.k ? '#fff' : 'var(--text2)',
                border:    `1px solid ${filter === f.k ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >{f.label}</button>
          ))}
        </div>

        {loading ? <div className="spinner" /> : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Button Name</th>
                  <th>Type</th>
                  <th>Price / Sub-items</th>
                  <th>Stock Control</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</td>
                    <td>
                      <span className={`badge ${item.item_type === 'group' ? 'badge-blue' : 'badge-orange'}`}>
                        {item.item_type === 'group' ? '📂 Group' : '⚡ Direct'}
                      </span>
                    </td>
                    <td>
                      {item.item_type === 'direct' ? (
                        <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                          ₹{parseFloat(item.price).toFixed(2)}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(item.sub_items || []).map(si => (
                            <span key={si.id} className="badge badge-purple">
                              {si.name} — ₹{parseFloat(si.price).toFixed(2)}
                            </span>
                          ))}
                          {(item.sub_items || []).length === 0 && (
                            <span style={{ color: 'var(--text3)', fontSize: 12 }}>No sub-items</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {item.item_type === 'direct' ? (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      ) : item.purchase_required ? (
                        <span className="badge badge-green">✅ Purchase Required</span>
                      ) : (
                        <span className="badge badge-yellow">⚡ Always Available</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${item.is_active ? 'badge-green' : 'badge-red'}`}>
                        {item.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal(item)}>✏️ Edit</button>
                        <button
                          className={`btn btn-sm ${item.is_active ? 'btn-danger' : 'btn-green'}`}
                          onClick={() => handleToggle(item)}
                        >
                          {item.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="icon">⚙️</div>
                {items.length === 0 ? 'No items yet — click "+ New Item" to add your first button' : 'No items match your search'}
              </div>
            )}
          </div>
        )}

        {modal && (
          <ItemFormModal
            item={modal === 'create' ? null : modal}
            onClose={() => setModal(null)}
            onSaved={load}
          />
        )}
      </div>
    );
  }