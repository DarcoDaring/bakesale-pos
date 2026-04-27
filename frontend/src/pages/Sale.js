import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  searchProducts, getProductByBarcode, createBill,
  getBills, getBill, editBillPayment, deleteBill,
  getInternalMasters, createInternalSaleBill,
  getDirectMasters, createDirectSale, getDirectSaleReport,
  createItemReturn, getBillsWithProduct,
} from '../services/api';
import PrintBill from '../components/PrintBill';
import { usePermissions } from '../context/PermissionContext';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const payColor = {
  cash: 'badge-green', card: 'badge-blue', upi: 'badge-purple',
  cash_card: 'badge-yellow', cash_upi: 'badge-yellow',
};
const payLabel = {
  cash: '💵 Cash', card: '💳 Card', upi: '📱 UPI',
  cash_card: '💵+💳 Cash & Card', cash_upi: '💵+📱 Cash & UPI',
};

const freshSearch  = (q)       => searchProducts(q,       { _t: Date.now() });
const freshBarcode = (barcode) => getProductByBarcode(barcode, { _t: Date.now() });

// ─────────────────────────────────────────────────────────────────────────────
// SearchBar
// ─────────────────────────────────────────────────────────────────────────────
function SearchBar({ onAdd, focusTrigger = 0 }) {
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [pendingProd, setPendingProd] = useState(null);
  const [pendingQty,  setPendingQty]  = useState('');
  const inputRef    = useRef();
  const qtyRef      = useRef();
  const debounceRef = useRef();
  const resultsRef  = useRef([]);
  resultsRef.current = results;
  const dropdownRef = useRef();

  useEffect(() => {
    const container = dropdownRef.current;
    if (!container) return;
    const items = container.querySelectorAll('tbody tr');
    const el = items[highlighted];
    if (!el) return;
    const offset = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTop = offset;
  }, [highlighted]);

  useEffect(() => {
    if (focusTrigger > 0) inputRef.current?.focus();
  }, [focusTrigger]);

  const doSearch = useCallback(async q => {
    if (!q.trim()) { setResults([]); setHighlighted(-1); return; }
    setSearching(true);
    try {
      const { data } = await freshSearch(q);
      const inStock = data.filter(p => parseFloat(p.stock_quantity) > 0);
      setResults(inStock); setHighlighted(-1);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const handleChange = e => {
    const v = e.target.value; setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const stageProd = useCallback(p => {
    const stock = parseFloat(p.stock_quantity);
    if (stock <= 0) { toast.error(`${p.name} is OUT OF STOCK`); return; }
    setResults([]); setQuery(''); setHighlighted(-1);
    clearTimeout(debounceRef.current);
    setPendingProd(p);
    setPendingQty('');
    setTimeout(() => qtyRef.current?.focus(), 50);
  }, []);

  const confirmAdd = useCallback(() => {
    if (!pendingProd) return;
    const q = parseFloat(pendingQty);
    if (!q || q <= 0) { toast.error('Enter a valid quantity'); return; }
    if (q > parseFloat(pendingProd.stock_quantity)) { toast.error('Not enough stock'); return; }
    onAdd(pendingProd, q);
    setPendingProd(null);
    setPendingQty('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [pendingProd, pendingQty, onAdd]);

  const handleKeyDown = async e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape') {
      setResults([]); setQuery(''); setHighlighted(-1);
      setPendingProd(null); setPendingQty('');
      clearTimeout(debounceRef.current); return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); clearTimeout(debounceRef.current);
      if (highlighted >= 0 && highlighted < cur.length) { stageProd(cur[highlighted]); return; }
      if (cur.length === 1) { stageProd(cur[0]); return; }
      if (cur.length > 1)   { stageProd(cur[0]); return; }
      const q = query.trim(); if (!q) return;
      try {
        const { data } = await freshBarcode(q);
        const rows = Array.isArray(data) ? data : [data];
        const inStock = rows.filter(p => parseFloat(p.stock_quantity) > 0);
        if (inStock.length > 0) stageProd(inStock[0]);
        else toast.error('Product not found or out of stock');
      } catch { toast.error('Product not found'); }
    }
  };

  const handleQtyKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); }
    if (e.key === 'Escape') { setPendingProd(null); setPendingQty(''); setTimeout(() => inputRef.current?.focus(), 50); }
  };

  return (
    <div>
      {pendingProd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '10px 16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{pendingProd.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {fmt(pendingProd.selling_price)} · Stock: {parseFloat(pendingProd.stock_quantity).toFixed(pendingProd.selling_unit === 'kg' ? 3 : 0)} {pendingProd.selling_unit}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Qty:</label>
            <input ref={qtyRef} type="number" value={pendingQty}
              onChange={e => setPendingQty(e.target.value)}
              onKeyDown={handleQtyKey}
              placeholder="0"
              style={{ width: 80, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '6px 8px' }}
              min="0.001" step={pendingProd.selling_unit === 'kg' ? '0.001' : '1'} />
            <button className="btn btn-primary btn-sm" onClick={confirmAdd} style={{ padding: '6px 16px' }}>
              ✓ Add
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setPendingProd(null); setPendingQty(''); setTimeout(() => inputRef.current?.focus(), 50); }}
              style={{ padding: '6px 10px' }}>✕</button>
          </div>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <input ref={inputRef} value={query} onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder="🔍  Scan barcode or type product name… (Enter → set qty → Enter again to add)"
          style={{ fontSize: 16, padding: '12px 16px' }} autoFocus={!pendingProd} />
        {searching && (
          <div style={{ position: 'absolute', right: 14, top: 14, color: 'var(--text3)', fontSize: 12 }}>searching…</div>
        )}
        {results.length > 0 && (
          <div ref={dropdownRef} style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', marginTop: 4, maxHeight: 260, overflowY: 'auto', boxShadow: 'var(--shadow)',
          }}>
            <table>
              <thead><tr><th>Barcode</th><th>Product</th><th>Price</th><th>Stock</th></tr></thead>
              <tbody>
                {results.map((p, i) => (
                  <tr key={`${p.id}-${p.batch_id || i}`} onClick={() => stageProd(p)}
                    style={{ cursor: 'pointer', background: highlighted === i ? 'var(--accent-dim)' : undefined }}
                    onMouseEnter={() => setHighlighted(i)} onMouseLeave={() => setHighlighted(-1)}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.barcode}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.multi_batch && <div style={{ fontSize: 11, color: 'var(--accent)' }}>MRP: ₹{p.batch_mrp}</div>}
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>₹{parseFloat(p.selling_price).toFixed(2)}</td>
                    <td>
                      <span className="badge badge-green">{parseFloat(p.stock_quantity).toFixed(p.selling_unit === 'kg' ? 3 : 0)} {p.selling_unit || 'nos'}</span>
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BillTable
// ─────────────────────────────────────────────────────────────────────────────
function BillTable({ items, onQtyChange, onRemove }) {
  if (!items.length) return (
    <div className="empty-state" style={{ padding: '60px 0' }}>
      <div className="icon">🛒</div>
      <div>No items added. Scan or search a product above.</div>
    </div>
  );
  return (
    <table>
      <thead>
        <tr><th>#</th><th>Product</th><th>Price</th><th>Qty / Weight</th><th>Subtotal</th><th></th></tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={item._key || item.id}>
            <td style={{ color: 'var(--text3)' }}>{i + 1}</td>
            <td>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{item.barcode}</div>
              <div style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 6 }}>
                <span className={`badge ${item.selling_unit === 'kg' ? 'badge-blue' : item.selling_unit === 'case' ? 'badge-purple' : 'badge-orange'}`}>per {item.selling_unit}</span>
                <span style={{ color: 'var(--text3)' }}>stock: {parseFloat(item.stock).toFixed(item.selling_unit === 'kg' ? 3 : 0)} {item.selling_unit}</span>
              </div>
            </td>
            <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(item.price)}</td>
            <td>
              {item.selling_unit === 'kg' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="text" inputMode="decimal" value={item.qty}
                    onChange={e => onQtyChange(item._key, e.target.value, true)}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (!v || v <= 0) onQtyChange(item._key, '1', true);
                      else if (v > item.stock) { toast.error('Not enough stock'); onQtyChange(item._key, String(item.stock), true); }
                      else onQtyChange(item._key, String(v), true);
                    }}
                    style={{ width: 90, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, padding: '4px 8px' }} />
                  <span style={{ color: 'var(--text3)', fontSize: 13 }}>kg</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => onQtyChange(item._key, -1)} style={{ padding: '2px 8px' }}>−</button>
                  <span style={{ fontFamily: 'var(--mono)', minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{item.qty}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => onQtyChange(item._key, 1)} style={{ padding: '2px 8px' }}>+</button>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>{item.selling_unit}</span>
                </div>
              )}
            </td>
            <td style={{ fontWeight: 700 }}>{fmt(item.price * (parseFloat(item.qty) || 0))}</td>
            <td><button className="btn btn-danger btn-sm" onClick={() => onRemove(item._key)}>✕</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentModal
// ─────────────────────────────────────────────────────────────────────────────
function PaymentModal({ total, onClose, onConfirm }) {
  const [cashAmt, setCashAmt]       = useState('');
  const [creditAmt, setCreditAmt]   = useState('');
  const [creditType, setCreditType] = useState('card');
  const handleCashChange   = e => { const c = e.target.value; setCashAmt(c);   const rem = total - (parseFloat(c)||0); setCreditAmt(rem > 0 ? rem.toFixed(2) : '0.00'); };
  const handleCreditChange = e => { const k = e.target.value; setCreditAmt(k); const rem = total - (parseFloat(k)||0); setCashAmt(rem > 0 ? rem.toFixed(2) : '0.00'); };
  const cashVal = parseFloat(cashAmt)||0, creditVal = parseFloat(creditAmt)||0;
  const splitOk = Math.abs(cashVal + creditVal - total) < 0.01;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>💳 Select Payment Method</h2>
        <p style={{ color: 'var(--text3)', marginBottom: 20 }}>Total: <strong style={{ color: 'var(--accent)', fontSize: 20 }}>{fmt(total)}</strong></p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[{ label: '💵 Cash', type: 'cash', rgb: '34,197,94', color: 'var(--green)' }, { label: '💳 Card', type: 'card', rgb: '59,130,246', color: 'var(--blue)' }, { label: '📱 UPI', type: 'upi', rgb: '168,85,247', color: 'var(--purple)' }].map(p => (
            <button key={p.type} onClick={() => onConfirm(p.type, p.type==='cash'?total:0, p.type==='card'?total:0, p.type==='upi'?total:0)}
              className="btn" style={{ background: `rgba(${p.rgb},0.15)`, color: p.color, border: `1px solid ${p.color}`, justifyContent: 'center', padding: 16, fontSize: 15 }}>{p.label}</button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14 }}>Cash + Credit Split</p>
          <div className="form-group">
            <label>Credit Method</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[{ v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
                <button key={t.v} onClick={() => setCreditType(t.v)} className="btn" style={{ flex: 1, justifyContent: 'center', padding: '9px', background: creditType === t.v ? 'rgba(255,255,255,0.08)' : 'var(--bg3)', color: t.color, border: `1px solid ${creditType === t.v ? t.color : 'var(--border)'}` }}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}><label>💵 Cash Amount (₹)</label><input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" /></div>
            <div className="form-group" style={{ margin: 0 }}><label>{creditType === 'card' ? '💳 Card Amount (₹)' : '📱 UPI Amount (₹)'}</label><input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" /></div>
          </div>
          {(cashAmt !== '' || creditAmt !== '') && (
            <div style={{ fontSize: 12, marginBottom: 14, padding: '8px 12px', borderRadius: 'var(--radius)', background: splitOk ? 'var(--green-dim)' : 'var(--red-dim)', color: splitOk ? 'var(--green)' : 'var(--red)' }}>
              {splitOk ? '✓ Amounts match total' : `Remaining: ${fmt(total - cashVal - creditVal)}`}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { if (!splitOk) { toast.error(`Amounts must sum to ${fmt(total)}`); return; } onConfirm(creditType === 'card' ? 'cash_card' : 'cash_upi', cashVal, creditType === 'card' ? creditVal : 0, creditType === 'upi' ? creditVal : 0); }}>
            Confirm Split Payment
          </button>
        </div>
        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditPaymentModal
// ─────────────────────────────────────────────────────────────────────────────
function EditPaymentModal({ bill, onClose, onSaved }) {
  const total = parseFloat(bill.total_amount);
  const isBillSplit = bill.payment_type === 'cash_card' || bill.payment_type === 'cash_upi';
  const [mode, setMode]             = useState(isBillSplit ? 'split' : 'single');
  const [singleType, setSingleType] = useState(isBillSplit ? 'cash' : bill.payment_type);
  const [creditType, setCreditType] = useState(bill.payment_type === 'cash_upi' ? 'upi' : 'card');
  const [cashAmt, setCashAmt]       = useState(isBillSplit ? String(bill.cash_amount) : '');
  const [creditAmt, setCreditAmt]   = useState(isBillSplit ? String(bill.payment_type === 'cash_upi' ? bill.upi_amount : bill.card_amount) : '');
  const [loading, setLoading]       = useState(false);
  const handleCashChange   = e => { const c = e.target.value; setCashAmt(c);   setCreditAmt((total-(parseFloat(c)||0)) > 0 ? (total-(parseFloat(c)||0)).toFixed(2) : '0.00'); };
  const handleCreditChange = e => { const k = e.target.value; setCreditAmt(k); setCashAmt((total-(parseFloat(k)||0)) > 0 ? (total-(parseFloat(k)||0)).toFixed(2) : '0.00'); };
  const cashVal = parseFloat(cashAmt)||0, creditVal = parseFloat(creditAmt)||0;
  const splitOk = Math.abs(cashVal + creditVal - total) < 0.01;
  const handleSave = async () => {
    let payment_type, cash_amount, card_amount, upi_amount;
    if (mode === 'single') { payment_type = singleType; cash_amount = singleType==='cash'?total:0; card_amount = singleType==='card'?total:0; upi_amount = singleType==='upi'?total:0; }
    else { if (!splitOk) { toast.error(`Amounts must sum to ${fmt(total)}`); return; } payment_type = creditType==='card'?'cash_card':'cash_upi'; cash_amount = cashVal; card_amount = creditType==='card'?creditVal:0; upi_amount = creditType==='upi'?creditVal:0; }
    setLoading(true);
    try { await editBillPayment(bill.id, { payment_type, cash_amount, card_amount, upi_amount }); toast.success('Payment updated'); onSaved(); onClose(); }
    catch { toast.error('Failed to update payment'); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay"><div className="modal">
      <h2>✏️ Edit Payment Mode</h2>
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{bill.bill_number}</div>
        <div style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800 }}>{fmt(total)}</div>
      </div>
      <div className="form-group">
        <label>Payment Mode</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {[{ v: 'single', label: 'Full Payment' }, { v: 'split', label: '💵 Cash + Credit' }].map(m => (
            <button key={m.v} onClick={() => setMode(m.v)} className="btn" style={{ flex: 1, justifyContent: 'center', background: mode===m.v?'rgba(255,255,255,0.08)':'var(--bg3)', color: mode===m.v?'var(--accent)':'var(--text2)', border: `1px solid ${mode===m.v?'var(--accent)':'var(--border)'}` }}>{m.label}</button>
          ))}
        </div>
      </div>
      {mode === 'single' ? (
        <div className="form-group"><label>Payment Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
            {[{ v: 'cash', label: '💵 Cash', color: 'var(--green)' }, { v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
              <button key={t.v} onClick={() => setSingleType(t.v)} className="btn" style={{ justifyContent: 'center', padding: '10px', background: singleType===t.v?'rgba(255,255,255,0.08)':'var(--bg3)', color: t.color, border: `1px solid ${singleType===t.v?t.color:'var(--border)'}` }}>{t.label}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="form-group"><label>Credit Method</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[{ v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
                <button key={t.v} onClick={() => setCreditType(t.v)} className="btn" style={{ flex: 1, justifyContent: 'center', background: creditType===t.v?'rgba(255,255,255,0.08)':'var(--bg3)', color: t.color, border: `1px solid ${creditType===t.v?t.color:'var(--border)'}` }}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}><label>💵 Cash Amount</label><input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" /></div>
            <div className="form-group" style={{ margin: 0 }}><label>{creditType==='card'?'💳 Card':'📱 UPI'} Amount</label><input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" /></div>
          </div>
          {(cashAmt !== '' || creditAmt !== '') && (
            <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--radius)', background: splitOk?'var(--green-dim)':'var(--red-dim)', color: splitOk?'var(--green)':'var(--red)' }}>
              {splitOk ? '✓ Amounts match total' : `Remaining: ${fmt(total - cashVal - creditVal)}`}
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : '✓ Save Changes'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewBillsModal
// ─────────────────────────────────────────────────────────────────────────────
function ViewBillsModal({ onClose }) {
  const { isAdmin, can } = usePermissions();
  const [bills, setBills]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState('all');
  const [detailBill, setDetailBill]   = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [deleting, setDeleting]       = useState(null);

  const fetchBills = async () => {
    setLoading(true);
    try { const { data } = await getBills(); setBills(data); }
    catch { toast.error('Failed to load bills'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchBills(); }, []);

  const openBill = async b => {
    try { const { data } = await getBill(b.id); setDetailBill(data); }
    catch { toast.error('Failed to load bill details'); }
  };
  const handleDelete = async b => {
    if (!window.confirm(`Delete bill ${b.bill_number}?`)) return;
    setDeleting(b.id);
    try { await deleteBill(b.id); toast.success(`Bill ${b.bill_number} deleted`); fetchBills(); }
    catch { toast.error('Failed to delete bill'); } finally { setDeleting(null); }
  };

  if (detailBill)  return <PrintBill bill={detailBill} onClose={() => setDetailBill(null)} />;
  if (editingBill) return <EditPaymentModal bill={editingBill} onClose={() => setEditingBill(null)} onSaved={fetchBills} />;

  const filtered = bills
    .filter(b => b.bill_number.toLowerCase().includes(search.toLowerCase()))
    .filter(b => {
      if (filter === 'returned') return b.return_number;
      if (filter === 'sale')     return !b.return_number;
      return true;
    });

  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 960, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>📋 Bills</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by bill number…" style={{ flex: 1 }} autoFocus />
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'all', label: 'All' }, { k: 'sale', label: 'Sale Bills' }, { k: 'returned', label: '↩️ Returned' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)} className="btn btn-sm"
              style={{ background: filter===f.k?'var(--accent)':'var(--surface)', color: filter===f.k?'#fff':'var(--text2)', border: `1px solid ${filter===f.k?'var(--accent)':'var(--border)'}` }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <div style={{ overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Bill No</th><th>Date</th><th>Payment</th><th>Total</th>
                <th>Return No</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString()}</td>
                  <td><span className={`badge ${payColor[b.payment_type]||'badge-orange'}`}>{payLabel[b.payment_type]||b.payment_type}</span></td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_amount)}</td>
                  <td>
                    {b.return_number
                      ? <span className="badge badge-red" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.return_number}</span>
                      : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openBill(b)}>🖨️ View</button>
                    {(isAdmin || can('can_edit_bill')) && <button className="btn btn-secondary btn-sm" onClick={() => setEditingBill(b)} style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>✏️ Edit</button>}
                    {(isAdmin || can('can_delete_bill')) && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b)} disabled={deleting === b.id}>{deleting === b.id ? '…' : '🗑️'}</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state"><div className="icon">📄</div>{search ? `No bills matching "${search}"` : 'No bills'}</div>}
        </div>
      )}
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemReturnModal
// BUG FIXES:
//  1. Date filter: pass returnDate as date_to to loadBills → backend filters correctly
//  2. Payment: only customer_return lines count toward refund amount & payment UI
//     damaged/expired lines only adjust stock, no payment involved
//  3. F1 shortcut added to trigger handleConfirm
// ─────────────────────────────────────────────────────────────────────────────
function ItemReturnModal({ onClose }) {
  const [returnDate,  setReturnDate]  = useState(new Date().toISOString().split('T')[0]);
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [lines,       setLines]       = useState([]);
  const [billsModal,  setBillsModal]  = useState(null);
  const [payType,     setPayType]     = useState('cash');
  const [cashAmt,     setCashAmt]     = useState('');
  const [creditAmt,   setCreditAmt]   = useState('');
  const [creditType,  setCreditType]  = useState('card');
  const [loading,     setLoading]     = useState(false);
  const debounceRef   = useRef();
  const dateRef       = useRef();
  const searchRef     = useRef();
  const resultsRef    = useRef([]);
  resultsRef.current  = results;
  const dropdownRef   = useRef();

  useEffect(() => {
    const container = dropdownRef.current;
    if (!container) return;
    const items = container.querySelectorAll('[data-result-item]');
    const el = items[highlighted];
    if (!el) return;
    const offset = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTop = offset;
  }, [highlighted]);

  useEffect(() => {
    setTimeout(() => dateRef.current?.focus(), 80);
  }, []);

  // ── FIX 3: F1 shortcut for confirm ──────────────────────────────────────
  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape' && !billsModal) { e.preventDefault(); onClose(); }
      if (e.key === 'F1' && !billsModal) { e.preventDefault(); handleConfirm(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [billsModal, lines, payType, cashAmt, creditAmt, creditType]);

  // ── FIX 2: Only customer_return lines produce a refund payment ──────────
  const customerReturnLines = lines.filter(l => l.return_type === 'customer_return');
  const hasCustomerReturn   = customerReturnLines.length > 0;
  const customerReturnTotal = customerReturnLines.reduce((s, l) => s + l.price * l.qty, 0);

  const doSearch = async q => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await freshSearch(q);
      setResults(data);
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  const handleSearchChange = e => {
    const v = e.target.value; setQuery(v);
    setHighlighted(-1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const handleSearchKeyDown = async e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape')    { setResults([]); setQuery(''); setHighlighted(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceRef.current);
      if (highlighted >= 0 && highlighted < cur.length) { addProduct(cur[highlighted]); return; }
      if (cur.length > 0) { addProduct(cur[0]); return; }
      if (!query.trim()) return;
      try {
        const { data } = await freshBarcode(query.trim());
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length > 0) addProduct(rows[0]);
        else toast.error('Product not found');
      } catch { toast.error('Product not found'); }
    }
  };

  const addProduct = p => {
    setQuery(''); setResults([]); setHighlighted(-1);
    const newLine = {
      _key:             `${p.id}_${Date.now()}`,
      product_id:       p.id,
      product_name:     p.name,
      barcode:          p.barcode,
      price:            parseFloat(p.selling_price),
      qty:              1,
      return_type:      'customer_return',
      sale_bill:        null,
      sale_bill_number: null,
      also_damaged:     false,
    };
    setLines(prev => [...prev, newLine]);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const updateLine = (key, field, value) => {
    setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l));
  };
  const removeLine = key => setLines(prev => prev.filter(l => l._key !== key));

  // ── FIX 1: Pass returnDate as date_to so backend filters bills by date ──
  const loadBills = async (lineKey, productId, qty) => {
    try {
      const params = { product_id: productId, qty };
      if (returnDate) params.date_to = returnDate;
      const { data } = await getBillsWithProduct(params);
      if (data.length === 0) { toast('No bills found with this item and qty', { icon: 'ℹ️' }); return; }
      setBillsModal({ lineKey, bills: data });
    } catch { toast.error('Failed to load bills'); }
  };

  const selectBill = (lineKey, bill) => {
    setLines(prev => prev.map(l => l._key === lineKey ? { ...l, sale_bill: bill.bill_id, sale_bill_number: bill.bill_number } : l));
    setBillsModal(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleCashChange   = e => { const c = e.target.value; setCashAmt(c);   setCreditAmt((customerReturnTotal-(parseFloat(c)||0)) > 0 ? (customerReturnTotal-(parseFloat(c)||0)).toFixed(2) : '0.00'); };
  const handleCreditChange = e => { const k = e.target.value; setCreditAmt(k); setCashAmt((customerReturnTotal-(parseFloat(k)||0)) > 0 ? (customerReturnTotal-(parseFloat(k)||0)).toFixed(2) : '0.00'); };
  const cashVal  = parseFloat(cashAmt)   || 0;
  const creditVal= parseFloat(creditAmt) || 0;
  const splitOk  = Math.abs(cashVal + creditVal - customerReturnTotal) < 0.01;

  const handleConfirm = async () => {
    if (lines.length === 0) { toast.error('Add at least one item'); return; }
    for (const l of lines) {
      if (!l.qty || l.qty <= 0) { toast.error(`Enter valid qty for ${l.product_name}`); return; }
      // Only customer_return requires a bill selection
      if (l.return_type === 'customer_return' && !l.sale_bill) {
        toast.error(`Select a bill for customer return: ${l.product_name}`);
        return;
      }
    }

    // ── FIX 2: Payment amounts only apply to customer_return lines ──────────
    // damaged / expired lines have no payment — they only adjust stock.
    let payment_type = 'cash', cash_amount = 0, card_amount = 0, upi_amount = 0;
    if (hasCustomerReturn) {
      payment_type = payType;
      if (payType === 'cash')  cash_amount = customerReturnTotal;
      if (payType === 'card')  card_amount = customerReturnTotal;
      if (payType === 'upi')   upi_amount  = customerReturnTotal;
      if (payType === 'split') {
        if (!splitOk) { toast.error(`Amounts must sum to ${fmt(customerReturnTotal)}`); return; }
        payment_type = creditType === 'card' ? 'cash_card' : 'cash_upi';
        cash_amount  = cashVal;
        card_amount  = creditType === 'card' ? creditVal : 0;
        upi_amount   = creditType === 'upi'  ? creditVal : 0;
      }
    }
    // If there are ONLY damaged/expired lines (no customer_return at all),
    // send zero payment — no money changes hands.

    setLoading(true);
    try {
      const expandedLines = [];
      for (const l of lines) {
        expandedLines.push({
          product:     l.product_id,
          quantity:    l.qty,
          price:       l.price,
          return_type: l.return_type,
          sale_bill:   l.sale_bill || null,
        });
        // If customer_return AND also_damaged, add a second damaged line (stock only, no payment)
        if (l.return_type === 'customer_return' && l.also_damaged) {
          expandedLines.push({
            product:     l.product_id,
            quantity:    l.qty,
            price:       l.price,
            return_type: 'damaged',
            sale_bill:   null,
          });
        }
      }

      const payload = {
        lines: expandedLines,
        payment_type,
        cash_amount,
        card_amount,
        upi_amount,
      };
      const { data } = await createItemReturn(payload);
      toast.success(`Item Return ${data.return_number} processed!`);
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to process return'); }
    finally { setLoading(false); }
  };

  const Fkey = ({ k }) => (
    <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 4px', marginLeft: 5, fontFamily: 'monospace' }}>{k}</span>
  );

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 860, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>↩️ Item Return</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Date picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '10px 14px' }}>
          <label style={{ fontSize: 13, color: 'var(--text3)', whiteSpace: 'nowrap', fontWeight: 600 }}>📅 Return / Bill Date:</label>
          <input
            ref={dateRef}
            type="date"
            value={returnDate}
            onChange={e => setReturnDate(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); searchRef.current?.focus(); } }}
            style={{ width: 180, padding: '6px 10px', fontWeight: 600 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Bills on or before this date will be shown when finding the original sale</span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            ref={searchRef}
            value={query}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="🔍 Scan barcode or search product name… (↑↓ navigate, Enter select, Esc close)"
            style={{ fontSize: 14, padding: '10px 14px' }}
          />
          {searching && <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 12, color: 'var(--text3)' }}>searching…</div>}
          {results.length > 0 && (
            <div ref={dropdownRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
              {results.map((p, i) => (
                <div key={`${p.id}-${i}`} data-result-item='true' onClick={() => addProduct(p)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: highlighted === i ? 'var(--accent-dim)' : '' }}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseLeave={() => setHighlighted(-1)}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.barcode}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.selling_price)}</div>
                    <span className={`badge ${parseFloat(p.stock_quantity) <= 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 10 }}>
                      {parseFloat(p.stock_quantity) <= 0 ? 'Out of Stock' : `${parseFloat(p.stock_quantity)} ${p.selling_unit || 'nos'}`}
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ padding: '5px 12px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
                ↑↓ Navigate · Enter Select · Esc Close
              </div>
            </div>
          )}
        </div>

        {/* Lines table */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
          {lines.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}><div className="icon">↩️</div>Set date above, then search and add items to return</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th><th>Price</th><th>Qty</th><th>Return Type</th>
                  <th>⚠️ Also Damaged?</th>
                  <th>Bill</th><th>Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l._key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.product_name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{l.barcode}</div>
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(l.price)}</td>
                    <td>
                      <input type="number" value={l.qty} min="0.001" step="1"
                        onChange={e => updateLine(l._key, 'qty', parseFloat(e.target.value) || 1)}
                        style={{ width: 70, textAlign: 'center', fontWeight: 700, padding: '4px 6px' }} />
                    </td>
                    <td>
                      <select value={l.return_type} onChange={e => {
                        updateLine(l._key, 'return_type', e.target.value);
                        if (e.target.value !== 'customer_return') {
                          updateLine(l._key, 'also_damaged', false);
                          updateLine(l._key, 'sale_bill', null);
                          updateLine(l._key, 'sale_bill_number', null);
                        }
                      }}
                        style={{ fontSize: 12, padding: '4px 6px' }}>
                        <option value="customer_return">👤 Customer Return</option>
                        <option value="damaged">⚠️ Damaged</option>
                        <option value="expired">🗑️ Expired</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {l.return_type === 'customer_return' ? (
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={l.also_damaged}
                            onChange={e => updateLine(l._key, 'also_damaged', e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--yellow)' }}
                          />
                          <span style={{ fontSize: 11, color: l.also_damaged ? 'var(--yellow)' : 'var(--text3)', fontWeight: l.also_damaged ? 700 : 400 }}>
                            Damaged
                          </span>
                        </label>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {l.return_type === 'customer_return' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {l.sale_bill_number && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>{l.sale_bill_number}</span>
                          )}
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => loadBills(l._key, l.product_id, l.qty)}>
                            🔍 Find Bill
                          </button>
                        </div>
                      ) : (
                        // FIX 2: damaged/expired shows clearly that no refund applies
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>No refund</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {l.return_type === 'customer_return'
                        ? fmt(l.price * l.qty)
                        : <span style={{ color: 'var(--text3)', fontSize: 12 }}>Stock only</span>
                      }
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(l._key)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {lines.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>

            {/* ── FIX 2: Show payment section ONLY when there are customer_return lines ── */}
            {hasCustomerReturn && (
              <>
                {/* Info box if there are also damaged/expired lines */}
                {lines.some(l => l.return_type !== 'customer_return') && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--radius)',
                    background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)' }}>
                    ℹ️ Damaged / expired items only adjust stock — no refund for those lines.
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ color: 'var(--text3)', marginRight: 12 }}>Refund Total (customer returns only):</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(customerReturnTotal)}</span>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>Refund Payment Method:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { v: 'cash',  label: '💵 Cash',    color: 'var(--green)'  },
                      { v: 'card',  label: '💳 Card',    color: 'var(--blue)'   },
                      { v: 'upi',   label: '📱 UPI',     color: 'var(--purple)' },
                      { v: 'split', label: '💵+💳 Split', color: 'var(--yellow)' },
                    ].map(p => (
                      <button key={p.v} onClick={() => setPayType(p.v)} className="btn"
                        style={{ flex: 1, justifyContent: 'center', fontSize: 12, padding: '8px 4px',
                          background: payType===p.v ? 'rgba(255,255,255,0.1)' : 'var(--bg3)',
                          color: p.color, border: `1px solid ${payType===p.v ? p.color : 'var(--border)'}` }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {payType === 'split' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: 12 }}>💵 Cash</label>
                        <input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: 12 }}>
                          <select value={creditType} onChange={e => setCreditType(e.target.value)}
                            style={{ border: 'none', background: 'none', color: 'var(--text2)', fontSize: 12, padding: 0 }}>
                            <option value="card">💳 Card</option>
                            <option value="upi">📱 UPI</option>
                          </select>
                        </label>
                        <input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" />
                      </div>
                      {(cashAmt || creditAmt) && (
                        <div style={{ fontSize: 11, color: splitOk ? 'var(--green)' : 'var(--red)', alignSelf: 'flex-end', paddingBottom: 8 }}>
                          {splitOk ? '✓ OK' : `Diff: ${fmt(customerReturnTotal - cashVal - creditVal)}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* If ONLY damaged/expired lines (no customer return), show info */}
            {!hasCustomerReturn && lines.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--radius)',
                background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)' }}>
                ℹ️ All items are damaged / expired — stock will be adjusted. No refund payment required.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleConfirm} disabled={loading}>
                {loading ? 'Processing…' : (
                  <>
                    ✓ Confirm Return{hasCustomerReturn ? ` — ${fmt(customerReturnTotal)}` : ''}
                    <Fkey k="F1" />
                  </>
                )}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Bill selector modal */}
      {billsModal && (
        <div className="modal-overlay" style={{ zIndex: 400 }}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h3>Select Bill for Return</h3>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>
              Bills containing this product with sufficient quantity{returnDate ? ` on or before ${returnDate}` : ''}:
            </p>
            <table>
              <thead><tr><th>Bill No</th><th>Date</th><th>Item Qty</th><th>Payment</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {billsModal.bills.map(b => (
                  <tr key={b.bill_id}>
                    <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.bill_date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 700 }}>{b.item_qty}</td>
                    <td><span className={`badge ${payColor[b.payment_type]||'badge-orange'}`}>{payLabel[b.payment_type]||b.payment_type}</span></td>
                    <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(b.bill_total)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => selectBill(billsModal.lineKey, b)}
                        onKeyDown={e => { if (e.key === 'Escape') setBillsModal(null); }}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setBillsModal(null)}>Cancel (Esc)</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InternalSaleModal
// ─────────────────────────────────────────────────────────────────────────────
function InternalSaleModal({ onClose }) {
  const [masters,  setMasters]  = useState([]);
  const [destId,   setDestId]   = useState('');
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [lines,    setLines]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [pendingProd, setPendingProd] = useState(null);
  const [pendingQty,  setPendingQty]  = useState('');
  const debounceRef = useRef();
  const destRef = useRef();
  const searchRef = useRef();
  const qtyRef = useRef();
  const [highlighted, setHighlighted] = useState(0);
  const resultsRef = useRef([]);
  resultsRef.current = results;
  const listRef = useRef();

  useEffect(() => {
    if (!listRef.current) return;
    const container = listRef.current;
    const items = container.children;
    if (!items || highlighted < 0 || highlighted >= items.length) return;
    const el = items[highlighted];
    if (!el) return;
    const offset = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTop = offset;
  }, [highlighted]);

  useEffect(() => {
    getInternalMasters().then(r => setMasters(r.data.filter(m => m.is_active)));
    setTimeout(() => destRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'F1') { e.preventDefault(); handleConfirm(); }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [destId, lines]);

  const doSearch = async q => {
    if (!q.trim()) { setResults([]); return; }
    try {
      const { data } = await freshSearch(q);
      const inStock = data.filter(p => parseFloat(p.stock_quantity) > 0);
      setResults(inStock);
      setHighlighted(0);
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = 0; }, 0);
    } catch { setResults([]); }
  };
  const handleSearchChange = e => { const v = e.target.value; setQuery(v); clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => doSearch(v), 300); };

  const stageProduct = p => {
    setQuery(''); setResults([]);
    const stock = parseFloat(p.stock_quantity);
    if (stock <= 0) { toast.error(`${p.name} is out of stock`); return; }
    setPendingProd(p);
    setPendingQty('');
    setTimeout(() => { if (qtyRef.current) { qtyRef.current.focus(); qtyRef.current.select(); } }, 50);
  };

  const confirmAddInternal = () => {
    if (!pendingProd) return;
    const q = parseFloat(pendingQty);
    if (!q || q <= 0) { toast.error('Enter a valid quantity'); return; }
    const stock = parseFloat(pendingProd.stock_quantity);
    if (q > stock) { toast.error('Not enough stock'); return; }
    setLines(prev => {
      const exists = prev.find(l => l.product_id === pendingProd.id);
      if (exists) {
        const newQty = parseFloat(exists.qty) + q;
        if (newQty > stock) { toast.error('Not enough stock'); return prev; }
        return prev.map(l => l.product_id === pendingProd.id ? { ...l, qty: newQty } : l);
      }
      return [...prev, { _key: `${pendingProd.id}_${Date.now()}`, product_id: pendingProd.id, product_name: pendingProd.name, barcode: pendingProd.barcode, price: parseFloat(pendingProd.selling_price), qty: q, stock, selling_unit: pendingProd.selling_unit || 'nos' }];
    });
    setPendingProd(null);
    setPendingQty('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleScanKey = async e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape') { setResults([]); setQuery(''); setHighlighted(0); return; }
    if (e.key !== 'Enter' || !query.trim()) return;
    e.preventDefault();
    clearTimeout(debounceRef.current);
    if (cur.length > 0) { stageProduct(cur[highlighted] ?? cur[0]); return; }
    try {
      const { data } = await freshBarcode(query.trim());
      const rows = Array.isArray(data) ? data : [data];
      const inStock = rows.filter(p => parseFloat(p.stock_quantity) > 0);
      if (inStock.length > 0) stageProduct(inStock[0]);
      else toast.error('Product not found or out of stock');
    } catch { toast.error('Product not found'); }
  };

  const updateLine = (key, field, val) => setLines(prev => prev.map(l => l._key===key?{...l,[field]:val}:l));
  const removeLine = key => setLines(prev => prev.filter(l => l._key !== key));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  const handleConfirm = async () => {
    if (!destId) { toast.error('Select a destination'); return; }
    if (lines.length === 0) { toast.error('Add at least one item'); return; }
    for (const l of lines) { if (l.qty > l.stock) { toast.error(`Not enough stock for ${l.product_name}`); return; } }
    setLoading(true);
    try {
      const { data } = await createInternalSaleBill({ destination: parseInt(destId), items: lines.map(l => ({ product: l.product_id, quantity: l.qty, price: l.price })) });
      toast.success(`Internal Sale ${data.sale_number} recorded!`);
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to record internal sale'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>🏭 Internal Sale</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <div className="form-group">
        <label>Destination</label>
        <select ref={destRef} value={destId} onChange={e => setDestId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && destId) { e.preventDefault(); searchRef.current?.focus(); } }}>
          <option value="">— Select destination —</option>
          {masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {pendingProd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: '10px 16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{pendingProd.product_name || pendingProd.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {fmt(pendingProd.selling_price)} · Stock: {parseFloat(pendingProd.stock_quantity).toFixed(2)} {pendingProd.selling_unit}
            </div>
          </div>
          <label style={{ fontSize: 13, color: 'var(--text3)' }}>Qty:</label>
          <input ref={qtyRef} type="number" value={pendingQty}
            onChange={e => setPendingQty(e.target.value)}
            placeholder="0"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirmAddInternal(); }
              if (e.key === 'Escape') { setPendingProd(null); setPendingQty(''); setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 50); }
            }}
            style={{ width: 80, textAlign: 'center', fontWeight: 700, fontSize: 16, padding: '6px 8px' }}
            min="0.001" step={pendingProd.selling_unit === 'kg' ? '0.001' : '1'} />
          <button className="btn btn-primary btn-sm" onClick={confirmAddInternal} style={{ padding: '6px 14px' }}>✓ Add</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setPendingProd(null); setPendingQty(''); setTimeout(() => { if (searchRef.current) { searchRef.current.focus(); searchRef.current.select(); } }, 50); }} style={{ padding: '6px 10px' }}>✕</button>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input ref={searchRef} value={query} onChange={handleSearchChange} onKeyDown={handleScanKey}
          placeholder="🔍 Scan barcode or search product… (Enter to select, then enter qty)" style={{ fontSize: 14, padding: '10px 14px' }} />
        {results.length > 0 && (
          <div ref={listRef} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)', paddingBottom: 30 }}>
            {results.map((p, i) => (
              <div key={`${p.id}-${i}`} onClick={() => stageProduct(p)} onMouseEnter={() => setHighlighted(i)}
                style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: highlighted === i ? 'var(--accent-dim)' : '', marginBottom: i === results.length - 1 ? 8 : 0 }}>
                <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.barcode}</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.selling_price)}</div>
                  <span className="badge badge-green" style={{ fontSize: 10 }}>{parseFloat(p.stock_quantity).toFixed(2)} {p.selling_unit || 'nos'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {lines.length === 0 ? <div className="empty-state" style={{ padding: '20px 0' }}><div className="icon">🏭</div>Add items above</div> : (
          <table>
            <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={l._key}>
                  <td><div style={{ fontWeight: 600 }}>{l.product_name}</div><div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{l.barcode}</div></td>
                  <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(l.price)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => updateLine(l._key, 'qty', Math.max(1, l.qty-1))} style={{ padding: '2px 8px' }}>−</button>
                      <input type="number" value={l.qty} min="0.001" onChange={e => updateLine(l._key, 'qty', parseFloat(e.target.value)||1)} style={{ width: 70, textAlign: 'center', fontWeight: 700, padding: '4px 6px' }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => { if(l.qty+1>l.stock){toast.error('Not enough stock');return;} updateLine(l._key,'qty',l.qty+1); }} style={{ padding: '2px 8px' }}>+</button>
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>{l.selling_unit}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmt(l.price * l.qty)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(l._key)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {lines.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <span style={{ color: 'var(--text3)', marginRight: 12 }}>Total:</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(total)}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleConfirm} disabled={loading || !destId}>
              {loading ? 'Saving…' : ' Confirm  (F1)'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DirectSaleModal
// ─────────────────────────────────────────────────────────────────────────────
function DirectSaleModal({ onClose }) {
  const [masters,    setMasters]    = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [price,      setPrice]      = useState('');
  const [payType,    setPayType]    = useState('cash');
  const [cashAmt,    setCashAmt]    = useState('');
  const [creditAmt,  setCreditAmt]  = useState('');
  const [creditType, setCreditType] = useState('card');
  const [loading,    setLoading]    = useState(false);

  const selectRef = useRef();
  const priceRef  = useRef();

  useEffect(() => {
    getDirectMasters().then(r => {
      const active = r.data.filter(m => m.is_active);
      setMasters(active);
      if (active.length > 0) setSelectedId(String(active[0].id));
    });
    setTimeout(() => selectRef.current?.focus(), 80);
  }, []);

  const total    = parseFloat(price) || 0;
  const cashVal  = parseFloat(cashAmt)   || 0;
  const creditVal= parseFloat(creditAmt) || 0;
  const splitOk  = Math.abs(cashVal + creditVal - total) < 0.01;

  const handleCashChange   = e => { const c=e.target.value; setCashAmt(c);   setCreditAmt((total-(parseFloat(c)||0))>0?(total-(parseFloat(c)||0)).toFixed(2):'0.00'); };
  const handleCreditChange = e => { const k=e.target.value; setCreditAmt(k); setCashAmt((total-(parseFloat(k)||0))>0?(total-(parseFloat(k)||0)).toFixed(2):'0.00'); };

  const doSave = async (pType, cAmt, cdAmt, uAmt) => {
    if (!selectedId) { toast.error('Select an item'); return; }
    if (!price || total <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await createDirectSale({ item: parseInt(selectedId), price: total, payment_type: pType, cash_amount: cAmt, card_amount: cdAmt, upi_amount: uAmt });
      toast.success('Direct sale recorded!');
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record direct sale'); }
    finally { setLoading(false); }
  };

  const handleConfirm = () => {
    if (payType === 'cash')  return doSave('cash',  total,  0,      0);
    if (payType === 'card')  return doSave('card',  0,      total,  0);
    if (payType === 'upi')   return doSave('upi',   0,      0,      total);
    if (payType === 'split') {
      if (!splitOk) { toast.error(`Amounts must sum to ${fmt(total)}`); return; }
      const pt = creditType === 'card' ? 'cash_card' : 'cash_upi';
      return doSave(pt, cashVal, creditType==='card'?creditVal:0, creditType==='upi'?creditVal:0);
    }
  };

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'F1') { e.preventDefault(); doSave('cash', total, 0, 0); return; }
      if (e.key === 'F2') { e.preventDefault(); doSave('card', 0, total, 0); return; }
      if (e.key === 'F3') { e.preventDefault(); doSave('upi',  0, 0, total); return; }
      if (e.key === 'F4') { e.preventDefault(); setPayType('split'); return; }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedId, price, total, cashVal, creditVal, creditType, splitOk]);

  const handleSelectKeyDown = e => {
    if (e.key === 'Enter' && selectedId) { e.preventDefault(); priceRef.current?.focus(); }
  };

  const Fkey = ({ k }) => (
    <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 4px', marginLeft: 5, fontFamily: 'monospace' }}>{k}</span>
  );

  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 480 }}>
      <h2>⚡ Direct Sale</h2>

      <div className="form-group">
        <label>Item</label>
        <select ref={selectRef} value={selectedId} onChange={e => setSelectedId(e.target.value)} onKeyDown={handleSelectKeyDown}>
          {masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>Amount (₹)</label>
        <input ref={priceRef} type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
      </div>

      {total > 0 && (
        <div style={{ background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--radius)', padding:'10px 16px', marginBottom:16, textAlign:'center', fontSize:18, fontWeight:700, fontFamily:'var(--mono)', color:'var(--accent)' }}>
          {fmt(total)}
        </div>
      )}

      <div className="form-group">
        <label>Payment</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
          {[
            { v: 'cash',  label: '💵 Cash',  fkey: 'F1', color: 'var(--green)'  },
            { v: 'card',  label: '💳 Card',  fkey: 'F2', color: 'var(--blue)'   },
            { v: 'upi',   label: '📱 UPI',   fkey: 'F3', color: 'var(--purple)' },
            { v: 'split', label: '💵+💳',    fkey: 'F4', color: 'var(--yellow)' },
          ].map(p => (
            <button key={p.v} className="btn"
              onClick={() => {
                if (p.v === 'cash')  { doSave('cash', total, 0, 0); return; }
                if (p.v === 'card')  { doSave('card', 0, total, 0); return; }
                if (p.v === 'upi')   { doSave('upi',  0, 0, total); return; }
                if (p.v === 'split') { setPayType('split'); }
              }}
              style={{
                justifyContent: 'center', flexDirection: 'column', padding: '10px 4px', gap: 2,
                background: payType === p.v ? 'rgba(255,255,255,0.1)' : 'var(--bg3)',
                color: p.color,
                border: `1px solid ${payType === p.v ? p.color : 'var(--border)'}`,
                fontSize: 12, fontWeight: 700,
              }}>
              {p.label}
              <Fkey k={p.fkey} />
            </button>
          ))}
        </div>

        {payType === 'split' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <label style={{ fontSize: 12 }}>💵 Cash (₹)</label>
                <input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <label style={{ fontSize: 12 }}>
                  <select value={creditType} onChange={e => setCreditType(e.target.value)} style={{ border: 'none', background: 'none', color: 'var(--text2)', fontSize: 12, padding: 0 }}>
                    <option value="card">💳 Card (₹)</option>
                    <option value="upi">📱 UPI (₹)</option>
                  </select>
                </label>
                <input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" />
              </div>
            </div>
            {(cashAmt || creditAmt) && (
              <div style={{ fontSize: 12, marginTop: 8, padding: '6px 10px', borderRadius: 'var(--radius)', background: splitOk ? 'var(--green-dim)' : 'var(--red-dim)', color: splitOk ? 'var(--green)' : 'var(--red)' }}>
                {splitOk ? '✓ Amounts match total' : `Remaining: ${fmt(total - cashVal - creditVal)}`}
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={handleConfirm} disabled={loading || !selectedId || !price}>
              {loading ? 'Saving…' : `✓ Confirm Split — ${fmt(total)}`}
            </button>
          </>
        )}
      </div>

      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={onClose}>Cancel</button>
    </div></div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Sale Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Sale() {
  const { isAdmin, can } = usePermissions();
  const [items,        setItems]        = useState([]);
  const [showPayment,  setShowPayment]  = useState(false);
  const [showBills,    setShowBills]    = useState(false);
  const [showReturn,   setShowReturn]   = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const [showDirect,   setShowDirect]   = useState(false);
  const [printBill,    setPrintBill]    = useState(null);
  const [searchFocus,  setSearchFocus]  = useState(0);

  const total = items.reduce((s, i) => s + i.price * (parseFloat(i.qty) || 0), 0);

  const clearItems = () => {
    setItems([]);
    setSearchFocus(f => f + 1);
  };

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') {
        if (showPayment)  { setShowPayment(false);  return; }
        if (showBills)    { setShowBills(false);    return; }
        if (showReturn)   { setShowReturn(false);   return; }
        if (showInternal) { setShowInternal(false); return; }
        if (showDirect)   { setShowDirect(false);   return; }
        if (printBill)    { setPrintBill(null);     return; }
      }
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (isTyping && !['F1','F2','F3','F4','F5','F6','F7','F8','F12','Escape'].includes(e.key)) return;
      if (showPayment || showBills || showReturn || showInternal || showDirect || printBill) return;
      if (e.key === 'F1')  { e.preventDefault(); if (items.length > 0) confirmPayment('cash', total, 0, 0); }
      if (e.key === 'F2')  { e.preventDefault(); if (items.length > 0) confirmPayment('card', 0, total, 0); }
      if (e.key === 'F3')  { e.preventDefault(); if (items.length > 0) confirmPayment('upi',  0, 0, total); }
      if (e.key === 'F4')  { e.preventDefault(); if (items.length > 0) setShowPayment(true); }
      if (e.key === 'F5')  { e.preventDefault(); setShowBills(true); }
      if (e.key === 'F6')  { e.preventDefault(); setShowDirect(true); }
      if (e.key === 'F7')  { e.preventDefault(); setShowInternal(true); }
      if (e.key === 'F8')  { e.preventDefault(); setShowReturn(true); }
      if (e.key === 'F12') { e.preventDefault(); clearItems(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [items, total, showPayment, showBills, showReturn, showInternal, showDirect, printBill]);

  const addItem = (p, qty = null) => {
    setItems(prev => {
      const key      = `${p.id}_${p.batch_id || 'nb'}`;
      const existing = prev.find(i => i._key === key);
      const stock    = parseFloat(p.stock_quantity);
      const unit     = p.selling_unit || 'nos';
      const addQty   = qty !== null ? qty : 1;
      if (existing) {
        const newQty = parseFloat(existing.qty) + addQty;
        if (newQty > stock) { toast.error('Not enough stock'); return prev; }
        return prev.map(i => i._key === key ? { ...i, qty: unit === 'kg' ? String(newQty) : newQty } : i);
      }
      return [...prev, {
        _key: key, id: p.id, batch_id: p.batch_id || null, batch_mrp: p.batch_mrp || null,
        multi_batch: p.multi_batch || false, name: p.name, barcode: p.barcode,
        price: parseFloat(p.selling_price), qty: unit === 'kg' ? String(addQty) : addQty, stock, selling_unit: unit,
      }];
    });
  };

  const changeQty = (key, deltaOrValue, directSet = false) => {
    setItems(prev => prev.map(i => {
      if (i._key !== key) return i;
      if (directSet) {
        const raw = deltaOrValue; const v = parseFloat(raw);
        if (!isNaN(v) && v > i.stock) { toast.error('Not enough stock'); return i; }
        return { ...i, qty: raw };
      }
      const newQty = i.qty + deltaOrValue;
      if (newQty < 1) return i;
      if (newQty > i.stock) { toast.error('Not enough stock'); return i; }
      return { ...i, qty: newQty };
    }));
  };

  const removeItem = key => setItems(prev => prev.filter(i => i._key !== key));

  const confirmPayment = async (payType, cashAmt, cardAmt, upiAmt) => {
    for (const item of items) {
      const qty = parseFloat(item.qty);
      if (!qty || qty <= 0) { toast.error(`Enter a valid quantity for ${item.name}`); return; }
    }
    setShowPayment(false);
    try {
      const payload = {
        total_amount: total, payment_type: payType,
        cash_amount:  cashAmt || (payType === 'cash' ? total : 0),
        card_amount:  cardAmt || (payType === 'card' ? total : 0),
        upi_amount:   upiAmt  || (payType === 'upi'  ? total : 0),
        items: items.map(i => ({ product: i.id, batch_id: i.batch_id || null, quantity: parseFloat(i.qty), price: i.price })),
      };
      const { data } = await createBill(payload);
      toast.success(`Bill ${data.bill_number} saved!`);
      setItems([]);
      setPrintBill(data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save bill'); }
  };

  if (printBill) return <PrintBill bill={printBill} onClose={() => setPrintBill(null)} />;

  const Fkey = ({ k }) => (
    <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'monospace' }}>{k}</span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 116px)' }}>

      <div className="page-header" style={{ flexShrink: 0 }}>
        <h1>🛒 Sale</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={clearItems}>🔄 Clear <Fkey k="F12" /></button>
          <button className="btn btn-secondary" onClick={() => setShowReturn(true)}>↩️ Item Return <Fkey k="F8" /></button>
          <button className="btn btn-secondary" onClick={() => setShowBills(true)}>📋 View Bills <Fkey k="F5" /></button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <SearchBar onAdd={addItem} focusTrigger={searchFocus} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <BillTable items={items} onQtyChange={changeQty} onRemove={removeItem} />
          </div>
          <div style={{ flexShrink: 0, borderTop: items.length > 0 ? '2px solid var(--accent)' : '1px solid var(--border)', background: 'var(--bg2)', padding: items.length > 0 ? '12px 16px' : '10px 16px' }}>
            {items.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ color: 'var(--text3)', fontSize: 14, marginRight: 12 }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 14, marginRight: 12 }}>TOTAL</span>
                  <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(total)}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { type: 'cash',  label: '💵 Cash',           fkey: 'F1', rgb: '34,197,94',  color: 'var(--green)' },
                    { type: 'card',  label: '💳 Card',           fkey: 'F2', rgb: '59,130,246', color: 'var(--blue)' },
                    { type: 'upi',   label: '📱 UPI',            fkey: 'F3', rgb: '168,85,247', color: 'var(--purple)' },
                    { type: 'split', label: '💵+💳 Cash+Credit', fkey: 'F4', rgb: '234,179,8',  color: 'var(--yellow)' },
                  ].map(p => (
                    <button key={p.type} onClick={() => { if (p.type === 'split') { setShowPayment(true); return; } confirmPayment(p.type, p.type==='cash'?total:0, p.type==='card'?total:0, p.type==='upi'?total:0); }}
                      className="btn" style={{ flex: 1, justifyContent: 'center', padding: '11px 8px', background: `rgba(${p.rgb},0.15)`, color: p.color, border: `1px solid ${p.color}`, fontSize: 14, fontWeight: 700 }}>
                      {p.label}
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '1px 5px', marginLeft: 8, fontFamily: 'monospace' }}>{p.fkey}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
                Add items to start a sale · F5 View Bills · F8 Item Return · F12 Clear
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, width: 150 }}>
          {(isAdmin || can('can_access_direct_sale')) && (
            <button className="btn btn-secondary" onClick={() => setShowDirect(true)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%', fontSize: 15, fontWeight: 700, color: 'var(--green)', borderColor: 'var(--green)', background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius)' }}>
              <span style={{ fontSize: 30 }}>⚡</span>
              Direct Sale
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.2)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', color: 'var(--green)' }}>F6</span>
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowInternal(true)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%', fontSize: 15, fontWeight: 700, color: 'var(--purple)', borderColor: 'var(--purple)', background: 'rgba(168,85,247,0.08)', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: 30 }}>🏭</span>
            Internal Sale
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(168,85,247,0.2)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', color: 'var(--purple)' }}>F7</span>
          </button>
        </div>

      </div>

      {showPayment  && <PaymentModal total={total} onClose={() => setShowPayment(false)} onConfirm={confirmPayment} />}
      {showBills    && <ViewBillsModal onClose={() => setShowBills(false)} />}
      {showReturn   && <ItemReturnModal onClose={() => setShowReturn(false)} />}
      {showInternal && <InternalSaleModal onClose={() => setShowInternal(false)} />}
      {showDirect   && <DirectSaleModal onClose={() => setShowDirect(false)} />}
    </div>
  );
}