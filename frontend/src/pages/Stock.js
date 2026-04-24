import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePermissions } from '../context/PermissionContext';
import {
  getStockStatus, searchProducts, getProductByBarcode,
  createPhysicalStockRequest, getPhysicalStockRequests,
  createOpeningStock,
} from '../services/api';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const LOW_STOCK_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Physical Stock Modal — multi-item with PS number
// ─────────────────────────────────────────────────────────────────────────────
function PhysicalStockModal({ onClose }) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [hiIdx,    setHiIdx]    = useState(0);
  const [searching,setSearching]= useState(false);
  const [lines,    setLines]    = useState([]);
  const [reason,   setReason]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const debounceRef   = useRef();
  const searchInputRef = useRef();
  const qtyRefs        = useRef({});

  const focusSearch = () => setTimeout(() => searchInputRef.current?.focus(), 30);
  const focusQty    = key => setTimeout(() => { const el = qtyRefs.current[key]; if (el) { el.focus(); el.select(); } }, 30);

  const doSearch = async q => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await searchProducts(q);
      setResults(data);
      setHiIdx(0);
    } catch { setResults([]); } finally { setSearching(false); }
  };

  const handleChange = e => {
    const v = e.target.value; setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const addOrFocusProduct = p => {
    setQuery(''); setResults([]);
    const lineKey = `${p.id}_${p.batch_id || 'nb'}`;
    setLines(prev => {
      const existing = prev.find(l => l._key === lineKey);
      if (existing) { focusQty(existing._key); return prev; }
      const newLine = {
        _key:         lineKey,
        product_id:   p.id,
        batch_id:     p.batch_id || null,
        product_name: p.name,
        barcode:      p.barcode,
        mrp:          parseFloat(p.selling_price || 0),
        batch_mrp:    p.batch_mrp || null,
        multi_batch:  p.multi_batch || false,
        selling_unit: p.selling_unit || 'nos',
        system_stock: parseFloat(p.stock_quantity || 0),
        physical_qty: '',
      };
      focusQty(newLine._key);
      return [...prev, newLine];
    });
  };

  const handleScanKey = async e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(h => Math.min(h + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape')    { setResults([]); return; }
    if (e.key !== 'Enter' || !query.trim()) return;
    e.preventDefault();
    clearTimeout(debounceRef.current);
    if (results.length > 0) { addOrFocusProduct(results[hiIdx] || results[0]); return; }
    try {
      const { data } = await getProductByBarcode(query.trim());
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length > 0) addOrFocusProduct(rows[0]);
      else toast.error('Product not found');
    } catch { toast.error('Product not found'); }
  };

  const handleQtyKey = (e, key) => {
    if (e.key === 'Enter') { e.preventDefault(); focusSearch(); }
  };

  const updateLine = (key, val) =>
    setLines(prev => prev.map(l => l._key === key ? { ...l, physical_qty: val } : l));
  const removeLine = key => setLines(prev => prev.filter(l => l._key !== key));

  const handleSubmit = async () => {
    if (lines.length === 0) { toast.error('Add at least one product'); return; }
    for (const l of lines) {
      const v = parseFloat(l.physical_qty);
      if (l.physical_qty === '' || isNaN(v) || v < 0) {
        toast.error(`Enter physical count for ${l.product_name}`); return;
      }
    }
    setLoading(true);
    try {
      const { data } = await createPhysicalStockRequest({
        reason,
        items: lines.map(l => ({
          product:        l.product_id,
          batch_id:       l.batch_id || null,
          system_stock:   l.system_stock,
          physical_stock: parseFloat(l.physical_qty),
        })),
      });
      toast.success(`Physical Stock Request ${data.request_number} submitted for approval`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📋 Physical Stock Count</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            ref={searchInputRef}
            autoFocus
            value={query}
            onChange={handleChange}
            onKeyDown={handleScanKey}
            placeholder="🔍 Scan barcode or search… (↑↓ navigate, Enter to select)"
            style={{ fontSize: 14, padding: '10px 14px' }} />
          {searching && <div style={{ position: 'absolute', right: 14, top: 14, fontSize: 12, color: 'var(--text3)' }}>…</div>}
          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)', marginTop: 2,
            }}>
              <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                ↑↓ Navigate · Enter Select · Esc Close · {results.length} results
              </div>
              <table>
                <thead>
                  <tr><th>Barcode</th><th>Product</th><th>Price</th><th>Stock</th></tr>
                </thead>
                <tbody>
                  {results.map((p, i) => (
                    <tr key={`${p.id}-${p.batch_id || i}`}
                      onClick={() => addOrFocusProduct(p)}
                      style={{ cursor: 'pointer', background: hiIdx === i ? 'var(--accent-dim)' : undefined }}
                      onMouseEnter={() => setHiIdx(i)}
                      onMouseLeave={() => setHiIdx(-1)}>
                      <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.barcode}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.multi_batch && (
                          <div style={{ fontSize: 11, color: 'var(--accent)' }}>MRP: ₹{p.batch_mrp}</div>
                        )}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>₹{parseFloat(p.selling_price).toFixed(2)}</td>
                      <td>
                        {parseFloat(p.stock_quantity) <= 0
                          ? <span className="badge badge-red">Out of Stock</span>
                          : <span className="badge badge-green">
                              {parseFloat(p.stock_quantity).toFixed(p.selling_unit === 'kg' ? 3 : 0)} {p.selling_unit || 'nos'}
                            </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '6px 14px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
                ↑↓ Navigate · Enter Select · Esc Close
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {lines.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="icon">📋</div>Scan or search to add products
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th><th>MRP</th><th>System Stock</th><th>Physical Count</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l._key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.product_name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{l.barcode}</div>
                      {l.multi_batch && l.batch_mrp && (
                        <div style={{ marginTop: 2 }}>
                          <span className="badge badge-orange" style={{ fontSize: 10 }}>MRP ₹{l.batch_mrp}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>{fmt(l.mrp)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                      {l.system_stock.toFixed(l.selling_unit === 'kg' ? 3 : 0)} {l.selling_unit}
                    </td>
                    <td>
                      <input
                        ref={el => { if (el) qtyRefs.current[l._key] = el; }}
                        type="number"
                        value={l.physical_qty}
                        min="0"
                        step="0.001"
                        onChange={e => updateLine(l._key, e.target.value)}
                        onKeyDown={e => handleQtyKey(e, l._key)}
                        placeholder="Enter count"
                        style={{
                          width: 110, fontWeight: 700, fontSize: 14, padding: '5px 8px', textAlign: 'right',
                          borderColor: l.physical_qty !== '' && parseFloat(l.physical_qty) !== l.system_stock ? 'var(--accent)' : undefined,
                        }} />
                      {l.physical_qty !== '' && !isNaN(parseFloat(l.physical_qty)) && (
                        <div style={{
                          fontSize: 10, marginTop: 2,
                          color: parseFloat(l.physical_qty) > l.system_stock ? 'var(--green)'
                               : parseFloat(l.physical_qty) < l.system_stock ? 'var(--red)' : 'var(--text3)',
                        }}>
                          {parseFloat(l.physical_qty) === l.system_stock ? '✓ No change'
                            : `Diff: ${(parseFloat(l.physical_qty) - l.system_stock).toFixed(2)}`}
                        </div>
                      )}
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(l._key)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Monthly stock count" />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleSubmit} disabled={loading || lines.length === 0}>
            {loading ? 'Submitting…' : `📤 Submit ${lines.length} Item${lines.length !== 1 ? 's' : ''} for Approval`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Physical Stock Report Modal — approved requests showing lost/excess
// ─────────────────────────────────────────────────────────────────────────────
function PhysicalStockReportModal({ onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter,   setFilter]   = useState('approved');

  useEffect(() => {
    getPhysicalStockRequests()
      .then(r => setRequests(r.data || []))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const shown = filter === 'all'
    ? requests
    : requests.filter(r => r.status === 'approved');

  const allItems    = shown.flatMap(r => r.items || []);
  const lostItems   = allItems.filter(i => parseFloat(i.physical_stock) < parseFloat(i.system_stock));
  const excessItems = allItems.filter(i => parseFloat(i.physical_stock) > parseFloat(i.system_stock));
  const totalLost   = lostItems.reduce((s, i) => s + (parseFloat(i.system_stock) - parseFloat(i.physical_stock)), 0);
  const totalExcess = excessItems.reduce((s, i) => s + (parseFloat(i.physical_stock) - parseFloat(i.system_stock)), 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 860, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📊 Physical Stock Report</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {shown.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            <div className="stat-card">
              <div className="label">Total Requests</div>
              <div className="value" style={{ color: 'var(--accent)' }}>{shown.length}</div>
            </div>
            <div className="stat-card" style={{ borderColor: lostItems.length > 0 ? 'var(--red)' : undefined }}>
              <div className="label">🔴 Lost Stock</div>
              <div className="value" style={{ color: 'var(--red)', fontSize: 20 }}>{lostItems.length} items</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Total deficit: {totalLost.toFixed(2)} units</div>
            </div>
            <div className="stat-card" style={{ borderColor: excessItems.length > 0 ? 'var(--green)' : undefined }}>
              <div className="label">🟢 Excess Stock</div>
              <div className="value" style={{ color: 'var(--green)', fontSize: 20 }}>{excessItems.length} items</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Total excess: {totalExcess.toFixed(2)} units</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[{ k: 'approved', label: '✅ Approved Only' }, { k: 'all', label: 'All Requests' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)} className="btn btn-sm" style={{
              background: filter === f.k ? 'var(--accent)' : 'var(--surface)',
              color:      filter === f.k ? '#fff' : 'var(--text2)',
              border:    `1px solid ${filter === f.k ? 'var(--accent)' : 'var(--border)'}`,
            }}>{f.label}</button>
          ))}
        </div>

        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {shown.length === 0 ? (
              <div className="empty-state"><div className="icon">📊</div>No {filter === 'approved' ? 'approved' : ''} physical stock requests yet</div>
            ) : shown.map(req => (
              <div key={req.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', background: 'var(--bg2)', cursor: 'pointer' }}
                  onClick={() => setExpanded(expanded === req.id ? null : req.id)}>
                  <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{req.request_number}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(req.created_at).toLocaleString()}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>by {req.requested_by}</span>
                  <span style={{ flex: 1 }} />
                  {(() => {
                    const lost   = (req.items||[]).filter(i => parseFloat(i.physical_stock) < parseFloat(i.system_stock)).length;
                    const excess = (req.items||[]).filter(i => parseFloat(i.physical_stock) > parseFloat(i.system_stock)).length;
                    return (
                      <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        {lost   > 0 && <span className="badge badge-red">🔴 {lost} lost</span>}
                        {excess > 0 && <span className="badge badge-green">🟢 {excess} excess</span>}
                        {lost === 0 && excess === 0 && <span style={{ color: 'var(--text3)' }}>✓ No change</span>}
                      </div>
                    );
                  })()}
                  <span className={`badge ${req.status === 'approved' ? 'badge-green' : req.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>{req.status}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 14, marginLeft: 4 }}>{expanded === req.id ? '▲' : '▼'}</span>
                </div>

                {expanded === req.id && (
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th><th>MRP</th><th>System Stock</th><th>Physical Count</th><th>Difference</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(req.items || []).map((item, i) => {
                        const diff = parseFloat(item.physical_stock) - parseFloat(item.system_stock);
                        const isLost   = diff < 0;
                        const isExcess = diff > 0;
                        return (
                          <tr key={i} style={{ background: isLost ? 'rgba(239,68,68,0.04)' : isExcess ? 'rgba(34,197,94,0.04)' : undefined }}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{item.product_barcode}</div>
                              {item.batch_mrp && (
                                <span className="badge badge-orange" style={{ fontSize: 10, marginTop: 2 }}>MRP ₹{item.batch_mrp}</span>
                              )}
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(item.mrp || 0)}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{parseFloat(item.system_stock).toFixed(2)}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{parseFloat(item.physical_stock).toFixed(2)}</td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                              color: isLost ? 'var(--red)' : isExcess ? 'var(--green)' : 'var(--text3)' }}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                              {isLost   && <span style={{ fontSize: 10, display: 'block', color: 'var(--red)' }}>🔴 Lost</span>}
                              {isExcess && <span style={{ fontSize: 10, display: 'block', color: 'var(--green)' }}>🟢 Excess</span>}
                            </td>
                            <td>
                              <span className={`badge ${item.status === 'approved' ? 'badge-green' : item.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                                {item.status}
                              </span>
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
// Stock Report Modal — item-level physical stock history + never-recorded items
// ─────────────────────────────────────────────────────────────────────────────
function StockReportModal({ onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);

  const [dateFrom,   setDateFrom]   = useState(firstOfMonth);
  const [dateTo,     setDateTo]     = useState(today);
  const [requests,   setRequests]   = useState([]);
  const [allProducts,setAllProducts]= useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('recorded');  // 'recorded' | 'never'
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    Promise.all([
      getPhysicalStockRequests(),
      getStockStatus(),
    ])
      .then(([reqRes, stockRes]) => {
        setRequests(reqRes.data || []);
        setAllProducts(stockRes.data || []);
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  // ── Build per-item history from approved requests ──────────────────────────
  // Flatten all approved items across all requests, filtered by date range
  const recordedRows = React.useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;

    // Only look at approved requests within the date range
    const filteredReqs = requests.filter(r => {
      if (r.status !== 'approved') return false;
      const d = new Date(r.created_at);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });

    // For each product, collect its most-recent approved record in the range
    // Also track the "old qty" = system_stock at time of submission
    const byProduct = {};
    // Sort requests oldest-first so later ones overwrite with most-recent data
    const sorted = [...filteredReqs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (const req of sorted) {
      for (const item of (req.items || [])) {
        const key = item.product_id;
        if (!byProduct[key]) {
          byProduct[key] = {
            product_id:      item.product_id,
            product_name:    item.product_name,
            product_barcode: item.product_barcode,
            selling_unit:    item.selling_unit || 'nos',
            mrp:             item.mrp,
            // first record in range
            first_old_qty:   parseFloat(item.system_stock),
            first_new_qty:   parseFloat(item.physical_stock),
            first_date:      req.created_at,
            // most recent record in range
            last_old_qty:    parseFloat(item.system_stock),
            last_new_qty:    parseFloat(item.physical_stock),
            last_date:       req.created_at,
            record_count:    1,
          };
        } else {
          // Update the latest record
          byProduct[key].last_old_qty  = parseFloat(item.system_stock);
          byProduct[key].last_new_qty  = parseFloat(item.physical_stock);
          byProduct[key].last_date     = req.created_at;
          byProduct[key].record_count += 1;
        }
      }
    }
    return Object.values(byProduct);
  }, [requests, dateFrom, dateTo]);

  // ── Products that have NEVER had a physical stock record ──────────────────
  const neverRecordedProducts = React.useMemo(() => {
    // Collect all product IDs that appear in ANY approved physical stock request
    const everRecordedIds = new Set();
    for (const req of requests) {
      if (req.status !== 'approved') continue;
      for (const item of (req.items || [])) {
        everRecordedIds.add(item.product_id);
      }
    }
    return allProducts.filter(p => !everRecordedIds.has(p.id));
  }, [requests, allProducts]);

  // ── Filtered by search ────────────────────────────────────────────────────
  const filteredRecorded = recordedRows.filter(r =>
    r.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.product_barcode || '').includes(search)
  );
  const filteredNever = neverRecordedProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  );

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const fmtQty = (qty, unit) => `${parseFloat(qty).toFixed(unit === 'kg' ? 3 : 2)} ${unit || ''}`.trim();

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 960, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>📈 Stock Count Report</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
              Physical stock history by date range · Items never counted
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Date range filter */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0, fontSize: 12, whiteSpace: 'nowrap' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ width: 150, fontSize: 13 }} />
          </div>
          <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0, fontSize: 12, whiteSpace: 'nowrap' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ width: 150, fontSize: 13 }} />
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by name or barcode…"
            style={{ flex: 1, minWidth: 180, fontSize: 13 }} />
        </div>

        {/* Summary strip */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            <div className="stat-card">
              <div className="label">Items Counted (in range)</div>
              <div className="value" style={{ color: 'var(--accent)', fontSize: 22 }}>{recordedRows.length}</div>
            </div>
            <div className="stat-card" style={{ borderColor: neverRecordedProducts.length > 0 ? 'var(--yellow)' : undefined }}>
              <div className="label">⚠️ Never Counted</div>
              <div className="value" style={{ color: neverRecordedProducts.length > 0 ? 'var(--yellow)' : 'var(--text3)', fontSize: 22 }}>
                {neverRecordedProducts.length}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Total Products</div>
              <div className="value" style={{ color: 'var(--text2)', fontSize: 22 }}>{allProducts.length}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[
            { k: 'recorded', label: `📋 Counted Items (${filteredRecorded.length})` },
            { k: 'never',    label: `⚠️ Never Counted (${filteredNever.length})` },
          ].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} className="btn btn-sm" style={{
              background: activeTab === t.k ? 'var(--accent)' : 'var(--surface)',
              color:      activeTab === t.k ? '#fff' : 'var(--text2)',
              border:    `1px solid ${activeTab === t.k ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: activeTab === t.k ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Table area */}
        {loading ? <div className="spinner" /> : (
          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Tab: Counted Items ── */}
            {activeTab === 'recorded' && (
              <>
                {filteredRecorded.length === 0 ? (
                  <div className="empty-state">
                    <div className="icon">📋</div>
                    {recordedRows.length === 0
                      ? 'No approved physical stock records found in this date range'
                      : `No items matching "${search}"`}
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>MRP</th>
                        <th>Last Counted Date</th>
                        <th>Old Qty (system)</th>
                        <th>New Qty (physical)</th>
                        <th>Difference</th>
                        <th style={{ fontSize: 11 }}>Records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecorded.map(r => {
                        const diff = r.last_new_qty - r.last_old_qty;
                        const isLost   = diff < 0;
                        const isExcess = diff > 0;
                        return (
                          <tr key={r.product_id}
                            style={{ background: isLost ? 'rgba(239,68,68,0.03)' : isExcess ? 'rgba(34,197,94,0.03)' : undefined }}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.product_name}</div>
                              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.product_barcode}</div>
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(r.mrp || 0)}</td>
                            <td style={{ fontSize: 12 }}>
                              <div style={{ color: 'var(--text1)' }}>{fmtDate(r.last_date)}</div>
                              {r.record_count > 1 && (
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                                  First: {fmtDate(r.first_date)}
                                </div>
                              )}
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                              {fmtQty(r.last_old_qty, r.selling_unit)}
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text1)' }}>
                              {fmtQty(r.last_new_qty, r.selling_unit)}
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                              color: isLost ? 'var(--red)' : isExcess ? 'var(--green)' : 'var(--text3)' }}>
                              {diff === 0
                                ? <span style={{ fontSize: 11 }}>✓ No change</span>
                                : <>
                                    <span>{diff > 0 ? '+' : ''}{diff.toFixed(2)}</span>
                                    <span style={{ fontSize: 10, display: 'block', marginTop: 1 }}>
                                      {isLost ? '🔴 Loss' : '🟢 Excess'}
                                    </span>
                                  </>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge badge-blue" style={{ fontSize: 11 }}>
                                {r.record_count}×
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {/* ── Tab: Never Counted ── */}
            {activeTab === 'never' && (
              <>
                {filteredNever.length === 0 ? (
                  <div className="empty-state">
                    <div className="icon">✅</div>
                    {neverRecordedProducts.length === 0
                      ? 'All products have been physically counted at least once!'
                      : `No items matching "${search}"`}
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '8px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid var(--yellow)',
                      borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 12, color: 'var(--text2)' }}>
                      ⚠️ These <strong>{filteredNever.length}</strong> product{filteredNever.length !== 1 ? 's have' : ' has'} never had a physical stock count approved.
                      Consider adding them to your next physical stock session.
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Barcode</th>
                          <th>Product</th>
                          <th>Unit</th>
                          <th>Current Stock</th>
                          <th>MRP</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredNever.map(p => {
                          const qty   = parseFloat(p.stock_quantity);
                          const isOut = qty <= 0;
                          const isLow = qty > 0 && qty <= LOW_STOCK_THRESHOLD;
                          return (
                            <tr key={p.id}>
                              <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.barcode}</span></td>
                              <td style={{ fontWeight: 600 }}>{p.name}</td>
                              <td><span className="badge badge-blue">{p.selling_unit}</span></td>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                                color: isOut ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>
                                {qty.toFixed(p.selling_unit === 'kg' ? 3 : 0)}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(p.selling_price)}</td>
                              <td>
                                {isOut ? <span className="badge badge-red">Out of Stock</span>
                                  : isLow ? <span className="badge badge-yellow">Low Stock</span>
                                  : <span className="badge badge-green">In Stock</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Opening Stock Modal — migrate existing stock from old software
// ─────────────────────────────────────────────────────────────────────────────
function OpeningStockModal({ onClose }) {
  const [rows, setRows]       = useState([emptyRow()]);
  const [loading, setLoading] = useState(false);
  const debounceTimers        = useRef({});

  // Refs for keyboard navigation: searchRef[rowId], field refs per row
  const searchRefs   = useRef({});
  const mrpRefs      = useRef({});
  const costRefs     = useRef({});
  const taxRefs      = useRef({});
  const qtyRefs      = useRef({});
  const unitRefs     = useRef({});
  const nameRefs     = useRef({});
  const barcodeRefs  = useRef({});

  // F1 → save
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'F1') { e.preventDefault(); handleSubmit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Focus helpers
  const focus = ref => setTimeout(() => { const el = ref?.current; if (el) { el.focus(); if (el.select) el.select(); } }, 30);
  const focusRef = (refsObj, id) => setTimeout(() => { const el = refsObj.current[id]; if (el) { el.focus(); if (el.select) el.select(); } }, 30);

  function emptyRow() {
    return {
      _id: Date.now() + Math.random(),
      query: '', results: [], searching: false, hiIdx: 0,
      existingProduct: null,
      name: '', barcode: '', selling_unit: 'nos', mrp: '', purchase_price: '', tax: '0', quantity: '',
      isNew: true,
    };
  }

  const UNITS = ['nos', 'kg', 'case'];

  const updateRow = (id, field, value) =>
    setRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));

  const selectExisting = (rowId, product) => {
    setRows(prev => prev.map(r => r._id === rowId ? {
      ...r,
      existingProduct: product,
      query: product.name,
      results: [], hiIdx: 0,
      searching: false,
      name: product.name,
      barcode: product.barcode,
      selling_unit: product.selling_unit || 'nos',
      mrp: String(product.selling_price),
      isNew: false,
    } : r));
    // Move focus to MRP after selecting
    setTimeout(() => { const el = mrpRefs.current[rowId]; if (el) { el.focus(); el.select(); } }, 50);
  };

  const clearExisting = rowId => {
    setRows(prev => prev.map(r => r._id === rowId ? {
      ...r, existingProduct: null, query: '', results: [], hiIdx: 0, name: '', barcode: '',
      selling_unit: 'nos', mrp: '', isNew: true,
    } : r));
    setTimeout(() => { const el = searchRefs.current[rowId]; if (el) el.focus(); }, 50);
  };

  const doSearch = async (rowId, q) => {
    if (!q.trim()) { updateRow(rowId, 'results', []); return; }
    updateRow(rowId, 'searching', true);
    try {
      const { data } = await searchProducts(q);
      const seen = new Set();
      const unique = data.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
      setRows(prev => prev.map(r => r._id === rowId ? { ...r, results: unique, searching: false, hiIdx: 0 } : r));
    } catch {
      setRows(prev => prev.map(r => r._id === rowId ? { ...r, results: [], searching: false } : r));
    }
  };

  const handleBarcodeScan = async (rowId, barcode) => {
    if (!barcode.trim()) return;
    try {
      const { data } = await getProductByBarcode(barcode);
      const rows_data = Array.isArray(data) ? data : [data];
      if (rows_data.length > 0) selectExisting(rowId, rows_data[0]);
    } catch {}
  };

  const handleQueryChange = (rowId, value) => {
    updateRow(rowId, 'query', value);
    clearTimeout(debounceTimers.current[rowId]);
    debounceTimers.current[rowId] = setTimeout(() => doSearch(rowId, value), 300);
  };

  // Keyboard nav inside search dropdown
  const handleSearchKey = (e, row) => {
    const { _id, results, hiIdx } = row;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateRow(_id, 'hiIdx', Math.min(hiIdx + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateRow(_id, 'hiIdx', Math.max(hiIdx - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      updateRow(_id, 'results', []);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        selectExisting(_id, results[hiIdx] || results[0]);
        return;
      }
      // Try barcode scan
      handleBarcodeScan(_id, row.query);
      return;
    }
  };

  // Enter key navigation: field order depends on isNew
  // existing: mrp → cost → tax → qty → next-row-search
  // new:      name → barcode → unit → mrp → cost → tax → qty → next-row-search
  const handleFieldEnter = (e, rowId, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const row = rows.find(r => r._id === rowId);
    if (!row) return;

    const orderExisting = ['mrp', 'cost', 'tax', 'qty'];
    const orderNew      = ['name', 'barcode', 'unit', 'mrp', 'cost', 'tax', 'qty'];
    const order = row.isNew ? orderNew : orderExisting;
    const idx   = order.indexOf(field);
    const next  = order[idx + 1];

    const refMap = {
      name:    nameRefs,
      barcode: barcodeRefs,
      unit:    unitRefs,
      mrp:     mrpRefs,
      cost:    costRefs,
      tax:     taxRefs,
      qty:     qtyRefs,
    };

    if (next) {
      const el = refMap[next]?.current[rowId];
      if (el) { el.focus(); if (el.select) el.select(); }
    } else {
      // Last field → move to next row's search, or add new row
      const rowIdx = rows.findIndex(r => r._id === rowId);
      if (rowIdx < rows.length - 1) {
        const nextRowId = rows[rowIdx + 1]._id;
        const el = searchRefs.current[nextRowId];
        if (el) el.focus();
      } else {
        // Add a new row and focus its search
        const newRow = emptyRow();
        setRows(prev => [...prev, newRow]);
        setTimeout(() => { const el = searchRefs.current[newRow._id]; if (el) el.focus(); }, 60);
      }
    }
  };

  const handleSubmit = async () => {
    for (const row of rows) {
      if (row.isNew && !row.name.trim()) { toast.error('Enter product name for each item'); return; }
      if (!row.mrp || parseFloat(row.mrp) <= 0) { toast.error(`Enter selling price for "${row.name || 'item'}""`); return; }
      if (!row.quantity || parseFloat(row.quantity) <= 0) { toast.error(`Enter opening quantity for "${row.name || 'item'}"`); return; }
    }
    setLoading(true);
    try {
      for (const row of rows) {
        const payload = {
          mrp:            parseFloat(row.mrp),
          purchase_price: parseFloat(row.purchase_price) || 0,
          tax:            parseFloat(row.tax) || 0,
          quantity:       parseFloat(row.quantity),
        };
        if (row.existingProduct) {
          payload.product = row.existingProduct.id;
        } else {
          payload.new_product_name = row.name.trim();
          if (row.barcode.trim()) payload.new_barcode = row.barcode.trim();
        }
        await createOpeningStock(payload);
      }
      toast.success(`Opening stock saved — ${rows.length} item${rows.length > 1 ? 's' : ''} added to stock`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.new_product_name?.[0] || 'Failed to save opening stock');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 900, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>📦 Opening Stock Entry</h2>
            <p style={{ color: 'var(--text3)', fontSize: 12, margin: '4px 0 0', maxWidth: 560 }}>
              Use this to bring in your existing stock from your old software.
              Once saved, items will be available for normal sales immediately.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 7px', fontFamily: 'var(--mono)' }}>F1 = Save</span>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 'var(--radius)', padding: '9px 14px', marginBottom: 14,
          fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span>💡</span>
          <span>
            <strong>Purchase price is optional</strong> — leave blank if unknown. Items sell normally at the MRP you enter. ·
            <strong style={{ marginLeft: 6 }}>Keyboard:</strong> ↑↓ navigate list · Enter select / advance field · F1 save
          </span>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rows.map((row, idx) => (
            <div key={row._id} style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: 16, marginBottom: 12, background: 'var(--bg3)',
            }}>
              {/* Item header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>📦 Item {idx + 1}</span>
                {rows.length > 1 && (
                  <button className="btn btn-danger btn-sm" onClick={() => setRows(prev => prev.filter(r => r._id !== row._id))}>✕ Remove</button>
                )}
              </div>

              {/* Product search */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)', display: 'block', marginBottom: 5 }}>
                  Search Existing Product — or fill name below to create new
                </label>
                {!row.existingProduct ? (
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={el => { searchRefs.current[row._id] = el; }}
                      autoFocus={idx === 0}
                      value={row.query}
                      onChange={e => handleQueryChange(row._id, e.target.value)}
                      onKeyDown={e => handleSearchKey(e, row)}
                      placeholder="🔍 Scan barcode or type to search… (↑↓ navigate, Enter select)"
                      style={{ fontSize: 13 }} />
                    {row.searching && <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, color: 'var(--text3)' }}>…</div>}
                    {row.results.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)', marginTop: 2, maxHeight: 200,
                        overflowY: 'auto', boxShadow: 'var(--shadow)',
                      }}>
                        <div style={{ padding: '5px 12px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                          ↑↓ Navigate · Enter Select · Esc Close · {row.results.length} result{row.results.length !== 1 ? 's' : ''}
                        </div>
                        {row.results.map((p, i) => (
                          <div key={p.id}
                            onClick={() => selectExisting(row._id, p)}
                            style={{
                              padding: '8px 14px', cursor: 'pointer',
                              borderBottom: '1px solid var(--border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              background: row.hiIdx === i ? 'var(--accent-dim)' : '',
                            }}
                            onMouseEnter={() => updateRow(row._id, 'hiIdx', i)}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                                {p.barcode} · MRP ₹{parseFloat(p.selling_price).toFixed(2)} · Stock: {parseFloat(p.stock_quantity).toFixed(0)} {p.selling_unit}
                              </div>
                            </div>
                            <span className="badge badge-green">Existing</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--bg2)', padding: '10px 14px',
                    borderRadius: 'var(--radius)', border: '1px solid var(--green)',
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>✓ {row.existingProduct.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 12 }}>{row.existingProduct.barcode}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 10 }}>
                        Current stock: {parseFloat(row.existingProduct.stock_quantity || 0).toFixed(0)} {row.existingProduct.selling_unit}
                      </span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => clearExisting(row._id)}>✕ Clear</button>
                  </div>
                )}
              </div>

              {/* New product fields */}
              {!row.existingProduct && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Product Name *</label>
                    <input
                      ref={el => { nameRefs.current[row._id] = el; }}
                      value={row.name}
                      onChange={e => updateRow(row._id, 'name', e.target.value)}
                      onKeyDown={e => handleFieldEnter(e, row._id, 'name')}
                      placeholder="e.g. Britannia Marie Biscuit 200g"
                      style={{ fontSize: 13 }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Barcode (auto if blank)</label>
                    <input
                      ref={el => { barcodeRefs.current[row._id] = el; }}
                      value={row.barcode}
                      onChange={e => updateRow(row._id, 'barcode', e.target.value)}
                      onKeyDown={e => handleFieldEnter(e, row._id, 'barcode')}
                      placeholder="Scan or leave blank"
                      style={{ fontSize: 13, fontFamily: 'var(--mono)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Selling Unit</label>
                    <select
                      ref={el => { unitRefs.current[row._id] = el; }}
                      value={row.selling_unit}
                      onChange={e => updateRow(row._id, 'selling_unit', e.target.value)}
                      onKeyDown={e => handleFieldEnter(e, row._id, 'unit')}
                      style={{ fontSize: 13 }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Price & quantity fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Selling Price / MRP (₹) *</label>
                  <input
                    ref={el => { mrpRefs.current[row._id] = el; }}
                    type="number" step="0.01" min="0"
                    value={row.mrp}
                    onChange={e => updateRow(row._id, 'mrp', e.target.value)}
                    onKeyDown={e => handleFieldEnter(e, row._id, 'mrp')}
                    placeholder="0.00" style={{ fontSize: 13 }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Purchase / Cost Price (₹)</label>
                  <input
                    ref={el => { costRefs.current[row._id] = el; }}
                    type="number" step="0.01" min="0"
                    value={row.purchase_price}
                    onChange={e => updateRow(row._id, 'purchase_price', e.target.value)}
                    onKeyDown={e => handleFieldEnter(e, row._id, 'cost')}
                    placeholder="0.00 (optional)" style={{ fontSize: 13 }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Tax / GST (%)</label>
                  <input
                    ref={el => { taxRefs.current[row._id] = el; }}
                    type="number" step="0.01" min="0"
                    value={row.tax}
                    onChange={e => updateRow(row._id, 'tax', e.target.value)}
                    onKeyDown={e => handleFieldEnter(e, row._id, 'tax')}
                    placeholder="0" style={{ fontSize: 13 }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Opening Quantity *</label>
                  <input
                    ref={el => { qtyRefs.current[row._id] = el; }}
                    type="number" step="0.001" min="0"
                    value={row.quantity}
                    onChange={e => updateRow(row._id, 'quantity', e.target.value)}
                    onKeyDown={e => handleFieldEnter(e, row._id, 'qty')}
                    placeholder="0" style={{ fontSize: 13, fontWeight: 700 }} />
                  {row.quantity && parseFloat(row.quantity) > 0 && row.mrp && parseFloat(row.mrp) > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                      Value: ₹{(parseFloat(row.quantity) * parseFloat(row.mrp)).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button className="btn btn-secondary btn-sm" onClick={() => {
            const newRow = emptyRow();
            setRows(prev => [...prev, newRow]);
            setTimeout(() => { const el = searchRefs.current[newRow._id]; if (el) el.focus(); }, 60);
          }}>+ Add Another Item</button>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)' }}>
            {rows.length} item{rows.length !== 1 ? 's' : ''} · Est. value: ₹{rows.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.mrp) || 0), 0).toFixed(2)}
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'center' }} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : `📦 Save Opening Stock (${rows.length} item${rows.length > 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Stock Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Stock() {
  const { isAdmin, can } = usePermissions();
  const [products,        setProducts]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [filterTab,       setFilterTab]       = useState('all');
  const [showPhysical,    setShowPhysical]    = useState(false);
  const [showOpeningStock, setShowOpeningStock] = useState(false);
  const [showStockReport, setShowStockReport] = useState(false);
  const [showCountReport, setShowCountReport] = useState(false);  // NEW

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try { const { data } = await getStockStatus(); setProducts(data); }
    catch { toast.error('Failed to load stock'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  const searchFiltered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)
  );

  const filtered = searchFiltered.filter(p => {
    const qty = parseFloat(p.stock_quantity);
    if (filterTab === 'all')     return true;
    if (filterTab === 'instock') return qty > LOW_STOCK_THRESHOLD;
    if (filterTab === 'out')     return qty <= 0;
    if (filterTab === 'low')     return qty > 0 && qty <= LOW_STOCK_THRESHOLD;
    if (filterTab === 'damaged') return parseFloat(p.damaged_quantity) > 0;
    if (filterTab === 'expired') return parseFloat(p.expired_quantity) > 0;
    return true;
  });

  const totalProducts = products.length;
  const outOfStock    = products.filter(p => parseFloat(p.stock_quantity) <= 0).length;
  const lowStock      = products.filter(p => { const q = parseFloat(p.stock_quantity); return q > 0 && q <= LOW_STOCK_THRESHOLD; }).length;

  const FILTER_TABS = [
    { k: 'all',     label: 'All',            count: products.length },
    { k: 'instock', label: 'In Stock',        count: products.filter(p => parseFloat(p.stock_quantity) > LOW_STOCK_THRESHOLD).length },
    { k: 'low',     label: 'Low Stock',       count: lowStock },
    { k: 'out',     label: 'Out of Stock',    count: outOfStock },
    { k: 'damaged', label: 'Damaged',         count: products.filter(p => parseFloat(p.damaged_quantity) > 0).length },
    { k: 'expired', label: 'Expired',         count: products.filter(p => parseFloat(p.expired_quantity) > 0).length },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>📦 Stock</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={fetchStock}>🔄 Refresh</button>
          {(isAdmin || can('can_stock_report')) && (
            <button className="btn btn-secondary" onClick={() => setShowCountReport(true)}
              style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>
              📈 Stock Report
            </button>
          )}
          {(isAdmin || can('can_stock_report')) && (
            <button className="btn btn-secondary" onClick={() => setShowStockReport(true)}
              style={{ color: 'var(--purple)', borderColor: 'var(--purple)' }}>
              📊 Physical Stock Report
            </button>
          )}
          {(isAdmin || can('can_opening_stock')) && (
            <button className="btn btn-secondary" onClick={() => setShowOpeningStock(true)}
              style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
              📦 Opening Stock
            </button>
          )}
          {(isAdmin || can('can_physical_stock')) && (
            <button className="btn btn-primary" onClick={() => setShowPhysical(true)}>
              📋 Physical Stock
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Total Products</div>
          <div className="value" style={{ color: 'var(--accent)' }}>{totalProducts}</div>
        </div>
        <div className="stat-card" style={{ border: outOfStock > 0 ? '1px solid var(--red)' : undefined }}>
          <div className="label">Out of Stock</div>
          <div className="value" style={{ color: outOfStock > 0 ? 'var(--red)' : 'var(--text3)' }}>{outOfStock}</div>
        </div>
        <div className="stat-card" style={{ border: lowStock > 0 ? '1px solid var(--yellow)' : undefined }}>
          <div className="label">Low Stock (≤{LOW_STOCK_THRESHOLD})</div>
          <div className="value" style={{ color: lowStock > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{lowStock}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f.k} onClick={() => setFilterTab(f.k)} className="btn btn-sm" style={{
            background: filterTab === f.k ? 'var(--accent)' : 'var(--surface)',
            color:      filterTab === f.k ? '#fff' : 'var(--text2)',
            border:    `1px solid ${filterTab === f.k ? 'var(--accent)' : 'var(--border)'}`,
            fontWeight: filterTab === f.k ? 700 : 400,
          }}>
            {f.label}
            <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 10, background: filterTab === f.k ? 'rgba(255,255,255,0.25)' : 'var(--bg3)' }}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search by name or barcode…" />
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Barcode</th><th>Product</th><th>Unit</th>
                  <th>Stock</th><th>Damaged</th><th>Expired</th>
                  <th>MRP</th><th>Status</th><th>Batches</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const qty     = parseFloat(p.stock_quantity);
                  const damaged = parseFloat(p.damaged_quantity);
                  const expired = parseFloat(p.expired_quantity);
                  const isOut   = qty <= 0;
                  const isLow   = qty > 0 && qty <= LOW_STOCK_THRESHOLD;
                  const batches = p.batches || [];
                  return (
                    <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.5 }}>
                      <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.barcode}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><span className="badge badge-blue">{p.selling_unit}</span></td>
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                          color: isOut ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)' }}>
                          {qty.toFixed(p.selling_unit === 'kg' ? 3 : 0)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: damaged > 0 ? 'var(--red)' : 'var(--text3)' }}>
                        {damaged > 0 ? damaged.toFixed(p.selling_unit === 'kg' ? 3 : 0) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: expired > 0 ? 'var(--yellow)' : 'var(--text3)' }}>
                        {expired > 0 ? expired.toFixed(p.selling_unit === 'kg' ? 3 : 0) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(p.selling_price)}</td>
                      <td>
                        {isOut ? <span className="badge badge-red">Out of Stock</span>
                          : isLow ? <span className="badge badge-yellow">Low Stock</span>
                          : <span className="badge badge-green">In Stock</span>}
                      </td>
                      <td>
                        {batches.filter(b => parseFloat(b.quantity) > 0).length > 1 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {batches.filter(b => parseFloat(b.quantity) > 0).map(b => (
                              <span key={b.id} style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                                ₹{parseFloat(b.mrp).toFixed(2)} × {parseFloat(b.quantity).toFixed(p.selling_unit === 'kg' ? 3 : 0)}
                              </span>
                            ))}
                          </div>
                        ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="icon">📦</div>
                {search ? `No products matching "${search}"` : `No products in "${FILTER_TABS.find(f => f.k === filterTab)?.label}" filter`}
              </div>
            )}
          </div>
        )}
      </div>

      {showPhysical    && <PhysicalStockModal       onClose={() => { setShowPhysical(false);    fetchStock(); }} />}
      {showOpeningStock && <OpeningStockModal        onClose={() => { setShowOpeningStock(false); fetchStock(); }} />}
      {showStockReport && <PhysicalStockReportModal onClose={() => setShowStockReport(false)} />}
      {showCountReport && <StockReportModal         onClose={() => setShowCountReport(false)} />}
    </div>
  );
}