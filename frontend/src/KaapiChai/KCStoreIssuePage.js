import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCStoreItems, createKCStoreItem, updateKCStoreItem, createKCIssue, getKCIssues, deleteKCIssue } from './kaapiApi';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const UNITS = ['kg', 'nos', 'case', 'litre', 'packet', 'box'];

const kbdStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '1px 6px', fontSize: 11,
  fontFamily: 'monospace', fontWeight: 700,
};

const Fkey = ({ k }) => (
  <span style={{
    fontSize: 10, fontWeight: 700,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 4, padding: '1px 5px',
    marginLeft: 6, fontFamily: 'monospace',
  }}>{k}</span>
);

// ── Print issued list ──────────────────────────────────────────────────────────
function printIssue(rows, grandTotal) {
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { toast.error('Allow popups to print'); return; }
  const lines = rows
    .filter(r => r.item_id && r.qty && parseFloat(r.qty) > 0)
    .map(r => `<tr>
      <td style="padding:5px 8px">${r.item_name}</td>
      <td style="text-align:center;padding:5px 8px">${r.unit}</td>
      <td style="text-align:center;padding:5px 8px">${r.qty}</td>
      <td style="text-align:right;padding:5px 8px">${fmt(r.cost)}</td>
      <td style="text-align:right;padding:5px 8px;font-weight:700">${fmt((parseFloat(r.qty)||0)*(parseFloat(r.cost)||0))}</td>
    </tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;font-size:13px;padding:20px;width:360px}
    .shop{text-align:center;font-size:18px;font-weight:700;margin-bottom:2px}
    .meta{text-align:center;font-size:11px;color:#555;margin-bottom:2px}
    .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    th{border-bottom:1px solid #000;padding:4px 8px;font-size:11px;text-align:left}
    td{font-size:12px;border-bottom:1px dotted #ccc}
    .total-row{border-top:2px solid #000;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:700;font-size:14px}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="shop">☕ KAAPI CHAI</div>
  <div class="meta">Store Issue</div>
  <div class="meta">${new Date().toLocaleString('en-IN')}</div>
  <div class="divider"></div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Unit</th><th style="text-align:center">Qty</th><th style="text-align:right">Cost</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="divider"></div>
  <div class="total-row"><span>GRAND TOTAL</span><span>${fmt(grandTotal)}</span></div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// ── Item Master Modal ──────────────────────────────────────────────────────────
function ItemMasterModal({ onClose }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState({ name: '', unit: 'kg' });
  const [editId, setEditId]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const nameRef = useRef();

  const load = async () => {
    setLoading(true);
    try { const { data } = await getKCStoreItems(); setItems(data || []); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); setTimeout(() => nameRef.current?.focus(), 80); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editId) { await updateKCStoreItem(editId, form); toast.success('Updated'); }
      else        { await createKCStoreItem(form);          toast.success('Item added'); }
      setForm({ name: '', unit: 'kg' });
      setEditId(null);
      load();
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (item) => {
    try { await updateKCStoreItem(item.id, { is_active: !item.is_active }); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 600, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>🏪 Store Item Master</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            ref={nameRef}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Item name (e.g. Milk, Sugar…)"
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          />
          <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ width: 120 }}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '…' : editId ? '✓ Update' : '+ Add'}
          </button>
          {editId && (
            <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm({ name: '', unit: 'kg' }); }}>
              Cancel
            </button>
          )}
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table>
              <thead>
                <tr><th>Item Name</th><th>Unit</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td><span className="badge badge-blue">{item.unit}</span></td>
                    <td><span className={`badge ${item.is_active ? 'badge-green' : 'badge-red'}`}>{item.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditId(item.id); setForm({ name: item.name, unit: item.unit }); setTimeout(() => nameRef.current?.focus(), 50); }}>✏️ Edit</button>
                        <button className={`btn btn-sm ${item.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => handleToggle(item)}>
                          {item.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4}><div className="empty-state" style={{ padding: '20px 0' }}><div className="icon">🏪</div>No items yet</div></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── View Issues Modal ──────────────────────────────────────────────────────────
function ViewIssuesModal({ onClose }) {
  const [issues, setIssues]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const { data } = await getKCIssues(params);
      setIssues(data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📋 Issue History</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 160 }} />
          <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {issues.map(issue => (
              <div key={issue.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="badge badge-purple" style={{ fontFamily: 'var(--mono)' }}>{issue.issue_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(issue.created_at).toLocaleString('en-IN')}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(issue.total)}</span>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!window.confirm('Delete this issue?')) return;
                      try { await deleteKCIssue(issue.id); load(); toast.success('Deleted'); }
                      catch { toast.error('Failed'); }
                    }}
                  >🗑️</button>
                </div>
                <table>
                  <thead>
                    <tr><th>Item</th><th>Unit</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                  </thead>
                  <tbody>
                    {(issue.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                        <td><span className="badge badge-blue">{l.unit}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.qty}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(l.cost)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {issues.length === 0 && <div className="empty-state"><div className="icon">🏪</div>No issues found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Store Issue Page ──────────────────────────────────────────────────────
export default function KCStoreIssuePage() {
  const navigate = useNavigate();

  const [storeItems, setStoreItems] = useState([]);
  const [rows, setRows]             = useState([{ item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
  const [loading, setLoading]       = useState(false);
  const [showMaster, setShowMaster] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Refs for each field in each row
  // Format: fieldRefs.current[rowIndex][fieldName] = element
  const fieldRefs = useRef({});

  const setRef = (rowIdx, field, el) => {
    if (!fieldRefs.current[rowIdx]) fieldRefs.current[rowIdx] = {};
    if (el) fieldRefs.current[rowIdx][field] = el;
  };

  const focusField = (rowIdx, field) => {
    setTimeout(() => {
      const el = fieldRefs.current[rowIdx]?.[field];
      if (el) { el.focus(); if (el.select) el.select(); }
    }, 40);
  };

  const load = () => {
    getKCStoreItems()
      .then(r => setStoreItems((r.data || []).filter(i => i.is_active !== false)))
      .catch(() => toast.error('Failed to load items'));
  };

  useEffect(() => {
    load();
    // Focus first row's item select on mount
    setTimeout(() => fieldRefs.current[0]?.item?.focus(), 100);
  }, []);

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (showMaster || showHistory) return;
      if (e.key === 'F1')     { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape') { e.preventDefault(); navigate('/kaapi-chai'); }
      if (e.key === 'Delete' && e.ctrlKey) {
        e.preventDefault();
        if (rows.length > 1) { setRows(prev => prev.slice(0, -1)); toast('Last row removed', { icon: '🗑️' }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rows, showMaster, showHistory]);

  // ── Update a row field ─────────────────────────────────────────────────────
  const updateRow = (idx, field, val) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'item_id') {
        const item = storeItems.find(s => String(s.id) === String(val));
        return { ...r, item_id: val, item_name: item?.name || '', unit: item?.unit || '' };
      }
      return { ...r, [field]: val };
    }));
  };

  // ── Field order: item → unit → qty → cost → (Enter: calculate + new row) ──
  // unit is auto-filled so we skip to qty; user can still change unit manually
  const handleFieldKeyDown = (e, rowIdx, field) => {
    if (e.key === 'Escape') { e.preventDefault(); navigate('/kaapi-chai'); return; }
    if (e.key === 'F1')     { e.preventDefault(); handleSave(); return; }
    if (e.key === 'Delete' && e.ctrlKey) {
      e.preventDefault();
      if (rows.length > 1) { setRows(prev => prev.slice(0, -1)); toast('Last row removed', { icon: '🗑️' }); }
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const order = ['item', 'unit', 'qty', 'cost'];
    const idx   = order.indexOf(field);
    const next  = order[idx + 1];

    if (next) {
      // Move to next field in same row
      focusField(rowIdx, next);
    } else {
      // Last field (cost) → calculate total → add new row → focus its item
      const newIdx = rows.length;
      setRows(prev => [...prev, { item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
      setTimeout(() => fieldRefs.current[newIdx]?.item?.focus(), 60);
    }
  };

  // ── Item select change → auto-fill unit → jump to qty ─────────────────────
  const handleItemChange = (rowIdx, val) => {
    updateRow(rowIdx, 'item_id', val);
    if (val) {
      // jump directly to qty (unit is auto-filled)
      focusField(rowIdx, 'qty');
    }
  };

  const addRow    = () => {
    const newIdx = rows.length;
    setRows(prev => [...prev, { item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
    setTimeout(() => fieldRefs.current[newIdx]?.item?.focus(), 60);
  };
  const removeRow = idx => setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const grandTotal = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.cost) || 0), 0);

  const handleSave = async () => {
    const validRows = rows.filter(r => r.item_id && r.qty && parseFloat(r.qty) > 0);
    if (validRows.length === 0) { toast.error('Add at least one item with qty'); return; }
    setLoading(true);
    try {
      await createKCIssue({
        lines: validRows.map(r => ({
          item_id:   r.item_id,
          item_name: r.item_name,
          unit:      r.unit,
          qty:       parseFloat(r.qty),
          cost:      parseFloat(r.cost) || 0,
          total:     (parseFloat(r.qty) || 0) * (parseFloat(r.cost) || 0),
        })),
        total: grandTotal,
      });
      toast.success('Store issue recorded!');
      setRows([{ item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
      setTimeout(() => fieldRefs.current[0]?.item?.focus(), 60);
    } catch { toast.error('Failed to save'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>🏪 Store Issue</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMaster(true)}>📋 Item Master</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>📋 History</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item Name </th>
              <th style={{ width: 120 }}>Unit </th>
              <th style={{ textAlign: 'center', width: 120 }}>Qty * </th>
              <th style={{ textAlign: 'right', width: 140 }}>Cost ₹ </th>
              <th style={{ textAlign: 'right', width: 120 }}>Total</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                <td style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <select
                    ref={el => setRef(i, 'item', el)}
                    value={r.item_id}
                    onChange={e => handleItemChange(i, e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'item')}
                    style={{ fontSize: 14 }}
                  >
                    <option value="">— Select item —</option>
                    {storeItems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    ref={el => setRef(i, 'unit', el)}
                    value={r.unit}
                    onChange={e => updateRow(i, 'unit', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'unit')}
                    style={{ fontSize: 14 }}
                  >
                    <option value="">—</option>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    ref={el => setRef(i, 'qty', el)}
                    type="number" min="0" step="0.01" value={r.qty}
                    onChange={e => updateRow(i, 'qty', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'qty')}
                    placeholder="0"
                    style={{ width: 100, textAlign: 'center', fontWeight: 700, fontSize: 15 }}
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    ref={el => setRef(i, 'cost', el)}
                    type="number" min="0" step="0.01" value={r.cost}
                    onChange={e => updateRow(i, 'cost', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'cost')}
                    placeholder="0.00"
                    style={{ width: 110, textAlign: 'right', fontSize: 14 }}
                  />
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 15 }}>
                  {r.qty && r.cost ? fmt((parseFloat(r.qty) || 0) * (parseFloat(r.cost) || 0)) : '—'}
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
              <td colSpan={5} style={{ textAlign: 'right', padding: '14px 14px', fontSize: 15 }}>Grand Total</td>
              <td style={{ textAlign: 'right', padding: '14px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 18 }}>
                {fmt(grandTotal)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {/* Footer actions */}
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add Row</button>
            
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            
            <button
              className="btn btn-secondary"
              onClick={() => setRows([{ item_id: '', item_name: '', unit: '', qty: '', cost: '' }])}
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading}
              style={{ minWidth: 160, justifyContent: 'center', fontSize: 15 }}
            >
              {loading ? 'Saving…' : ' Save '}
              {!loading && <Fkey k="F1" />}
            </button>
          </div>
        </div>
      </div>

      {showMaster  && <ItemMasterModal onClose={() => { setShowMaster(false); load(); }} />}
      {showHistory && <ViewIssuesModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}