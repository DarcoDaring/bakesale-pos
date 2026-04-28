import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const getKCStockToday  = ()      => api.get('/kc-stock/today/');
const createKCStock    = d       => api.post('/kc-stock/', d);
const getKCStockHistory = params => api.get('/kc-stock/', { params });

export default function KCStockPage() {
  const navigate = useNavigate();
  const [stockItems, setStockItems] = useState([]); // today's purchased items with remaining qty
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]       = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  const loadTodayStock = async () => {
    setLoading(true);
    try {
      const { data } = await getKCStockToday();
      // data = list of { item_id, item_name, purchased_qty, carried_qty, sold_qty, remaining_qty }
      setStockItems(data);
      // Pre-fill rows with remaining qty and carry_forward = false
      setRows(data.map(d => ({
        item_id:       d.item_id,
        item_name:     d.item_name,
        purchased_qty: d.purchased_qty,
        carried_qty:   d.carried_qty,
        sold_qty:      d.sold_qty,
        remaining_qty: d.remaining_qty,
        qty:           String(d.remaining_qty), // pre-fill with remaining
        carry_forward: false,
      })));
    } catch { toast.error('Failed to load stock'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTodayStock(); }, []);

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const { data } = await getKCStockHistory(params);
      setHistory(data || []);
    } catch { toast.error('Failed to load history'); }
    finally { setHistLoading(false); }
  };

  const updateRow = (idx, field, val) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const handleSave = async () => {
    const validRows = rows.filter(r => r.qty !== '' && parseFloat(r.qty) >= 0);
    if (validRows.length === 0) { toast.error('Enter balance qty for at least one item'); return; }
    setSaving(true);
    try {
      await createKCStock({
        lines: validRows.map(r => ({
          item_id:       r.item_id,
          item_name:     r.item_name,
          qty:           parseFloat(r.qty),
          carry_forward: r.carry_forward,
        })),
      });
      toast.success('Balance stock saved!');
      // Reset qty fields but keep items
      setRows(prev => prev.map(r => ({ ...r, qty: '', carry_forward: false })));
    } catch { toast.error('Failed to save stock'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>🗃️ Balance Stock</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadTodayStock}>🔄 Refresh</button>
          <button className="btn btn-secondary" onClick={() => { setShowHistory(true); loadHistory(); }}>
            📋 History
          </button>
        </div>
      </div>

      {/* Info box */}
      <div style={{
        background: 'var(--blue-dim)', border: '1px solid var(--blue)',
        borderRadius: 'var(--radius)', padding: '10px 16px',
        fontSize: 13, color: 'var(--blue)', marginBottom: 20, lineHeight: 1.6,
      }}>
        ℹ️ Only items purchased today are shown. Enter closing balance qty.
        Check <b>Carry Forward</b> to add remaining qty to tomorrow's stock.
        Tomorrow's stock = Today's carry forward + Tomorrow's purchase.
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🗃️</div>
              No items purchased today.<br />
              Please enter today's purchase first.
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th style={{ textAlign: 'center' }}>Purchased</th>
                    <th style={{ textAlign: 'center' }}>Carried In</th>
                    <th style={{ textAlign: 'center' }}>Sold</th>
                    <th style={{ textAlign: 'center' }}>Remaining</th>
                    <th style={{ textAlign: 'center', width: 130 }}>Closing Qty</th>
                    <th style={{ textAlign: 'center', width: 120 }}>Carry Forward</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.item_name}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                        {r.purchased_qty}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                        {r.carried_qty > 0 ? `+${r.carried_qty}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                        {r.sold_qty > 0 ? `−${r.sold_qty}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700,
                        color: r.remaining_qty <= 0 ? 'var(--red)' : 'var(--accent)' }}>
                        {r.remaining_qty}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number" min="0" step="1"
                          value={r.qty}
                          onChange={e => updateRow(i, 'qty', e.target.value)}
                          placeholder="0"
                          style={{
                            width: 90, textAlign: 'center', fontWeight: 700,
                            borderColor: r.qty !== '' ? 'var(--accent)' : undefined,
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={r.carry_forward}
                            onChange={e => updateRow(i, 'carry_forward', e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--green)' }}
                          />
                          <span style={{
                            fontSize: 12, fontWeight: r.carry_forward ? 700 : 400,
                            color: r.carry_forward ? 'var(--green)' : 'var(--text3)',
                          }}>
                            {r.carry_forward ? '✓ Yes' : 'No'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {rows.filter(r => r.carry_forward).length} item(s) marked for carry forward
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setRows(prev => prev.map(r => ({ ...r, qty: '', carry_forward: false })))}>
                    Clear
                  </button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : '✓ Save Balance Stock'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>🗃️ Stock History</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(false)}>✕ Close</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
              <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 160 }} />
              <button className="btn btn-primary btn-sm" onClick={loadHistory}>Load</button>
            </div>
            {histLoading ? <div className="spinner" /> : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {history.map(h => (
                  <div key={h.id} className="card" style={{ marginBottom: 12, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                      <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)' }}>{h.stock_number}</span>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(h.created_at).toLocaleString('en-IN')}</span>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th style={{ textAlign: 'center' }}>Balance Qty</th>
                          <th style={{ textAlign: 'center' }}>Carry Forward</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(h.lines || []).map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{l.qty}</td>
                            <td style={{ textAlign: 'center' }}>
                              {l.carry_forward
                                ? <span className="badge badge-green">✓ Yes</span>
                                : <span style={{ color: 'var(--text3)', fontSize: 12 }}>No</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {history.length === 0 && <div className="empty-state"><div className="icon">🗃️</div>No records found</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}