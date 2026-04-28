import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCBills, deleteKCBill } from './kaapiApi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;

const getItemsWithStock = () => api.get('/kc-sale-items/with_stock/');
const createKCBill      = d  => api.post('/kc-bills/', d);


function printBill(bill, duplicate = false) {
  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) { toast.error('Allow popups to print'); return; }
  const lines = (bill.lines || []).map(l =>
    `<tr>
      <td style="padding:4px 0">${l.item_name}</td>
      <td style="text-align:center;padding:4px 8px">${l.qty}</td>
      <td style="text-align:right;padding:4px 0">₹${parseFloat(l.price * l.qty).toFixed(2)}</td>
    </tr>`
  ).join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;font-size:13px;padding:20px;width:320px}
    .shop{text-align:center;font-size:20px;font-weight:700;margin-bottom:2px}
    .meta{text-align:center;font-size:11px;color:#555;margin-bottom:2px}
    .dup{text-align:center;color:red;font-weight:700;font-size:15px;border:2px solid red;padding:3px;margin:8px 0}
    .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    th{border-bottom:1px solid #000;padding:3px 0;font-size:12px;text-align:left}
    .total-row{border-top:2px solid #000;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:700;font-size:15px}
    .footer{text-align:center;font-size:11px;color:#555;margin-top:12px}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="shop">☕ KAAPI CHAI</div>
  <div class="meta">Bill No: <b>${bill.bill_number}</b></div>
  <div class="meta">${new Date(bill.created_at || Date.now()).toLocaleString('en-IN')}</div>
  ${duplicate ? '<div class="dup">*** DUPLICATE COPY ***</div>' : ''}
  <div class="divider"></div>
  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Amt</th></tr></thead>
  <tbody>${lines}</tbody></table>
  <div class="divider"></div>
  <div class="total-row"><span>TOTAL</span><span>₹${parseFloat(bill.total).toFixed(2)}</span></div>
  <div class="footer">Thank You! Visit Again ☕</div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// ── Qty Popup ──────────────────────────────────────────────────────────────────
function QtyPopup({ item, onConfirm, onCancel }) {
  const [qty, setQty]   = useState(1);
  const inputRef        = useRef();
  const hasStockLimit   = item.remaining_qty !== null && item.remaining_qty !== undefined;
  const maxQty          = hasStockLimit ? item.remaining_qty : 9999;

  useEffect(() => { setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 80); }, []);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{item.name}</h2>
        <p style={{ color: 'var(--text3)', marginBottom: 6, fontSize: 14 }}>{fmt(item.price)} each</p>
        {hasStockLimit && (
          <p style={{ color: 'var(--green)', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            Available stock: {maxQty}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={() => setQty(q => Math.max(1, q - 1))} style={{ fontSize: 20, padding: '6px 16px' }}>−</button>
          <input
            ref={inputRef}
            type="number" min="1" max={maxQty} value={qty}
            onChange={e => setQty(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(qty); if (e.key === 'Escape') onCancel(); }}
            style={{ width: 90, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
          />
          <button className="btn btn-secondary" onClick={() => setQty(q => Math.min(maxQty, q + 1))} style={{ fontSize: 20, padding: '6px 16px' }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onConfirm(qty)}>
            ✓ Add &amp; More
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>✕ Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Group Popup ────────────────────────────────────────────────────────────────
function GroupPopup({ group, onSelect, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <h2>{group.name}</h2>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>Select an item</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
          {(group.sub_items || []).map(si => (
            <button
              key={si.id}
              className="btn btn-secondary"
              onClick={() => onSelect(si)}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '12px 14px', height: 'auto' }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>{si.name}</span>
              <span style={{ fontSize: 13, color: 'var(--accent)' }}>{fmt(si.price)}</span>
              {/* Only show stock if it's tracked (purchase_required group) */}
              {si.remaining_qty !== null && si.remaining_qty !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--green)' }}>Stock: {si.remaining_qty}</span>
              )}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>✕ Close</button>
      </div>
    </div>
  );
}

// ── Cart Popup ─────────────────────────────────────────────────────────────────
function CartPopup({ cart, onRemove, onSave, onAddMore, onClose }) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2>🛒 Current Order</h2>
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {cart.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}><div className="icon">🛒</div>No items added</div>
          ) : (
            <table>
              <thead>
                <tr><th>Item</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Amt</th><th></th></tr>
              </thead>
              <tbody>
                {cart.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.qty}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{fmt(item.price * item.qty)}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => onRemove(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--accent)', marginBottom: 14 }}>
          <span style={{ fontSize: 15, color: 'var(--text3)' }}>TOTAL</span>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(total)}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onAddMore}>+ Add More</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onSave} disabled={cart.length === 0}>
            🖨️ Save &amp; Print Bill
          </button>
        </div>
        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={onClose}>← Back</button>
      </div>
    </div>
  );
}

// ── View Bills Modal ───────────────────────────────────────────────────────────
function ViewBillsModal({ onClose, canDelete }) {
  const [bills, setBills]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const { data } = await getKCBills(params);
      setBills(data);
    } catch { toast.error('Failed to load bills'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (bill) => {
    if (!window.confirm(`Delete bill ${bill.bill_number}?`)) return;
    try { await deleteKCBill(bill.id); toast.success('Bill deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const filtered = bills.filter(b => b.bill_number?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📋 Bills</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bill no…" style={{ flex: 1 }} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 160 }} />
          <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table>
              <thead>
                <tr><th>Bill No</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => printBill(b, true)}>🖨️ Reprint</button>
                        {canDelete && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b)}>🗑️</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state"><div className="icon">📄</div>No bills found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Sale Page ─────────────────────────────────────────────────────────────
export default function KCSalePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const [saleItems, setSaleItems] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [cart, setCart]           = useState([]);
  const [qtyItem, setQtyItem]     = useState(null);
  const [groupItem, setGroupItem] = useState(null);
  const [showCart, setShowCart]   = useState(false);
  const [showBills, setShowBills] = useState(false);
  

  const loadItems = () => {
    setLoading(true);
    getItemsWithStock()
      .then(r => setSaleItems(r.data || []))
      .catch(() => toast.error('Failed to load items'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(); }, []);

  const handleItemPress = (item) => {
    if (item.item_type === 'group') setGroupItem(item);
    else setQtyItem(item);
  };

  const handleSubSelect = (subItem) => { setGroupItem(null); setQtyItem(subItem); };

  const handleQtyConfirm = (qty) => {
    const hasStockLimit = qtyItem.remaining_qty !== null && qtyItem.remaining_qty !== undefined;

    if (hasStockLimit) {
      // Stock controlled — check cart + new qty vs available
      const existing      = cart.find(i => i.id === qtyItem.id && i.name === qtyItem.name);
      const alreadyInCart = existing ? existing.qty : 0;
      const maxQty        = qtyItem.remaining_qty || 0;
      if (alreadyInCart + qty > maxQty) {
        toast.error(`Only ${maxQty - alreadyInCart} more available`);
        return;
      }
    }

    setCart(prev => {
      const idx = prev.findIndex(i => i.id === qtyItem.id && i.name === qtyItem.name);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx]  = { ...updated[idx], qty: updated[idx].qty + qty };
        return updated;
      }
      return [...prev, {
        id:            qtyItem.id,
        name:          qtyItem.name,
        price:         parseFloat(qtyItem.price),
        qty,
        remaining_qty: qtyItem.remaining_qty, // null = no limit
      }];
    });
    setQtyItem(null);
    toast.success(`${qtyItem.name} × ${qty} added`);
  };

  const handleSaveAndPrint = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    try {
      const payload = {
        lines: cart.map(i => ({ item_id: i.id, item_name: i.name, qty: i.qty, price: i.price })),
        total: cart.reduce((s, i) => s + i.price * i.qty, 0),
      };
      const { data } = await createKCBill(payload);
      printBill(data);
      setCart([]);
      setShowCart(false);
      loadItems(); // refresh stock counts on buttons
      toast.success(`Bill ${data.bill_number} saved!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save bill');
    }
  };

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>☕ Sale</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={loadItems}>🔄 Refresh</button>
          <button className="btn btn-secondary" onClick={() => setShowBills(true)}>📋 View Bills</button>
          {cart.length > 0 && (
            <button className="btn btn-primary" onClick={() => setShowCart(true)}>
              🛒 {cartCount} item{cartCount !== 1 ? 's' : ''} · {fmt(cartTotal)}
            </button>
          )}
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {saleItems.length === 0 ? (
            <div className="empty-state">
              <div className="icon">☕</div>
              No items available.<br />
              Add items in Master Control, or enter today's purchase for stock-controlled items.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', maxWidth: 800, margin: '0 auto' }}>
              {saleItems.map(item => {
                const hasStockLimit = item.remaining_qty !== null && item.remaining_qty !== undefined;
                return (
                  <button
                    key={item.id}
                    className="btn"
                    onClick={() => handleItemPress(item)}
                    style={{
                      width: 150, height: 100,
                      flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                      gap: 5,
                      background: item.item_type === 'group' ? 'var(--blue-dim)' : 'var(--accent-dim)',
                      color:      item.item_type === 'group' ? 'var(--blue)'     : 'var(--accent)',
                      border:    `1.5px solid ${item.item_type === 'group' ? 'var(--blue)' : 'var(--accent)'}`,
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow)',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
                      {item.name}
                    </span>
                    {item.item_type === 'direct' && (
                      <span style={{ fontSize: 13 }}>{fmt(item.price)}</span>
                    )}
                    {item.item_type === 'group' && (
                      <span style={{ fontSize: 11, opacity: 0.8 }}>▼ {(item.sub_items || []).length} items</span>
                    )}
                    {/* Show stock only if it's tracked */}
                    {hasStockLimit && (
                      <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                        Stock: {item.remaining_qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Cart FAB */}
      {cart.length > 0 && !showCart && (
        <div
          onClick={() => setShowCart(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28,
            background: 'var(--accent)', color: '#fff',
            borderRadius: 50, width: 72, height: 72,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 2, cursor: 'pointer',
            boxShadow: '0 6px 24px var(--accent-dim)',
            fontSize: 22, fontWeight: 700, zIndex: 200,
          }}
        >
          🛒
          <span style={{ fontSize: 11 }}>{fmt(cartTotal)}</span>
        </div>
      )}

      {qtyItem   && <QtyPopup item={qtyItem} onConfirm={handleQtyConfirm} onCancel={() => setQtyItem(null)} />}
      {groupItem && <GroupPopup group={groupItem} onSelect={handleSubSelect} onClose={() => setGroupItem(null)} />}
      {showCart  && <CartPopup cart={cart} onRemove={i => setCart(prev => prev.filter((_, idx) => idx !== i))} onSave={handleSaveAndPrint} onAddMore={() => setShowCart(false)} onClose={() => setShowCart(false)} />}
      {showBills && <ViewBillsModal onClose={() => setShowBills(false)} canDelete={isAdmin || can('kc_delete_bill')} />}
    </div>
  );
}