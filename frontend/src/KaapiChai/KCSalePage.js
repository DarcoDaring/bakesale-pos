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
const editKCBillPayment = (id, d) => api.patch(`/kc-bills/${id}/edit_payment/`, d);

const PAY_LABEL = {
  cash: '💵 Cash', card: '💳 Card', upi: '📱 UPI',
  cash_card: '💵+💳 Cash & Card', cash_upi: '💵+📱 Cash & UPI',
};
const PAY_BADGE = {
  cash: 'badge-green', card: 'badge-blue', upi: 'badge-purple',
  cash_card: 'badge-yellow', cash_upi: 'badge-yellow',
};

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

// ── Payment Modal ──────────────────────────────────────────────────────────────
function PaymentModal({ total, onClose, onConfirm }) {
  const [cashAmt, setCashAmt]     = useState('');
  const [creditAmt, setCreditAmt] = useState('');
  const [creditType, setCreditType] = useState('card');

  const handleCashChange   = e => { const c = e.target.value; setCashAmt(c);   const rem = total - (parseFloat(c)||0); setCreditAmt(rem > 0 ? rem.toFixed(2) : '0.00'); };
  const handleCreditChange = e => { const k = e.target.value; setCreditAmt(k); const rem = total - (parseFloat(k)||0); setCashAmt(rem > 0 ? rem.toFixed(2) : '0.00'); };

  const cashVal   = parseFloat(cashAmt)   || 0;
  const creditVal = parseFloat(creditAmt) || 0;
  const splitOk   = Math.abs(cashVal + creditVal - total) < 0.01;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>💳 Payment Method</h2>
        <p style={{ color: 'var(--text3)', marginBottom: 20 }}>
          Total: <strong style={{ color: 'var(--accent)', fontSize: 20 }}>{fmt(total)}</strong>
        </p>

        {/* Single payment buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            { label: '💵 Cash',  type: 'cash', color: 'var(--green)' },
            { label: '💳 Card',  type: 'card', color: 'var(--blue)' },
            { label: '📱 UPI',   type: 'upi',  color: 'var(--purple)' },
          ].map(p => (
            <button key={p.type}
              className="btn"
              onClick={() => onConfirm(p.type, p.type==='cash'?total:0, p.type==='card'?total:0, p.type==='upi'?total:0)}
              style={{ background: `rgba(0,0,0,0.05)`, color: p.color, border: `1px solid ${p.color}`, justifyContent: 'center', padding: 16, fontSize: 15 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Split payment */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14 }}>
            Cash + Credit Split
          </p>
          <div className="form-group">
            <label>Credit Method</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[{ v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
                <button key={t.v} onClick={() => setCreditType(t.v)} className="btn"
                  style={{ flex: 1, justifyContent: 'center', padding: '9px', color: t.color,
                    background: creditType === t.v ? 'rgba(0,0,0,0.05)' : 'var(--bg3)',
                    border: `1px solid ${creditType === t.v ? t.color : 'var(--border)'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>💵 Cash Amount (₹)</label>
              <input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{creditType === 'card' ? '💳 Card' : '📱 UPI'} Amount (₹)</label>
              <input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" />
            </div>
          </div>
          {(cashAmt !== '' || creditAmt !== '') && (
            <div style={{ fontSize: 12, marginBottom: 14, padding: '8px 12px', borderRadius: 'var(--radius)',
              background: splitOk ? 'var(--green-dim)' : 'var(--red-dim)',
              color: splitOk ? 'var(--green)' : 'var(--red)' }}>
              {splitOk ? '✓ Amounts match total' : `Remaining: ${fmt(total - cashVal - creditVal)}`}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => {
              if (!splitOk) { toast.error(`Amounts must sum to ${fmt(total)}`); return; }
              onConfirm(
                creditType === 'card' ? 'cash_card' : 'cash_upi',
                cashVal,
                creditType === 'card' ? creditVal : 0,
                creditType === 'upi'  ? creditVal : 0,
              );
            }}>
            Confirm Split Payment
          </button>
        </div>

        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Edit Payment Modal ─────────────────────────────────────────────────────────
function EditPaymentModal({ bill, onClose, onSaved }) {
  const total       = parseFloat(bill.total);
  const isSplit     = bill.payment_type === 'cash_card' || bill.payment_type === 'cash_upi';
  const [mode, setMode]               = useState(isSplit ? 'split' : 'single');
  const [singleType, setSingleType]   = useState(isSplit ? 'cash' : (bill.payment_type || 'cash'));
  const [creditType, setCreditType]   = useState(bill.payment_type === 'cash_upi' ? 'upi' : 'card');
  const [cashAmt, setCashAmt]         = useState(isSplit ? String(bill.cash_amount || '') : '');
  const [creditAmt, setCreditAmt]     = useState(isSplit ? String(bill.payment_type === 'cash_upi' ? (bill.upi_amount||'') : (bill.card_amount||'')) : '');
  const [loading, setLoading]         = useState(false);

  const handleCashChange   = e => { const c = e.target.value; setCashAmt(c);   setCreditAmt((total-(parseFloat(c)||0)) > 0 ? (total-(parseFloat(c)||0)).toFixed(2) : '0.00'); };
  const handleCreditChange = e => { const k = e.target.value; setCreditAmt(k); setCashAmt((total-(parseFloat(k)||0)) > 0 ? (total-(parseFloat(k)||0)).toFixed(2) : '0.00'); };

  const cashVal   = parseFloat(cashAmt)   || 0;
  const creditVal = parseFloat(creditAmt) || 0;
  const splitOk   = Math.abs(cashVal + creditVal - total) < 0.01;

  const handleSave = async () => {
    let payment_type, cash_amount, card_amount, upi_amount;
    if (mode === 'single') {
      payment_type = singleType;
      cash_amount  = singleType === 'cash' ? total : 0;
      card_amount  = singleType === 'card' ? total : 0;
      upi_amount   = singleType === 'upi'  ? total : 0;
    } else {
      if (!splitOk) { toast.error(`Amounts must sum to ${fmt(total)}`); return; }
      payment_type = creditType === 'card' ? 'cash_card' : 'cash_upi';
      cash_amount  = cashVal;
      card_amount  = creditType === 'card' ? creditVal : 0;
      upi_amount   = creditType === 'upi'  ? creditVal : 0;
    }
    setLoading(true);
    try {
      await editKCBillPayment(bill.id, { payment_type, cash_amount, card_amount, upi_amount });
      toast.success('Payment updated');
      onSaved();
      onClose();
    } catch { toast.error('Failed to update payment'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>✏️ Edit Payment — {bill.bill_number}</h2>
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800 }}>{fmt(total)}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Current: <span className={`badge ${PAY_BADGE[bill.payment_type] || 'badge-orange'}`}>{PAY_LABEL[bill.payment_type] || bill.payment_type}</span>
          </div>
        </div>

        <div className="form-group">
          <label>Payment Mode</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {[{ v: 'single', label: 'Full Payment' }, { v: 'split', label: '💵 Split' }].map(m => (
              <button key={m.v} onClick={() => setMode(m.v)} className="btn"
                style={{ flex: 1, justifyContent: 'center',
                  background: mode === m.v ? 'var(--accent-dim)' : 'var(--bg3)',
                  color: mode === m.v ? 'var(--accent)' : 'var(--text2)',
                  border: `1px solid ${mode === m.v ? 'var(--accent)' : 'var(--border)'}` }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'single' ? (
          <div className="form-group">
            <label>Payment Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
              {[{ v: 'cash', label: '💵 Cash', color: 'var(--green)' }, { v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
                <button key={t.v} onClick={() => setSingleType(t.v)} className="btn"
                  style={{ justifyContent: 'center', padding: '10px', color: t.color,
                    background: singleType === t.v ? 'rgba(0,0,0,0.05)' : 'var(--bg3)',
                    border: `1px solid ${singleType === t.v ? t.color : 'var(--border)'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label>Credit Method</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {[{ v: 'card', label: '💳 Card', color: 'var(--blue)' }, { v: 'upi', label: '📱 UPI', color: 'var(--purple)' }].map(t => (
                  <button key={t.v} onClick={() => setCreditType(t.v)} className="btn"
                    style={{ flex: 1, justifyContent: 'center', color: t.color,
                      background: creditType === t.v ? 'rgba(0,0,0,0.05)' : 'var(--bg3)',
                      border: `1px solid ${creditType === t.v ? t.color : 'var(--border)'}` }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>💵 Cash Amount</label>
                <input type="number" value={cashAmt} onChange={handleCashChange} placeholder="0.00" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>{creditType === 'card' ? '💳 Card' : '📱 UPI'} Amount</label>
                <input type="number" value={creditAmt} onChange={handleCreditChange} placeholder="0.00" />
              </div>
            </div>
            {(cashAmt !== '' || creditAmt !== '') && (
              <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--radius)',
                background: splitOk ? 'var(--green-dim)' : 'var(--red-dim)',
                color: splitOk ? 'var(--green)' : 'var(--red)' }}>
                {splitOk ? '✓ Amounts match total' : `Remaining: ${fmt(total - cashVal - creditVal)}`}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : '✓ Save Changes'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
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
            <button key={si.id} className="btn btn-secondary" onClick={() => onSelect(si)}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '12px 14px', height: 'auto' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{si.name}</span>
              <span style={{ fontSize: 13, color: 'var(--accent)' }}>{fmt(si.price)}</span>
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
function CartPopup({ cart, onRemove, onSave, onAddMore, onClose, total }) {
  const [showPayment, setShowPayment] = useState(false);

  const handlePaymentConfirm = (payType, cashAmt, cardAmt, upiAmt) => {
    setShowPayment(false);
    onSave(payType, cashAmt, cardAmt, upiAmt);
  };

  return (
    <>
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
          {/* Payment buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[
              { type: 'cash', label: '💵 Cash',  color: 'var(--green)' },
              { type: 'card', label: '💳 Card',  color: 'var(--blue)' },
              { type: 'upi',  label: '📱 UPI',   color: 'var(--purple)' },
            ].map(p => (
              <button key={p.type} className="btn"
                onClick={() => onSave(p.type, p.type==='cash'?total:0, p.type==='card'?total:0, p.type==='upi'?total:0)}
                disabled={cart.length === 0}
                style={{ justifyContent: 'center', padding: '10px', color: p.color, border: `1px solid ${p.color}`, background: 'rgba(0,0,0,0.03)', fontSize: 14, fontWeight: 700 }}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={() => setShowPayment(true)} disabled={cart.length === 0}>
            💵+💳 Split Payment
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onAddMore}>+ Add More</button>
            <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>← Back</button>
          </div>
        </div>
      </div>
      {showPayment && (
        <PaymentModal total={total} onClose={() => setShowPayment(false)} onConfirm={handlePaymentConfirm} />
      )}
    </>
  );
}

// ── View Bills Modal ───────────────────────────────────────────────────────────
function ViewBillsModal({ onClose, canDelete }) {
  const [bills, setBills]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [editingBill, setEditingBill] = useState(null);

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

  if (editingBill) {
    return <EditPaymentModal bill={editingBill} onClose={() => setEditingBill(null)} onSaved={load} />;
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
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
                <tr>
                  <th>Bill No</th><th>Date</th><th>Payment</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${PAY_BADGE[b.payment_type] || 'badge-orange'}`}>
                        {PAY_LABEL[b.payment_type] || 'Cash'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => printBill(b, true)}>🖨️ Reprint</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingBill(b)}
                          style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>✏️ Edit</button>
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
  const { can }     = usePermissions();
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

  const handleItemPress = item => {
    if (item.item_type === 'group') setGroupItem(item);
    else setQtyItem(item);
  };

  const handleSubSelect = subItem => { setGroupItem(null); setQtyItem(subItem); };

  const handleQtyConfirm = qty => {
    const hasStockLimit = qtyItem.remaining_qty !== null && qtyItem.remaining_qty !== undefined;
    if (hasStockLimit) {
      const existing      = cart.find(i => i.id === qtyItem.id && i.name === qtyItem.name);
      const alreadyInCart = existing ? existing.qty : 0;
      const maxQty        = qtyItem.remaining_qty || 0;
      if (alreadyInCart + qty > maxQty) { toast.error(`Only ${maxQty - alreadyInCart} more available`); return; }
    }
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === qtyItem.id && i.name === qtyItem.name);
      if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], qty: u[idx].qty + qty }; return u; }
      return [...prev, { id: qtyItem.id, name: qtyItem.name, price: parseFloat(qtyItem.price), qty, remaining_qty: qtyItem.remaining_qty }];
    });
    setQtyItem(null);
    toast.success(`${qtyItem.name} × ${qty} added`);
  };

  const handleSaveAndPrint = async (payType = 'cash', cashAmt = 0, cardAmt = 0, upiAmt = 0) => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    try {
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const payload = {
        lines:        cart.map(i => ({ item_id: i.id, item_name: i.name, qty: i.qty, price: i.price })),
        total,
        payment_type: payType,
        cash_amount:  cashAmt  || (payType === 'cash' ? total : 0),
        card_amount:  cardAmt  || (payType === 'card' ? total : 0),
        upi_amount:   upiAmt   || (payType === 'upi'  ? total : 0),
      };
      const { data } = await createKCBill(payload);
      printBill(data);
      setCart([]);
      setShowCart(false);
      loadItems();
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
                  <button key={item.id} className="btn" onClick={() => handleItemPress(item)}
                    style={{
                      width: 150, height: 100,
                      flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 5,
                      background: item.item_type === 'group' ? 'var(--blue-dim)' : 'var(--accent-dim)',
                      color:      item.item_type === 'group' ? 'var(--blue)'     : 'var(--accent)',
                      border:    `1.5px solid ${item.item_type === 'group' ? 'var(--blue)' : 'var(--accent)'}`,
                      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
                    }}>
                    <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>{item.name}</span>
                    {item.item_type === 'direct' && <span style={{ fontSize: 13 }}>{fmt(item.price)}</span>}
                    {item.item_type === 'group'  && <span style={{ fontSize: 11, opacity: 0.8 }}>▼ {(item.sub_items || []).length} items</span>}
                    {hasStockLimit && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>Stock: {item.remaining_qty}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Cart FAB */}
      {cart.length > 0 && !showCart && (
        <div onClick={() => setShowCart(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28,
            background: 'var(--accent)', color: '#fff', borderRadius: 50,
            width: 72, height: 72, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 2, cursor: 'pointer', boxShadow: '0 6px 24px var(--accent-dim)',
            fontSize: 22, fontWeight: 700, zIndex: 200,
          }}>
          🛒
          <span style={{ fontSize: 11 }}>{fmt(cartTotal)}</span>
        </div>
      )}

      {qtyItem   && <QtyPopup item={qtyItem} onConfirm={handleQtyConfirm} onCancel={() => setQtyItem(null)} />}
      {groupItem && <GroupPopup group={groupItem} onSelect={handleSubSelect} onClose={() => setGroupItem(null)} />}
      {showCart  && (
        <CartPopup
          cart={cart}
          total={cartTotal}
          onRemove={i => setCart(prev => prev.filter((_, idx) => idx !== i))}
          onSave={handleSaveAndPrint}
          onAddMore={() => setShowCart(false)}
          onClose={() => setShowCart(false)}
        />
      )}
      {showBills && <ViewBillsModal onClose={() => setShowBills(false)} canDelete={isAdmin || can('kc_delete_bill')} />}
    </div>
  );
}