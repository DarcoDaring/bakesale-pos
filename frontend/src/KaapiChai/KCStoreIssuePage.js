import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCStoreItems, createKCStoreItem, updateKCStoreItem, createKCIssue, getKCIssues, deleteKCIssue } from './kaapiApi';
import api from '../services/api';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const UNITS = ['kg', 'nos', 'case', 'litre', 'packet', 'box'];

const getClosingStockItems = ()  => api.get('/kc-closing-stock/');
const saveClosingStock      = d  => api.post('/kc-closing-stock/', d);

const kbdStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '1px 6px', fontSize: 11,
  fontFamily: 'monospace', fontWeight: 700,
};

const Fkey = ({ k }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)',
    borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'monospace',
  }}>{k}</span>
);

// ── Closing Stock Modal ────────────────────────────────────────────────────────
function ClosingStockModal({ onClose }) {
  const [allItems, setAllItems]   = useState([]);
  const [rows, setRows]           = useState([]);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const searchRef = useRef();
  const qtyRefs   = useRef({});
  const resultsRef = useRef([]);
  resultsRef.current = results;

  useEffect(() => {
    setLoading(true);
    getClosingStockItems()
      .then(r => {
        setAllItems(r.data || []);
        // Pre-populate rows with items that already have closing stock
        const existing = (r.data || []).filter(i => i.closing_qty > 0);
        setRows(existing.map(i => ({
          item_id:   i.item_id,
          item_name: i.item_name,
          unit:      i.unit,
          last_cost: i.last_cost,
          qty:       String(i.closing_qty),
        })));
      })
      .catch(() => toast.error('Failed to load items'))
      .finally(() => { setLoading(false); setTimeout(() => searchRef.current?.focus(), 100); });
  }, []);

  // Search filter
  const doSearch = (q) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const found = allItems
      .filter(i => i.item_name.toLowerCase().includes(lower))
      .filter(i => !rows.find(r => r.item_id === i.item_id)) // exclude already added
      .slice(0, 8);
    setResults(found);
    setHighlighted(found.length > 0 ? 0 : -1);
  };

  const handleSearchChange = e => {
    const v = e.target.value;
    setQuery(v);
    doSearch(v);
  };

  const addItem = (item) => {
    setQuery('');
    setResults([]);
    setHighlighted(-1);
    if (rows.find(r => r.item_id === item.item_id)) {
      toast(`${item.item_name} already added`, { icon: 'ℹ️' });
      return;
    }
    const newIdx = rows.length;
    setRows(prev => [...prev, {
      item_id:   item.item_id,
      item_name: item.item_name,
      unit:      item.unit,
      last_cost: item.last_cost,
      qty:       item.closing_qty > 0 ? String(item.closing_qty) : '',
    }]);
    setTimeout(() => { qtyRefs.current[newIdx]?.focus(); qtyRefs.current[newIdx]?.select(); }, 60);
  };

  const handleSearchKeyDown = e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape')    { e.preventDefault(); onClose(); return; }
    if (e.key === 'F1')        { e.preventDefault(); handleSave(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cur.length > 0) addItem(cur[highlighted >= 0 ? highlighted : 0]);
    }
  };

  const handleQtyKeyDown = (e, idx) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'F1')     { e.preventDefault(); handleSave(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      setTimeout(() => { searchRef.current?.focus(); }, 30);
    }
  };

  const updateQty = (idx, val) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: val } : r));
  const removeRow = idx => setRows(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const validRows = rows.filter(r => r.qty !== '' && parseFloat(r.qty) >= 0);
    if (validRows.length === 0) { toast.error('Enter qty for at least one item'); return; }
    setSaving(true);
    try {
      await saveClosingStock({
        lines: validRows.map(r => ({ item_id: r.item_id, qty: parseFloat(r.qty) })),
      });
      toast.success(`Closing stock saved for ${validRows.length} item(s)!`);
      onClose();
    } catch { toast.error('Failed to save closing stock'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📦 Closing Stock</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Info */}
        <div style={{
          background: 'var(--blue-dim)', border: '1px solid var(--blue)',
          borderRadius: 'var(--radius)', padding: '8px 14px',
          fontSize: 13, color: 'var(--blue)', marginBottom: 16,
        }}>
          ℹ️ Only items that have been issued at least once are shown.
          Enter remaining qty. This will overwrite the previous closing stock.
        </div>

        {loading ? <div className="spinner" /> : (
          <>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                ref={searchRef}
                value={query}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="🔍 Search item name… (Enter to add)"
                style={{ fontSize: 15 }}
                autoFocus
              />
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)', marginTop: 4,
                  maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)',
                }}>
                  {results.map((item, i) => (
                    <div
                      key={item.item_id}
                      onClick={() => addItem(item)}
                      onMouseEnter={() => setHighlighted(i)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        background: highlighted === i ? 'var(--accent-dim)' : '',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: highlighted === i ? 'var(--accent)' : 'var(--text)' }}>
                          {item.item_name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          Unit: {item.unit} · Last cost: {fmt(item.last_cost)}
                          {item.closing_qty > 0 && ` · Current closing: ${item.closing_qty}`}
                        </div>
                      </div>
                      {highlighted === i && (
                        <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>Enter ↵</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {rows.length === 0 ? (
                <div className="empty-state" style={{ padding: '30px 0' }}>
                  <div className="icon">📦</div>
                  Search and add items above
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Last Cost</th>
                      <th style={{ textAlign: 'center', width: 140 }}>
                        Closing Qty * <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→search)</span>
                      </th>
                      <th style={{ textAlign: 'right' }}>Closing Value</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text3)', fontSize: 13 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{r.item_name}</td>
                        <td><span className="badge badge-blue">{r.unit}</span></td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                          {fmt(r.last_cost)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            ref={el => { if (el) qtyRefs.current[i] = el; else delete qtyRefs.current[i]; }}
                            type="number" min="0" step="0.001" value={r.qty}
                            onChange={e => updateQty(i, e.target.value)}
                            onKeyDown={e => handleQtyKeyDown(e, i)}
                            placeholder="0"
                            style={{ width: 110, textAlign: 'center', fontWeight: 700, fontSize: 15 }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                          {r.qty && parseFloat(r.qty) > 0 ? fmt(parseFloat(r.qty) * r.last_cost) : '—'}
                        </td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                      <td colSpan={5} style={{ textAlign: 'right', padding: '10px 14px' }}>Total Closing Value</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 16 }}>
                        {fmt(rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * r.last_cost, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                <kbd style={kbdStyle}>Enter</kbd> Next &nbsp;
                <kbd style={kbdStyle}>F1</kbd> Save &nbsp;
                <kbd style={kbdStyle}>Esc</kbd> Close
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setRows([])}>Clear</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 160, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : '✓ Save Closing Stock'}
                  {!saving && <Fkey k="F1" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
          <input ref={nameRef} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Item name (e.g. Milk, Sugar…)" style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
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
                  <button className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!window.confirm('Delete this issue?')) return;
                      try { await deleteKCIssue(issue.id); load(); toast.success('Deleted'); }
                      catch { toast.error('Failed'); }
                    }}>🗑️</button>
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

// ── Print issue list ───────────────────────────────────────────────────────────
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

// ── Main Store Issue Page ──────────────────────────────────────────────────────
export default function KCStoreIssuePage() {
  const navigate = useNavigate();

  const [storeItems, setStoreItems]           = useState([]);
  const [rows, setRows]                       = useState([{ item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
  const [loading, setLoading]                 = useState(false);
  const [showMaster, setShowMaster]           = useState(false);
  const [showHistory, setShowHistory]         = useState(false);
  const [showClosingStock, setShowClosingStock] = useState(false);

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
    setTimeout(() => fieldRefs.current[0]?.item?.focus(), 100);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (showMaster || showHistory || showClosingStock) return;
      if (e.key === 'F1')     { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape') { e.preventDefault(); navigate('/kaapi-chai'); }
      if (e.key === 'Delete' && e.ctrlKey) {
        e.preventDefault();
        if (rows.length > 1) { setRows(prev => prev.slice(0, -1)); toast('Last row removed', { icon: '🗑️' }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rows, showMaster, showHistory, showClosingStock]);

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

  const handleItemChange = (rowIdx, val) => {
    updateRow(rowIdx, 'item_id', val);
    if (val) focusField(rowIdx, 'qty');
  };

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
      focusField(rowIdx, next);
    } else {
      // Last field (cost) → add new row
      const newIdx = rows.length;
      setRows(prev => [...prev, { item_id: '', item_name: '', unit: '', qty: '', cost: '' }]);
      setTimeout(() => fieldRefs.current[newIdx]?.item?.focus(), 60);
    }
  };

  const addRow = () => {
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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>🏪 Store Issue</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            <kbd style={kbdStyle}>Enter</kbd> Next &nbsp;
            <kbd style={kbdStyle}>F1</kbd> Save &nbsp;
            <kbd style={kbdStyle}>Ctrl+Del</kbd> Remove Last &nbsp;
            <kbd style={kbdStyle}>Esc</kbd> Back
          </span>
          {/* Closing Stock button */}
          <button
            className="btn btn-secondary"
            onClick={() => setShowClosingStock(true)}
            style={{ color: 'var(--green)', borderColor: 'var(--green)', fontWeight: 700 }}
          >
            📦 Closing Stock
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMaster(true)}>📋 Item Master</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>📋 History</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item Name * <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→qty)</span></th>
              <th style={{ width: 120 }}>Unit <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→qty)</span></th>
              <th style={{ textAlign: 'center', width: 120 }}>Qty * <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→cost)</span></th>
              <th style={{ textAlign: 'right', width: 140 }}>Cost ₹ <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→new row)</span></th>
              <th style={{ textAlign: 'right', width: 120 }}>Total</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                <td style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <select ref={el => setRef(i, 'item', el)} value={r.item_id}
                    onChange={e => handleItemChange(i, e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'item')}
                    style={{ fontSize: 14 }}>
                    <option value="">— Select item —</option>
                    {storeItems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td>
                  <select ref={el => setRef(i, 'unit', el)} value={r.unit}
                    onChange={e => updateRow(i, 'unit', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'unit')}
                    style={{ fontSize: 14 }}>
                    <option value="">—</option>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input ref={el => setRef(i, 'qty', el)} type="number" min="0" step="0.01" value={r.qty}
                    onChange={e => updateRow(i, 'qty', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'qty')}
                    placeholder="0"
                    style={{ width: 100, textAlign: 'center', fontWeight: 700, fontSize: 15 }} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input ref={el => setRef(i, 'cost', el)} type="number" min="0" step="0.01" value={r.cost}
                    onChange={e => updateRow(i, 'cost', e.target.value)}
                    onKeyDown={e => handleFieldKeyDown(e, i, 'cost')}
                    placeholder="0.00"
                    style={{ width: 110, textAlign: 'right', fontSize: 14 }} />
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

        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add Row</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => printIssue(rows, grandTotal)}>
              🖨️ Print List
            </button>
            <button className="btn btn-secondary" onClick={() => setRows([{ item_id: '', item_name: '', unit: '', qty: '', cost: '' }])}>
              Clear
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}
              style={{ minWidth: 160, justifyContent: 'center', fontSize: 15 }}>
              {loading ? 'Saving…' : '✓ Save Issue'}
              {!loading && <Fkey k="F1" />}
            </button>
          </div>
        </div>
      </div>

      {showClosingStock && <ClosingStockModal onClose={() => setShowClosingStock(false)} />}
      {showMaster       && <ItemMasterModal onClose={() => { setShowMaster(false); load(); }} />}
      {showHistory      && <ViewIssuesModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}