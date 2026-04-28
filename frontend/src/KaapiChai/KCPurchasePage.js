import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCSaleItems, createKCPurchase, getKCPurchases, deleteKCPurchase } from './kaapiApi';

// ── View Purchases Modal ───────────────────────────────────────────────────────
function ViewPurchasesModal({ onClose }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const { data } = await getKCPurchases(params);
      setPurchases(data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📦 Purchase History</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 160 }} />
          <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {purchases.map(p => (
              <div key={p.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{p.purchase_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(p.created_at).toLocaleString('en-IN')}</span>
                    {p.group_name && <span className="badge badge-blue">{p.group_name}</span>}
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (!window.confirm('Delete this purchase?')) return;
                      try { await deleteKCPurchase(p.id); load(); toast.success('Deleted'); }
                      catch { toast.error('Failed'); }
                    }}
                  >🗑️</button>
                </div>
                <table>
                  <thead><tr><th>Item Name</th><th style={{ textAlign: 'center' }}>Qty</th></tr></thead>
                  <tbody>
                    {(p.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{l.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {purchases.length === 0 && <div className="empty-state"><div className="icon">📦</div>No purchases found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Purchase Page ─────────────────────────────────────────────────────────
export default function KCPurchasePage() {
  const navigate = useNavigate();

  const [allItems, setAllItems]       = useState([]);
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Refs for keyboard navigation
  const searchRef  = useRef();
  const qtyRefs    = useRef({});    // keyed by row index
  const resultsRef = useRef([]);
  resultsRef.current = results;

  // ── Load all sale items ────────────────────────────────────────────────────
  useEffect(() => {
    getKCSaleItems()
      .then(r => setAllItems(r.data || []))
      .catch(() => toast.error('Failed to load items'));
    // Auto-focus search on mount
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  // ── Flatten items (direct + group sub-items) ───────────────────────────────
  const flatItems = React.useMemo(() => {
    const flat = [];
    allItems.forEach(item => {
      if (item.item_type === 'direct' && item.is_active !== false) {
        flat.push({ id: item.id, name: item.name, group_name: '', group_id: null });
      }
      if (item.item_type === 'group' && item.is_active !== false) {
        (item.sub_items || []).forEach(si => {
          flat.push({ id: si.id, name: si.name, group_name: item.name, group_id: item.id });
        });
      }
    });
    return flat;
  }, [allItems]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const found = flatItems
      .filter(i => i.name.toLowerCase().includes(lower) || i.group_name.toLowerCase().includes(lower))
      .slice(0, 8);
    setResults(found);
    setHighlighted(found.length > 0 ? 0 : -1);
  }, [flatItems]);

  const handleSearchChange = e => {
    const v = e.target.value;
    setQuery(v);
    doSearch(v);
  };

  // ── Add item to rows ───────────────────────────────────────────────────────
  const addItem = useCallback((item) => {
    setQuery('');
    setResults([]);
    setHighlighted(-1);

    // Check duplicate
    const existIdx = rows.findIndex(r => r.item_id === item.id);
    if (existIdx >= 0) {
      // Focus existing row's qty
      toast(`${item.name} already added — editing qty`, { icon: 'ℹ️' });
      setTimeout(() => { qtyRefs.current[existIdx]?.focus(); qtyRefs.current[existIdx]?.select(); }, 50);
      return;
    }

    const newIdx = rows.length;
    setRows(prev => [...prev, {
      item_id:    item.id,
      item_name:  item.name,
      group_name: item.group_name,
      group_id:   item.group_id,
      qty:        '',
    }]);

    // Focus the new row's qty input
    setTimeout(() => {
      qtyRefs.current[newIdx]?.focus();
      qtyRefs.current[newIdx]?.select();
    }, 60);
  }, [rows]);

  // ── Search keyboard navigation ─────────────────────────────────────────────
  const handleSearchKeyDown = e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape')    { e.preventDefault(); navigate('/kaapi-chai'); return; }
    if (e.key === 'F1')        { e.preventDefault(); handleSave(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace' && e.ctrlKey) {
      // Delete last row
      if (rows.length > 0) {
        setRows(prev => prev.slice(0, -1));
        toast('Last row removed', { icon: '🗑️' });
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cur.length > 0) {
        const idx = highlighted >= 0 ? highlighted : 0;
        addItem(cur[idx]);
      }
    }
  };

  // ── Qty input keyboard navigation ──────────────────────────────────────────
  const handleQtyKeyDown = (e, idx) => {
    if (e.key === 'Escape') { e.preventDefault(); navigate('/kaapi-chai'); return; }
    if (e.key === 'F1')     { e.preventDefault(); handleSave(); return; }
    if (e.key === 'Delete' && e.ctrlKey) {
      if (rows.length > 0) { setRows(prev => prev.slice(0, -1)); toast('Last row removed', { icon: '🗑️' }); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Go back to search
      setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 30);
    }
  };

  const updateRow = (idx, val) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, qty: val } : r));
  const addRow = () => {
  const newIdx = rows.length;
  setRows(prev => [...prev, { item_id: '', item_name: '', group_name: '', group_id: '', qty: '' }]);
  setTimeout(() => { searchRef.current?.focus(); }, 50);
};
  const removeRow = idx => setRows(prev => prev.filter((_, i) => i !== idx));

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validRows = rows.filter(r => r.qty && parseFloat(r.qty) > 0);
    if (validRows.length === 0) { toast.error('Enter qty for at least one item'); return; }
    setLoading(true);
    try {
      // Group by group_id
      const groups = {};
      validRows.forEach(r => {
        const key = r.group_id || 'direct';
        if (!groups[key]) groups[key] = { group_id: r.group_id, group_name: r.group_name, lines: [] };
        groups[key].lines.push({ item_id: r.item_id, item_name: r.item_name, qty: parseFloat(r.qty) });
      });
      for (const g of Object.values(groups)) {
        await createKCPurchase({ group_id: g.group_id, group_name: g.group_name, lines: g.lines });
      }
      toast.success(`Purchase saved! (${validRows.length} item${validRows.length !== 1 ? 's' : ''})`);
      setRows([]);
      setTimeout(() => searchRef.current?.focus(), 50);
    } catch { toast.error('Failed to save purchase'); }
    finally { setLoading(false); }
  };

  // ── Fkey badge helper ──────────────────────────────────────────────────────
  const Fkey = ({ k }) => (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: 'rgba(255,255,255,0.2)',
      borderRadius: 4, padding: '1px 5px',
      marginLeft: 6, fontFamily: 'monospace',
    }}>{k}</span>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>📦 Purchase</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            <kbd style={kbdStyle}>F1</kbd> Save &nbsp;
            <kbd style={kbdStyle}>Enter</kbd> Select/Next &nbsp;
            <kbd style={kbdStyle}>Del</kbd> Remove Last &nbsp;
            <kbd style={kbdStyle}>Esc</kbd> Back
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>📋 History</button>
        </div>
      </div>

      <div className="card">
        {/* Search box */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <label style={labelStyle}>Search Item </label>
          <input
            ref={searchRef}
            value={query}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="🔍 Type item name or group…"
            style={{ fontSize: 16 }}
            autoFocus
          />
          {/* Dropdown */}
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius)', marginTop: 4,
              maxHeight: 300, overflowY: 'auto', boxShadow: 'var(--shadow)',
            }}>
              {results.map((item, i) => (
                <div
                  key={`${item.id}-${i}`}
                  onClick={() => addItem(item)}
                  onMouseEnter={() => setHighlighted(i)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: highlighted === i ? 'var(--accent-dim)' : '',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: highlighted === i ? 'var(--accent)' : 'var(--text)' }}>
                      {item.name}
                    </div>
                    {item.group_name && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Group: {item.group_name}</div>
                    )}
                  </div>
                  {highlighted === i && (
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 600 }}>Enter ↵</span>
                  )}
                </div>
              ))}
              <div style={{ padding: '6px 16px', background: 'var(--bg2)', fontSize: 11, color: 'var(--text3)' }}>
                ↑↓ Navigate · Enter Select · Esc Close
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        {rows.length > 0 ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Name</th>
                  <th>Group</th>
                  <th style={{ textAlign: 'center', width: 160 }}>Qty * <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter → search)</span></th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text3)', fontSize: 13 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 15 }}>{r.item_name}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 13 }}>{r.group_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        ref={el => { if (el) qtyRefs.current[i] = el; else delete qtyRefs.current[i]; }}
                        type="number" min="0" step="1" value={r.qty}
                        onChange={e => updateRow(i, e.target.value)}
                        onKeyDown={e => handleQtyKeyDown(e, i)}
                        placeholder="0"
                        style={{ width: 120, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
                      />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              
              <div style={{ display: 'flex', gap: 10 }}>
  <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add Row</button>
  <button className="btn btn-secondary" onClick={() => setRows([])}>Clear All</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ minWidth: 180, justifyContent: 'center', fontSize: 15 }}>
                  {loading ? 'Saving…' : `✓ Save Purchase`}
                  {!loading && <Fkey k="F1" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '50px 0' }}>
            <div className="icon">📦</div>
            Search and add items above<br />
            <span style={{ fontSize: 13, marginTop: 8, display: 'block' }}>
              
            </span>
          </div>
        )}
      </div>

      {showHistory && <ViewPurchasesModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--text3)', marginBottom: 6,
  letterSpacing: '0.05em', textTransform: 'uppercase',
};

const kbdStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '1px 6px', fontSize: 11,
  fontFamily: 'monospace', fontWeight: 700,
};