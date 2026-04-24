import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getSaleReport, getItemWiseReport,
  getInternalMasters,
  getPurchaseReturnReport, getPurchaseReport,
  getPurchaseBill, markPurchaseReturned,
  getSalesTaxReport, getPurchaseTaxReport, markPurchasePaid,
  getDirectSaleReport,
  getItemReturnReport, getInternalSaleBillReport,
} from '../services/api';
import { usePermissions } from '../context/PermissionContext';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const payLabel = { cash: 'Cash', card: 'Card', upi: 'UPI', cash_card: 'Cash & Card', cash_upi: 'Cash & UPI' };
const today = () => new Date().toISOString().split('T')[0];

// ─── Print Preview Modal ───────────────────────────────────────────────────────
function PrintPreviewModal({ html, title, onClose }) {
  const iframeRef = useRef();

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Toolbar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>🖨️ Print Preview — {title}</div>
        <button
          className="btn btn-primary"
          onClick={handlePrint}
          style={{ padding: '8px 24px', fontSize: 14 }}
        >
          🖨️ Print
        </button>
        <button className="btn btn-secondary" onClick={onClose}>✕ Close</button>
      </div>

      {/* Preview iframe */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#525659' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <iframe
            ref={iframeRef}
            srcDoc={`<!DOCTYPE html><html><head>
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; }
                @media print {
                  body { padding: 0; }
                  @page { margin: 15mm; size: A4; }
                }
              </style>
            </head><body>${html}</body></html>`}
            style={{
              width: '100%',
              minHeight: 800,
              border: 'none',
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
              display: 'block',
            }}
            onLoad={e => {
              // Auto-size iframe to content
              try {
                const doc = e.target.contentDocument;
                if (doc && doc.body) {
                  e.target.style.height = (doc.body.scrollHeight + 40) + 'px';
                }
              } catch {}
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PrintModal({ onClose, onPrint, title }) {
  const t = today();
  const [from, setFrom] = useState(t);
  const [to,   setTo]   = useState(t);
  const [loading, setLoading] = useState(false);
  const handlePrint = async () => {
    if (!from || !to || from > to) { alert('Invalid date range'); return; }
    setLoading(true);
    await onPrint(from, to);
    setLoading(false);
  };
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 380 }}>
      <h2>🖨️ {title}</h2>
      <div className="form-row">
        <div className="form-group" style={{ margin: 0 }}><label>From Date</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="form-group" style={{ margin: 0 }}><label>To Date</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePrint} disabled={loading}>{loading ? 'Preparing…' : '🖨️ Preview & Print'}</button>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div></div>
  );
}

function PurchaseBillDetailModal({ billId, onClose }) {
  const [bill, setBill]       = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPurchaseBill(billId).then(r => setBill(r.data)).catch(() => { alert('Failed to load bill'); onClose(); }).finally(() => setLoading(false));
  }, [billId]);
  if (loading) return <div className="modal-overlay"><div className="modal" style={{ maxWidth: 700 }}><div className="spinner" /></div></div>;
  if (!bill) return null;
  const totalValue = bill.items.reduce((s, item) => {
    const qty = parseFloat(item.quantity), price = parseFloat(item.purchase_price), tax = parseFloat(item.tax || 0);
    return s + qty * price * (1 + tax / 100);
  }, 0);
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Purchase Bill — {bill.purchase_number}</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ overflowY: 'auto' }}>
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Purchase Price</th><th>Tax</th><th>MRP</th><th>Total</th></tr></thead>
          <tbody>
            {bill.items.map((item, i) => {
              const qty = parseFloat(item.quantity), price = parseFloat(item.purchase_price), tax = parseFloat(item.tax || 0);
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                  <td>{qty} {item.purchase_unit}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{fmt(price)}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{tax}%</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{fmt(item.mrp)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(qty * price * (1 + tax / 100))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ fontWeight: 800, textAlign: 'right' }}>TOTAL</td>
              <td style={{ fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div></div>
  );
}

function PendingReturnsModal({ returns, onClose }) {
  const pending = (returns || []).filter(r => r.status === 'pending');
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>⏳ Pending Purchase Returns ({pending.length})</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Vendor</th><th>Qty</th><th>Cost</th><th>Reason</th><th>Date</th></tr></thead>
        <tbody>
          {pending.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.product_name}</td>
              <td style={{ color: 'var(--text3)' }}>{r.vendor_name || '—'}</td>
              <td><span className="badge badge-red">{r.quantity}</span></td>
              <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(r.item_cost)}</td>
              <td style={{ color: 'var(--text3)', fontSize: 12 }}>{r.reason || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(r.date).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pending.length === 0 && <div className="empty-state"><div className="icon">✅</div>No pending returns</div>}
    </div></div>
  );
}

function PurchaseBillsListModal({ bills, title, onClose, onViewDetail }) {
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 700, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ overflowY: 'auto' }}>
        <table>
          <thead><tr><th>PO Number</th><th>Date</th><th>Vendor</th><th>Total</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {bills.map((b, i) => (
              <tr key={i}>
                <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.purchase_number}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.date).toLocaleDateString()}</td>
                <td>{b.vendor_name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(b.total_value)}</td>
                <td><span className={`badge ${b.is_paid ? 'badge-green' : 'badge-red'}`}>{b.is_paid ? 'Paid' : 'Not Paid'}</span></td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => onViewDetail(b.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div></div>
  );
}

// ── Item Return Detail Modal ───────────────────────────────────────────────────
function ItemReturnDetailModal({ ret, onClose }) {
  const [printPreviewHtml, setPrintPreviewHtml] = useState(null);

  const handlePrintPreview = () => {
    const html = `<div style="font-family:Arial,sans-serif;font-size:13px;padding:24px">
      <div style="text-align:center;margin-bottom:16px"><div style="font-size:20px;font-weight:800">BAKESALE</div>
      <div>Item Return — ${ret.return_number}</div><div style="font-size:11px;color:#888">${new Date(ret.date).toLocaleString()}</div></div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px">Product</th><th style="border:1px solid #ccc;padding:6px">Type</th><th style="border:1px solid #ccc;padding:6px">Qty</th><th style="border:1px solid #ccc;padding:6px">Price</th><th style="border:1px solid #ccc;padding:6px">Total</th></tr></thead>
        <tbody>${(ret.lines||[]).map(l=>`<tr><td style="border:1px solid #ccc;padding:5px">${l.product_name}</td><td style="border:1px solid #ccc;padding:5px">${l.return_type.replace('_',' ')}</td><td style="border:1px solid #ccc;padding:5px">${l.quantity}</td><td style="border:1px solid #ccc;padding:5px">${fmt(l.price)}</td><td style="border:1px solid #ccc;padding:5px;font-weight:700">${fmt(l.total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr style="background:#f0f0f0"><td colspan="4" style="border:1px solid #ccc;padding:6px;font-weight:800">TOTAL</td><td style="border:1px solid #ccc;padding:6px;font-weight:800">${fmt(ret.total_amount)}</td></tr></tfoot>
      </table>
      <div style="margin-top:12px">Refund: ${payLabel[ret.payment_type]||ret.payment_type}</div>
    </div>`;
    setPrintPreviewHtml(html);
  };

  if (printPreviewHtml) {
    return <PrintPreviewModal html={printPreviewHtml} title={`Item Return ${ret.return_number}`} onClose={() => setPrintPreviewHtml(null)} />;
  }

  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 650 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>↩️ {ret.return_number}</h2>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{new Date(ret.date).toLocaleString()} · By {ret.created_by}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Return Type</th><th>Qty</th><th>Price</th><th>Total</th><th>Bill</th></tr></thead>
        <tbody>
          {(ret.lines || []).map((l, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{l.product_name}</td>
              <td><span className={`badge ${l.return_type === 'customer_return' ? 'badge-green' : l.return_type === 'damaged' ? 'badge-yellow' : 'badge-red'}`}>{l.return_type.replace('_', ' ')}</span></td>
              <td>{l.quantity}</td>
              <td style={{ fontFamily: 'var(--mono)' }}>{fmt(l.price)}</td>
              <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(l.total)}</td>
              <td style={{ fontSize: 12, color: 'var(--text3)' }}>{l.sale_bill_number || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ fontWeight: 800, textAlign: 'right' }}>TOTAL</td>
            <td style={{ fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(ret.total_amount)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg3)', borderRadius: 'var(--radius)', display: 'flex', gap: 24, fontSize: 13 }}>
        <div>Payment: <b>{payLabel[ret.payment_type] || ret.payment_type}</b></div>
        {ret.payment_type === 'cash_card' && <><div>Cash: <b>{fmt(ret.cash_amount)}</b></div><div>Card: <b>{fmt(ret.card_amount)}</b></div></>}
        {ret.payment_type === 'cash_upi'  && <><div>Cash: <b>{fmt(ret.cash_amount)}</b></div><div>UPI: <b>{fmt(ret.upi_amount)}</b></div></>}
      </div>
      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
        onClick={handlePrintPreview}>🖨️ Print Return</button>
    </div></div>
  );
}

// ── Internal Sale Bill Detail Modal ───────────────────────────────────────────
function InternalSaleBillDetailModal({ bill, onClose }) {
  const total = (bill.items || []).reduce((s, i) => s + i.total, 0);
  return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏭 {bill.sale_number}</h2>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{bill.destination_name} · {new Date(bill.date).toLocaleString()}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>
          {(bill.items || []).map((item, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{item.product_name}<div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{item.barcode}</div></td>
              <td style={{ fontFamily: 'var(--mono)' }}>{fmt(item.price)}</td>
              <td><span className="badge badge-purple">{item.quantity}</span></td>
              <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(item.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3} style={{ fontWeight: 800, textAlign: 'right' }}>TOTAL</td><td style={{ fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(total)}</td></tr>
        </tfoot>
      </table>
    </div></div>
  );
}

// ─── Tax Rate Filter Dropdown ─────────────────────────────────────────────────
function TaxRateFilter({ value, onChange, availableRates }) {
  return (
    <div className="form-group" style={{ maxWidth: 220, marginBottom: 16 }}>
      <label>Filter by Tax Rate (%)</label>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All Tax Rates</option>
        {availableRates.map(r => (
          <option key={r} value={r}>{r}%</option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reports Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { isAdmin, can } = usePermissions();
  const [tab,            setTab]            = useState('sale');
  const [saleData,       setSaleData]       = useState(null);
  const [itemData,       setItemData]       = useState([]);
  const [intData,        setIntData]        = useState({ bills: [], grand_total: 0 });
  const [purRetData,     setPurRetData]     = useState(null);
  const [purData,        setPurData]        = useState(null);
  const [salesTaxData,   setSalesTaxData]   = useState(null);
  const [purTaxData,     setPurTaxData]     = useState(null);
  const [directData,     setDirectData]     = useState(null);
  const [itemReturnData, setItemReturnData] = useState({ returns: [], grand_total: 0 });
  const [masters,        setMasters]        = useState([]);
  const [selDests,       setSelDests]       = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');

  // ── Tax rate filters (per-tab) ────────────────────────────────────────────
  const [salesTaxRateFilter, setSalesTaxRateFilter] = useState('');
  const [purTaxRateFilter,   setPurTaxRateFilter]   = useState('');

  // ── Available tax rates extracted from API data ───────────────────────────
  const [salesTaxAvailableRates, setSalesTaxAvailableRates] = useState([5, 12, 18, 28]);
  const [purTaxAvailableRates,   setPurTaxAvailableRates]   = useState([5, 12, 18, 28]);

  const [markingId,      setMarkingId]      = useState(null);
  const [markingPaidId,  setMarkingPaidId]  = useState(null);
  const [detailBillId,   setDetailBillId]   = useState(null);
  const [showPendingRet, setShowPendingRet] = useState(false);
  const [purListModal,   setPurListModal]   = useState(null);
  const [itemRetDetail,  setItemRetDetail]  = useState(null);
  const [intBillDetail,  setIntBillDetail]  = useState(null);

  // ── Print preview state ────────────────────────────────────────────────────
  const [printPreview, setPrintPreview] = useState(null); // { html, title }

  // Print modals
  const [showPrintModal,    setShowPrintModal]    = useState(false);
  const [showPurPrint,      setShowPurPrint]      = useState(false);
  const [showSalesTaxPrint, setShowSalesTaxPrint] = useState(false);
  const [showPurTaxPrint,   setShowPurTaxPrint]   = useState(false);
  const [showPurRetPrint,   setShowPurRetPrint]   = useState(false);
  const [showItemwisePrint, setShowItemwisePrint] = useState(false);
  const [showInternalPrint, setShowInternalPrint] = useState(false);
  const [showDirectPrint,   setShowDirectPrint]   = useState(false);
  const [showIRPrint,       setShowIRPrint]       = useState(false);

  useEffect(() => { getInternalMasters().then(r => setMasters(r.data)); }, []);

  useEffect(() => {
    if (tab === 'sale')       fetchReport('sale');
    if (tab === 'purchase')   fetchReport('purchase');
    if (tab === 'purreturn')  fetchReport('purreturn');
    if (tab === 'salestax')   fetchReport('salestax');
    if (tab === 'purtax')     fetchReport('purtax');
    if (tab === 'direct')     fetchReport('direct');
    if (tab === 'itemreturn') fetchReport('itemreturn');
    if (tab === 'internal')   fetchReport('internal');
  }, [tab]);

  useEffect(() => { if (tab === 'internal') fetchReport('internal'); }, [selDests]);

  // Re-fetch when tax rate filters change
  useEffect(() => { if (tab === 'salestax') fetchReport('salestax'); }, [salesTaxRateFilter]);
  useEffect(() => { if (tab === 'purtax')   fetchReport('purtax');   }, [purTaxRateFilter]);

  const fetchReport = async (overrideTab) => {
    const activeTab = overrideTab || tab;
    
    setLoading(true);
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    try {
      if (activeTab === 'sale') {
        const { data } = await getSaleReport(params);
        setSaleData(data);
        if (!dateFrom && data.date_from) setDateFrom(data.date_from);
        if (!dateTo   && data.date_to)   setDateTo(data.date_to);
      } else if (activeTab === 'itemwise') {
        const [itemRes, retRes] = await Promise.all([
          getItemWiseReport(params),
          getItemReturnReport(params),
        ]);
        setItemData(itemRes.data);
        setItemReturnData(retRes.data);
      } else if (activeTab === 'salestax') {
        const taxParams = { ...params };
        if (salesTaxRateFilter) taxParams.tax_rate = salesTaxRateFilter;
        const [taxRes, retRes] = await Promise.all([
          getSalesTaxReport(taxParams),
          getItemReturnReport(params),
        ]);
        setSalesTaxData(taxRes.data);
        setItemReturnData(retRes.data);
        // Extract available tax rates from response if API provides them
        if (taxRes.data?.available_tax_rates) {
          setSalesTaxAvailableRates(taxRes.data.available_tax_rates);
        }
      } else if (activeTab === 'internal') {
        if (selDests.length > 0) params.destinations = selDests.join(',');
        const { data } = await getInternalSaleBillReport(params);
        setIntData(data);
      } else if (activeTab === 'purreturn') {
        const { data } = await getPurchaseReturnReport(params);
        setPurRetData(data);
      } else if (activeTab === 'purchase') {
        const { data } = await getPurchaseReport(params);
        setPurData(data);
      } else if (activeTab === 'purtax') {
        const taxParams = { ...params };
        if (purTaxRateFilter) taxParams.tax_rate = purTaxRateFilter;
        const { data } = await getPurchaseTaxReport(taxParams);
        setPurTaxData(data);
        // Extract available tax rates from response if API provides them
        if (data?.available_tax_rates) {
          setPurTaxAvailableRates(data.available_tax_rates);
        }
      } else if (activeTab === 'direct') {
        const { data } = await getDirectSaleReport(params);
        setDirectData(data);
      } else if (activeTab === 'itemreturn') {
        const { data } = await getItemReturnReport(params);
        setItemReturnData(data);
      }
    } catch {}
    setLoading(false);
  };

  const toggleDest = id => setSelDests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleMarkReturned = async id => {
    setMarkingId(id);
    try { await markPurchaseReturned(id); toast.success('Marked as returned'); fetchReport('purreturn'); }
    catch { toast.error('Failed to update status'); } finally { setMarkingId(null); }
  };

  const handleMarkPaid = async billId => {
    setMarkingPaidId(billId);
    try { await markPurchasePaid(billId); toast.success('Marked as paid ✅'); fetchReport('purchase'); }
    catch { toast.error('Failed to mark as paid'); } finally { setMarkingPaidId(null); }
  };

  // ── Print handlers — now use PrintPreviewModal instead of doPrint ──────────
  const showPreview = (html, title) => setPrintPreview({ html, title });

  const handleSalePrint = async (from, to) => {
    try {
      const { data } = await getSaleReport({ date_from: from, date_to: to });
      setShowPrintModal(false);
      const { bills, totals, return_totals, direct_totals, direct_sales } = data;
      const saleGrand   = parseFloat(totals?.grand_total||0);
      const directGrand = parseFloat(direct_totals?.total||0);
      const returnGrand = parseFloat(return_totals?.total||0);
      const netGrand    = saleGrand + directGrand - returnGrand;
      const cashNet = parseFloat(totals?.cash_total||0)+parseFloat(direct_totals?.cash_total||0)-parseFloat(return_totals?.cash_total||0);
      const cardNet = parseFloat(totals?.card_total||0)+parseFloat(direct_totals?.card_total||0)-parseFloat(return_totals?.card_total||0);
      const upiNet  = parseFloat(totals?.upi_total||0)+parseFloat(direct_totals?.upi_total||0)-parseFloat(return_totals?.upi_total||0);

      const thStyle = `border:1px solid #ccc;padding:7px;background:#f0f0f0;text-align:left`;
      const tdStyle = `border:1px solid #ccc;padding:6px`;
      const tdRight = `border:1px solid #ccc;padding:6px;text-align:right`;

      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px;max-width:900px;margin:0 auto">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:24px;font-weight:800;letter-spacing:2px">BAKESALE</div>
          <div style="font-size:14px;margin-top:4px">Sale Report — ${from} to ${to}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Printed: ${new Date().toLocaleString()}</div>
        </div>
        <div style="border:1px solid #ddd;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="background:#fff"><td style="padding:10px 16px">Cash Total</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(cashNet)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:10px 16px">Card Total</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(cardNet)}</td></tr>
            <tr style="background:#fff"><td style="padding:10px 16px">UPI Total</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(upiNet)}</td></tr>
            ${directGrand > 0 ? `<tr style="background:#f9f9f9"><td style="padding:10px 16px;color:#16a34a">Direct Sale Total</td><td style="padding:10px 16px;text-align:right;font-weight:600;color:#16a34a">+ ${fmt(directGrand)}</td></tr>` : ''}
            ${returnGrand > 0 ? `<tr style="background:#fff"><td style="padding:10px 16px;color:#dc2626">Item Return Total</td><td style="padding:10px 16px;text-align:right;font-weight:600;color:#dc2626">− ${fmt(returnGrand)}</td></tr>` : ''}
            <tr style="border-top:2px solid #333;background:#f0f0f0">
              <td style="padding:12px 16px;font-weight:800;font-size:16px">Grand Total</td>
              <td style="padding:12px 16px;text-align:right;font-weight:800;font-size:16px">${fmt(netGrand)}</td>
            </tr>
          </table>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px">
          <thead><tr>
            <th style="${thStyle}">Bill No</th><th style="${thStyle}">Date</th>
            <th style="${thStyle}">Payment</th><th style="${thStyle};text-align:right">Total</th>
            <th style="${thStyle}">Return No</th>
          </tr></thead>
          <tbody>
            ${(bills||[]).map((b,i)=>`<tr style="background:${b.return_number?'#fff5f5':i%2===0?'#fff':'#fafafa'}">
              <td style="${tdStyle};font-weight:600">${b.bill_number}</td>
              <td style="${tdStyle}">${new Date(b.created_at).toLocaleString()}</td>
              <td style="${tdStyle}">${payLabel[b.payment_type]||b.payment_type}</td>
              <td style="${tdRight};font-weight:600">${fmt(b.total_amount)}</td>
              <td style="${tdStyle};color:#dc2626">${b.return_number||'—'}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f0f0f0;font-weight:800">
              <td colspan="3" style="${tdStyle}">Sale Total</td>
              <td style="${tdRight}">${fmt(saleGrand)}</td>
              <td style="${tdStyle}"></td>
            </tr>
          </tfoot>
        </table>
        ${directGrand > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px">
          <thead><tr>
            <th style="${thStyle};background:#f0fff4">DS No</th><th style="${thStyle};background:#f0fff4">Date</th>
            <th style="${thStyle};background:#f0fff4">Item Name</th><th style="${thStyle};background:#f0fff4">Payment</th>
            <th style="${thStyle};background:#f0fff4;text-align:right">Amount</th>
          </tr></thead>
          <tbody>
            ${(direct_sales||[]).map((s,i)=>`<tr style="background:${i%2===0?'#fff':'#f0fff4'}">
              <td style="${tdStyle};font-weight:600">${s.sale_number||'—'}</td>
              <td style="${tdStyle}">${new Date(s.date).toLocaleString()}</td>
              <td style="${tdStyle}">${s.item_name}</td>
              <td style="${tdStyle}">${payLabel[s.payment_type]||s.payment_type}</td>
              <td style="${tdRight};font-weight:600;color:#16a34a">${fmt(s.price)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr style="background:#f0fff4;font-weight:800">
            <td colspan="4" style="${tdStyle}">Direct Sale Total</td>
            <td style="${tdRight}">${fmt(directGrand)}</td>
          </tr></tfoot>
        </table>` : ''}
      </div>`;
      showPreview(html, `Sale Report ${from} to ${to}`);
    } catch { alert('Failed to load report'); }
  };

  // ── Sales Tax Print — respects current filter ─────────────────────────────
  const handleSalesTaxPrint = async (from, to) => {
    try {
      const taxParams = { date_from: from, date_to: to };
      if (salesTaxRateFilter) taxParams.tax_rate = salesTaxRateFilter;
      const { data } = await getSalesTaxReport(taxParams);
      setShowSalesTaxPrint(false);

      const filterLabel = salesTaxRateFilter ? ` (Tax Rate: ${salesTaxRateFilter}%)` : '';
      const adjTaxable = (data.items||[]).reduce((s,i)=>s+i.taxable_amount,0);
      const adjCgst    = (data.items||[]).reduce((s,i)=>s+i.cgst,0);
      const adjSgst    = (data.items||[]).reduce((s,i)=>s+i.sgst,0);
      const adjTax     = (data.items||[]).reduce((s,i)=>s+i.total_tax,0);

      const html = `<div style="font-family:Arial,sans-serif;padding:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:22px;font-weight:800">BAKESALE</div>
          <div>Sales Tax Report — ${from} to ${to}${filterLabel}</div>
          <div style="font-size:11px;color:#888;margin-top:4px">Printed: ${new Date().toLocaleString()}</div>
        </div>
        <div style="border:1px solid #ddd;margin-bottom:20px;padding:12px 16px;display:flex;gap:40px;font-size:13px">
          <div>Taxable: <strong>${fmt(data.grand_taxable||adjTaxable)}</strong></div>
          <div>CGST: <strong>${fmt(data.grand_cgst||adjCgst)}</strong></div>
          <div>SGST: <strong>${fmt(data.grand_sgst||adjSgst)}</strong></div>
          <div>Total Tax: <strong>${fmt(data.grand_tax||adjTax)}</strong></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#f0f0f0">
            <th style="border:1px solid #ccc;padding:6px">Bill</th>
            <th style="border:1px solid #ccc;padding:6px">Date</th>
            <th style="border:1px solid #ccc;padding:6px">Product</th>
            <th style="border:1px solid #ccc;padding:6px">Qty</th>
            <th style="border:1px solid #ccc;padding:6px">Taxable</th>
            <th style="border:1px solid #ccc;padding:6px">CGST</th>
            <th style="border:1px solid #ccc;padding:6px">SGST</th>
            <th style="border:1px solid #ccc;padding:6px">Tax</th>
          </tr></thead>
          <tbody>${(data.items||[]).map((b,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
            <td style="border:1px solid #ccc;padding:5px">${b.bill_number}</td>
            <td style="border:1px solid #ccc;padding:5px">${new Date(b.date).toLocaleDateString()}</td>
            <td style="border:1px solid #ccc;padding:5px">${b.product_name}</td>
            <td style="border:1px solid #ccc;padding:5px">${b.quantity}</td>
            <td style="border:1px solid #ccc;padding:5px">${fmt(b.taxable_amount)}</td>
            <td style="border:1px solid #ccc;padding:5px">${fmt(b.cgst)}</td>
            <td style="border:1px solid #ccc;padding:5px">${fmt(b.sgst)}</td>
            <td style="border:1px solid #ccc;padding:5px;font-weight:700">${fmt(b.total_tax)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f0f0f0;font-weight:800">
            <td colspan="4" style="border:1px solid #ccc;padding:6px">TOTAL</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(data.grand_taxable||adjTaxable)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(data.grand_cgst||adjCgst)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(data.grand_sgst||adjSgst)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(data.grand_tax||adjTax)}</td>
          </tr></tfoot>
        </table>
      </div>`;
      showPreview(html, `Sales Tax Report ${from} to ${to}${filterLabel}`);
    } catch { alert('Failed'); }
  };

  // ── Purchase Tax Print — respects current filter ──────────────────────────
  const handlePurTaxPrint = async (from, to) => {
    try {
      const taxParams = { date_from: from, date_to: to };
      if (purTaxRateFilter) taxParams.tax_rate = purTaxRateFilter;
      const { data } = await getPurchaseTaxReport(taxParams);
      setShowPurTaxPrint(false);

      const filterLabel = purTaxRateFilter ? ` (Tax Rate: ${purTaxRateFilter}%)` : '';

      const html = `<div style="font-family:Arial,sans-serif;padding:32px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:22px;font-weight:800">BAKESALE</div>
          <div>Purchase Tax Report — ${from} to ${to}${filterLabel}</div>
          <div style="font-size:11px;color:#888;margin-top:4px">Printed: ${new Date().toLocaleString()}</div>
        </div>
        <div style="border:1px solid #ddd;margin-bottom:20px;padding:12px 16px;display:flex;gap:40px;font-size:13px">
          <div>Taxable: <strong>${fmt(data.grand_taxable)}</strong></div>
          <div>CGST: <strong>${fmt(data.grand_cgst)}</strong></div>
          <div>SGST: <strong>${fmt(data.grand_sgst)}</strong></div>
          <div>Total: <strong>${fmt(data.grand_total)}</strong></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0">
            <th style="border:1px solid #ccc;padding:7px">PO No</th>
            <th style="border:1px solid #ccc;padding:7px">Date</th>
            <th style="border:1px solid #ccc;padding:7px">Vendor</th>
            <th style="border:1px solid #ccc;padding:7px">Taxable Amt</th>
            <th style="border:1px solid #ccc;padding:7px">CGST</th>
            <th style="border:1px solid #ccc;padding:7px">SGST</th>
            <th style="border:1px solid #ccc;padding:7px">Total Tax</th>
            <th style="border:1px solid #ccc;padding:7px">Total</th>
          </tr></thead>
          <tbody>${(data.bills||[]).map((b,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
            <td style="border:1px solid #ccc;padding:6px">${b.purchase_number}</td>
            <td style="border:1px solid #ccc;padding:6px">${new Date(b.date).toLocaleDateString()}</td>
            <td style="border:1px solid #ccc;padding:6px">${b.vendor_name}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(b.taxable_amount)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(b.cgst)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(b.sgst)}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(b.total_tax)}</td>
            <td style="border:1px solid #ccc;padding:6px;font-weight:700">${fmt(b.total_amount)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f0f0f0;font-weight:800">
            <td colspan="3" style="border:1px solid #ccc;padding:7px">TOTAL</td>
            <td style="border:1px solid #ccc;padding:7px">${fmt(data.grand_taxable)}</td>
            <td style="border:1px solid #ccc;padding:7px">${fmt(data.grand_cgst)}</td>
            <td style="border:1px solid #ccc;padding:7px">${fmt(data.grand_sgst)}</td>
            <td style="border:1px solid #ccc;padding:7px">${fmt(data.grand_tax)}</td>
            <td style="border:1px solid #ccc;padding:7px">${fmt(data.grand_total)}</td>
          </tr></tfoot>
        </table>
      </div>`;
      showPreview(html, `Purchase Tax Report ${from} to ${to}${filterLabel}`);
    } catch { alert('Failed'); }
  };

  const handleItemReturnPrint = async (from, to) => {
    try {
      const { data } = await getItemReturnReport({ date_from: from, date_to: to });
      setShowIRPrint(false);
      const rows = (data.returns||[]).map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}"><td style="border:1px solid #ccc;padding:6px;font-weight:600;font-family:monospace">${r.return_number}</td><td style="border:1px solid #ccc;padding:6px">${new Date(r.date).toLocaleDateString()}</td><td style="border:1px solid #ccc;padding:6px">${payLabel[r.payment_type]||r.payment_type}</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700">${fmt(r.total_amount)}</td></tr>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div>
        <div>Item Return Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:7px">Return No</th><th style="border:1px solid #ccc;padding:7px">Date</th><th style="border:1px solid #ccc;padding:7px">Payment</th><th style="border:1px solid #ccc;padding:7px;text-align:right">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="background:#f0f0f0"><td colspan="3" style="border:1px solid #ccc;padding:7px;font-weight:800">Grand Total</td><td style="border:1px solid #ccc;padding:7px;text-align:right;font-weight:800">${fmt(data.grand_total)}</td></tr></tfoot>
        </table></div>`;
      showPreview(html, `Item Return Report ${from} to ${to}`);
    } catch { alert('Failed to load report'); }
  };

  const handleInternalPrint = async (from, to) => {
    try {
      const { data } = await getInternalSaleBillReport({ date_from: from, date_to: to });
      setShowInternalPrint(false);
      const rows = (data.bills||[]).map((b,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}"><td style="border:1px solid #ccc;padding:6px;font-weight:600;font-family:monospace">${b.sale_number}</td><td style="border:1px solid #ccc;padding:6px">${new Date(b.date).toLocaleDateString()}</td><td style="border:1px solid #ccc;padding:6px">${b.destination_name}</td><td style="border:1px solid #ccc;padding:6px">${b.item_names}</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700">${fmt(b.total_amount)}</td></tr>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div>
        <div>Internal Sale Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:7px">IS No</th><th style="border:1px solid #ccc;padding:7px">Date</th><th style="border:1px solid #ccc;padding:7px">Destination</th><th style="border:1px solid #ccc;padding:7px">Items</th><th style="border:1px solid #ccc;padding:7px;text-align:right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="background:#f0f0f0"><td colspan="4" style="border:1px solid #ccc;padding:7px;font-weight:800">Grand Total</td><td style="border:1px solid #ccc;padding:7px;text-align:right;font-weight:800">${fmt(data.grand_total)}</td></tr></tfoot>
        </table></div>`;
      showPreview(html, `Internal Sale Report ${from} to ${to}`);
    } catch { alert('Failed to load report'); }
  };

  const handleDirectPrint = async (from, to) => {
    try {
      const { data } = await getDirectSaleReport({ date_from: from, date_to: to });
      setShowDirectPrint(false);
      const rows = (data.sales||[]).map((s,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}"><td style="border:1px solid #ccc;padding:6px;font-family:monospace;font-weight:600">${s.sale_number||'—'}</td><td style="border:1px solid #ccc;padding:6px">${new Date(s.date).toLocaleDateString()}</td><td style="border:1px solid #ccc;padding:6px">${s.item_name}</td><td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:700">${fmt(s.price)}</td><td style="border:1px solid #ccc;padding:6px">${payLabel[s.payment_type]||s.payment_type}</td></tr>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div>
        <div>Direct Sale Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:7px">DS No</th><th style="border:1px solid #ccc;padding:7px">Date</th><th style="border:1px solid #ccc;padding:7px">Item</th><th style="border:1px solid #ccc;padding:7px;text-align:right">Amount</th><th style="border:1px solid #ccc;padding:7px">Payment</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="background:#f0f0f0"><td colspan="3" style="border:1px solid #ccc;padding:7px;font-weight:800">Grand Total</td><td style="border:1px solid #ccc;padding:7px;text-align:right;font-weight:800">${fmt(data.grand_total)}</td><td style="border:1px solid #ccc;padding:7px"></td></tr></tfoot>
        </table></div>`;
      showPreview(html, `Direct Sale Report ${from} to ${to}`);
    } catch { alert('Failed to load report'); }
  };

  const handlePurchasePrint = async (from, to) => {
    try {
      const { data } = await getPurchaseReport({ date_from: from, date_to: to });
      setShowPurPrint(false);
      const { bills, grand_total } = data;
      const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div><div>Purchase Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0">
            <th style="border:1px solid #ccc;padding:7px">PO No</th><th style="border:1px solid #ccc;padding:7px">Date</th>
            <th style="border:1px solid #ccc;padding:7px">Vendor</th><th style="border:1px solid #ccc;padding:7px;text-align:right">Total</th>
            <th style="border:1px solid #ccc;padding:7px;text-align:center">Payment</th>
          </tr></thead>
          <tbody>${(bills||[]).map((b,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
            <td style="border:1px solid #ccc;padding:6px;font-weight:600">${b.purchase_number}</td>
            <td style="border:1px solid #ccc;padding:6px">${new Date(b.date).toLocaleDateString()}</td>
            <td style="border:1px solid #ccc;padding:6px">${b.vendor_name}</td>
            <td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:600">${fmt(b.total_value)}</td>
            <td style="border:1px solid #ccc;padding:6px;text-align:center">${b.is_paid?'Paid':'Not Paid'}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f0f0f0">
            <td colspan="3" style="border:1px solid #ccc;padding:7px;font-weight:800">Grand Total</td>
            <td style="border:1px solid #ccc;padding:7px;text-align:right;font-weight:800">${fmt(grand_total)}</td>
            <td style="border:1px solid #ccc;padding:7px"></td>
          </tr></tfoot>
        </table></div>`;
      showPreview(html, `Purchase Report ${from} to ${to}`);
    } catch { alert('Failed'); }
  };

  const handlePurRetPrint = async (from, to) => {
    try {
      const { data } = await getPurchaseReturnReport({ date_from: from, date_to: to });
      setShowPurRetPrint(false);
      const html = `<div style="font-family:Arial,sans-serif;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div>
        <div>Purchase Return Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0">
            <th style="border:1px solid #ccc;padding:7px">Product</th><th style="border:1px solid #ccc;padding:7px">Vendor</th>
            <th style="border:1px solid #ccc;padding:7px">Qty</th><th style="border:1px solid #ccc;padding:7px">Cost</th>
            <th style="border:1px solid #ccc;padding:7px">Status</th><th style="border:1px solid #ccc;padding:7px">Date</th>
          </tr></thead>
          <tbody>${(data.returns||[]).map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
            <td style="border:1px solid #ccc;padding:6px">${r.product_name}</td>
            <td style="border:1px solid #ccc;padding:6px">${r.vendor_name||'—'}</td>
            <td style="border:1px solid #ccc;padding:6px">${r.quantity}</td>
            <td style="border:1px solid #ccc;padding:6px;font-weight:700">${fmt(r.item_cost)}</td>
            <td style="border:1px solid #ccc;padding:6px">${r.status==='returned'?'Returned':'Pending'}</td>
            <td style="border:1px solid #ccc;padding:6px">${new Date(r.date).toLocaleDateString()}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f0f0f0">
            <td colspan="3" style="border:1px solid #ccc;padding:7px;font-weight:800">TOTAL COST</td>
            <td style="border:1px solid #ccc;padding:7px;font-weight:800">${fmt(data.total_cost)}</td>
            <td colspan="2" style="border:1px solid #ccc;padding:7px"></td>
          </tr></tfoot>
        </table></div>`;
      showPreview(html, `Purchase Return Report ${from} to ${to}`);
    } catch { alert('Failed'); }
  };

  const handleItemwisePrint = async (from, to) => {
    try {
      const { data } = await getItemWiseReport({ date_from: from, date_to: to });
      setShowItemwisePrint(false);
      const items = Array.isArray(data)?data:[];
      const grandTotal = items.reduce((s,r)=>s+r.total_amount,0);
      const html = `<div style="font-family:Arial,sans-serif;padding:32px">
        <div style="text-align:center;margin-bottom:24px"><div style="font-size:22px;font-weight:800">BAKESALE</div>
        <div>Item-wise Sale Report — ${from} to ${to}</div></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f0f0f0">
            <th style="border:1px solid #ccc;padding:7px">Product</th><th style="border:1px solid #ccc;padding:7px">Barcode</th>
            <th style="border:1px solid #ccc;padding:7px">MRP</th><th style="border:1px solid #ccc;padding:7px">Qty Sold</th>
            <th style="border:1px solid #ccc;padding:7px">Total</th>
          </tr></thead>
          <tbody>${items.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}">
            <td style="border:1px solid #ccc;padding:6px">${r.product_name}</td>
            <td style="border:1px solid #ccc;padding:6px;font-family:monospace">${r.product_barcode}</td>
            <td style="border:1px solid #ccc;padding:6px">${fmt(r.mrp)}</td>
            <td style="border:1px solid #ccc;padding:6px">${r.quantity_sold}</td>
            <td style="border:1px solid #ccc;padding:6px;font-weight:700">${fmt(r.total_amount)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f0f0f0">
            <td colspan="4" style="border:1px solid #ccc;padding:7px;font-weight:800">GRAND TOTAL</td>
            <td style="border:1px solid #ccc;padding:7px;font-weight:800">${fmt(grandTotal)}</td>
          </tr></tfoot>
        </table></div>`;
      showPreview(html, `Item-wise Sale Report ${from} to ${to}`);
    } catch { alert('Failed'); }
  };

  const ALL_TABS = [
    { k: 'sale',       label: 'Sale Report',       perm: 'can_view_sale_report' },
    { k: 'purchase',   label: 'Purchase Report',    perm: 'can_view_purchase_report' },
    { k: 'purreturn',  label: 'Purchase Returns',   perm: 'can_view_purreturn_report' },
    { k: 'salestax',   label: 'Sales Tax',          perm: 'can_view_salestax_report' },
    { k: 'purtax',     label: 'Purchase Tax',       perm: 'can_view_purtax_report' },
    { k: 'itemwise',   label: 'Item-wise Sale',     perm: 'can_view_itemwise_report' },
    { k: 'internal',   label: 'Internal Sale',      perm: 'can_view_internal_report' },
    { k: 'direct',     label: 'Direct Sale',        perm: 'can_view_direct_report' },
    { k: 'itemreturn', label: 'Item Return Report', perm: 'can_view_sale_report' },
  ];
  const TABS = ALL_TABS.filter(t => isAdmin || can(t.perm));

  return (
    <div>
      {/* ── Print Preview overlay (full-screen) ── */}
      {printPreview && (
        <PrintPreviewModal
          html={printPreview.html}
          title={printPreview.title}
          onClose={() => setPrintPreview(null)}
        />
      )}

      <div className="page-header">
        <h1>📊 Reports</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 155 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 155 }} />
          {/* ── "Filter" renamed to "Load" ── */}
          <button className="btn btn-primary" onClick={() => fetchReport()}>Load</button>
          <button className="btn btn-secondary" onClick={() => fetchReport()}>🔄 Refresh</button>
          {tab === 'sale'       && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowPrintModal(true)}    style={{ color: 'var(--accent)',  borderColor: 'var(--accent)' }}>🖨️ Print</button>}
          {tab === 'purchase'   && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowPurPrint(true)}       style={{ color: 'var(--accent)',  borderColor: 'var(--accent)' }}>🖨️ Print</button>}
          {tab === 'salestax'   && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowSalesTaxPrint(true)}  style={{ color: 'var(--green)',   borderColor: 'var(--green)' }}>🖨️ Print</button>}
          {tab === 'purtax'     && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowPurTaxPrint(true)}    style={{ color: 'var(--blue)',    borderColor: 'var(--blue)' }}>🖨️ Print</button>}
          {tab === 'purreturn'  && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowPurRetPrint(true)}    style={{ color: 'var(--red)',     borderColor: 'var(--red)' }}>🖨️ Print</button>}
          {tab === 'itemwise'   && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowItemwisePrint(true)}  style={{ color: 'var(--purple)', borderColor: 'var(--purple)' }}>🖨️ Print</button>}
          {tab === 'internal'   && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowInternalPrint(true)}  style={{ color: 'var(--blue)',    borderColor: 'var(--blue)' }}>🖨️ Print</button>}
          {tab === 'direct'     && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowDirectPrint(true)}    style={{ color: 'var(--green)',   borderColor: 'var(--green)' }}>🖨️ Print</button>}
          {tab === 'itemreturn' && (isAdmin || can('can_print_reports')) && <button className="btn btn-secondary" onClick={() => setShowIRPrint(true)}         style={{ color: 'var(--red)',     borderColor: 'var(--red)' }}>🖨️ Print</button>}
        </div>
      </div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className="btn" style={{
            background: tab === t.k ? 'var(--accent)' : 'var(--surface)',
            color:      tab === t.k ? '#fff' : 'var(--text2)',
            border:    `1px solid ${tab === t.k ? 'var(--accent)' : 'var(--border)'}`,
            fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* ── Sale Report ── */}
          {tab === 'sale' && (
            <>
              {saleData && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text3)' }}>Showing: <b style={{ color: 'var(--text)' }}>{dateFrom}</b> to <b style={{ color: 'var(--text)' }}>{dateTo}</b></div>}
              {saleData ? (
                <>
                  {(() => {
                    const saleTotal   = parseFloat(saleData.totals?.grand_total || 0);
                    const directTotal = parseFloat(saleData.direct_totals?.total || 0);
                    const returnTotal = parseFloat(saleData.return_totals?.total || 0);
                    const netTotal    = saleTotal + directTotal - returnTotal;
                    const cashNet     = parseFloat(saleData.totals?.cash_total||0) + parseFloat(saleData.direct_totals?.cash_total||0) - parseFloat(saleData.return_totals?.cash_total||0);
                    const cardNet     = parseFloat(saleData.totals?.card_total||0) + parseFloat(saleData.direct_totals?.card_total||0) - parseFloat(saleData.return_totals?.card_total||0);
                    const upiNet      = parseFloat(saleData.totals?.upi_total||0)  + parseFloat(saleData.direct_totals?.upi_total||0)  - parseFloat(saleData.return_totals?.upi_total||0);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
                        <div className="stat-card" style={{ borderColor: 'var(--accent)' }}>
                          <div className="label">Grand Total</div>
                          <div className="value" style={{ color: 'var(--accent)' }}>{fmt(netTotal)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                            Sale {fmt(saleTotal)}{directTotal>0?` + Direct ${fmt(directTotal)}`:''}{returnTotal>0?` − Return ${fmt(returnTotal)}`:''}
                          </div>
                        </div>
                        <div className="stat-card"><div className="label">Cash</div><div className="value" style={{ color: 'var(--green)' }}>{fmt(cashNet)}</div></div>
                        <div className="stat-card"><div className="label">Card</div><div className="value" style={{ color: 'var(--blue)' }}>{fmt(cardNet)}</div></div>
                        <div className="stat-card"><div className="label">UPI</div><div className="value" style={{ color: 'var(--purple)' }}>{fmt(upiNet)}</div></div>
                      </div>
                    );
                  })()}
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table>
                      <thead>
                        <tr><th>Bill No</th><th>Date & Time</th><th>Payment</th><th>Total</th><th>Return No</th></tr>
                      </thead>
                      <tbody>
                        {(saleData.bills || []).map((b, i) => (
                          <tr key={i} style={{ background: b.return_number ? 'rgba(239,68,68,0.06)' : undefined }}>
                            <td>
                              <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span>
                              {b.return_number && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>↩️ returned</div>}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString()}</td>
                            <td>{payLabel[b.payment_type] || b.payment_type}</td>
                            <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_amount)}</td>
                            <td>
                              {b.return_number
                                ? <span className="badge badge-red" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.return_number}</span>
                                : <span style={{ color: 'var(--text3)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!saleData.bills || saleData.bills.length === 0) && <div className="empty-state"><div className="icon">🧾</div>No sales in this period</div>}
                  </div>
                </>
              ) : <div className="empty-state"><div className="icon">📊</div>Loading today's report…</div>}
            </>
          )}

          {/* ── Item-wise ── */}
          {tab === 'itemwise' && (() => {
            const crMap = {};
            (itemReturnData.returns || []).forEach(r => {
              (r.lines || []).filter(l => l.return_type === 'customer_return').forEach(l => {
                if (!crMap[l.product_name]) crMap[l.product_name] = { qty: 0, total: 0 };
                crMap[l.product_name].qty   += parseFloat(l.quantity || 0);
                crMap[l.product_name].total += parseFloat(l.total    || 0);
              });
            });
            const adjustedItems = itemData
              .map(item => {
                const ret = crMap[item.product_name] || { qty: 0, total: 0 };
                return {
                  ...item,
                  quantity_sold: Math.max(0, parseFloat(item.quantity_sold) - ret.qty),
                  total_amount:  Math.max(0, parseFloat(item.total_amount)  - ret.total),
                  _returned: ret.qty > 0,
                };
              })
              .filter(item => item.quantity_sold > 0);
            return (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Product</th><th>Barcode</th><th>MRP</th><th>Qty Sold</th><th>Total Revenue</th></tr></thead>
                  <tbody>
                    {adjustedItems.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>
                          {item.product_name}
                          {item._returned && <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 1 }}>↩️ partial return deducted</div>}
                        </td>
                        <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.product_barcode}</span></td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{fmt(item.mrp)}</td>
                        <td><span className="badge badge-blue">{parseFloat(item.quantity_sold).toFixed(2)}</span></td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {adjustedItems.length === 0 && <div className="empty-state"><div className="icon">📦</div>No item data</div>}
              </div>
            );
          })()}

          {/* ── Item Return Report ── */}
          {tab === 'itemreturn' && (
            <>
              {itemReturnData.returns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 16 }}>
                  <div className="stat-card"><div className="label">Total Returns</div><div className="value" style={{ color: 'var(--red)' }}>{itemReturnData.returns.length}</div></div>
                  <div className="stat-card"><div className="label">Grand Total</div><div className="value" style={{ color: 'var(--accent)' }}>{fmt(itemReturnData.grand_total)}</div></div>
                  <div className="stat-card"><div className="label">Items Returned</div><div className="value" style={{ color: 'var(--yellow)' }}>{itemReturnData.returns.reduce((s,r)=>s+(r.lines||[]).length,0)}</div></div>
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Return No</th><th>Date</th><th>Total Amount</th><th>Payment</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {(itemReturnData.returns || []).map((r, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-red" style={{ fontFamily: 'var(--mono)' }}>{r.return_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(r.date).toLocaleString()}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(r.total_amount)}</td>
                        <td><span className="badge badge-blue">{payLabel[r.payment_type] || r.payment_type}</span></td>
                        <td><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setItemRetDetail(r)}>👁️ View</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {itemReturnData.returns.length === 0 && <div className="empty-state"><div className="icon">↩️</div>No item returns in this period</div>}
              </div>
            </>
          )}

          {/* ── Internal Sale ── */}
          {tab === 'internal' && (
            <>
              {masters.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Filter by Destination</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button onClick={() => setSelDests([])} className="btn btn-sm" style={{ background: selDests.length===0?'var(--accent-dim)':'var(--bg3)', color: selDests.length===0?'var(--accent)':'var(--text2)', border: `1px solid ${selDests.length===0?'var(--accent)':'var(--border)'}` }}>All</button>
                    {masters.map(m => (
                      <button key={m.id} onClick={() => toggleDest(m.id)} className="btn btn-sm" style={{ background: selDests.includes(m.id)?'var(--accent-dim)':'var(--bg3)', color: selDests.includes(m.id)?'var(--accent)':'var(--text2)', border: `1px solid ${selDests.includes(m.id)?'var(--accent)':'var(--border)'}` }}>{m.name}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>IS No</th><th>Date</th><th>Destination</th><th>Items</th><th>Total</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {(intData.bills || []).map((b, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-purple" style={{ fontFamily: 'var(--mono)' }}>{b.sale_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.date).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{b.destination_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 200 }}>{b.item_names}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_amount)}</td>
                        <td><div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setIntBillDetail(b)}>👁️ View</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(intData.bills||[]).length === 0 && <div className="empty-state"><div className="icon">🏭</div>No internal sales in this period</div>}
              </div>
              {(intData.bills||[]).length > 0 && (
                <div style={{ marginTop: 12, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>
                  Grand Total: {fmt(intData.grand_total)}
                </div>
              )}
            </>
          )}

          {/* ── Purchase Return ── */}
          {tab === 'purreturn' && (
            <>
              {purRetData && (
                <div style={{ marginBottom: 20 }}>
                  <div className="stat-card" style={{ maxWidth: 220, cursor: 'pointer', border: purRetData.pending_count > 0 ? '1px solid var(--yellow)' : undefined }} onClick={() => setShowPendingRet(true)}>
                    <div className="label">⏳ Pending Returns</div>
                    <div className="value" style={{ color: purRetData.pending_count > 0 ? 'var(--yellow)' : 'var(--text3)', fontSize: 28 }}>{purRetData.pending_count}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Click to view</div>
                  </div>
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr><th>Return No</th><th>Product</th><th>Vendor</th><th>MRP</th><th>Qty</th><th>Total</th><th>Reason</th><th>Date</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(purRetData?.returns || []).map((r, i) => {
                      const mrp   = parseFloat(r.mrp || 0);
                      const qty   = parseFloat(r.quantity || 0);
                      const total = mrp * qty;
                      return (
                        <tr key={i}>
                          <td>{r.return_number ? <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{r.return_number}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                          <td style={{ fontWeight: 600 }}>{r.product_name}<div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.product_barcode}</div></td>
                          <td style={{ color: 'var(--text3)', fontSize: 13 }}>{r.vendor_name || '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(mrp)}</td>
                          <td><span className="badge badge-red">{r.quantity}</span></td>
                          <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(total)}</td>
                          <td style={{ color: 'var(--text3)', fontSize: 12 }}>{r.reason || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(r.date).toLocaleDateString()}</td>
                          <td><span className={`badge ${r.status === 'returned' ? 'badge-green' : 'badge-yellow'}`}>{r.status === 'returned' ? '✅ Returned' : '⏳ Pending'}</span></td>
                          <td>{r.status === 'pending' && <button className="btn btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', fontSize: 12 }} onClick={() => handleMarkReturned(r.id)} disabled={markingId === r.id}>{markingId === r.id ? '…' : '✅ Mark Returned'}</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!purRetData || purRetData.returns.length === 0) && <div className="empty-state"><div className="icon">↩️</div>No purchase returns in this period</div>}
              </div>
            </>
          )}

          {/* ── Purchase Report ── */}
          {tab === 'purchase' && purData && (
            <>
              <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setPurListModal({ bills: purData.bills.filter(b => !b.is_paid), title: '🔴 Unpaid Bills' })}>
                  <div className="label">🔴 Not Paid</div>
                  <div className="value" style={{ color: 'var(--red)', fontSize: 22 }}>{purData.bills.filter(b => !b.is_paid).length} bills</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Click to view</div>
                </div>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>PO Number</th><th>Date</th><th>Vendor</th><th>Total</th><th>Payment</th><th></th></tr></thead>
                  <tbody>
                    {(purData.bills || []).map((b, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.purchase_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.date).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600 }}>{b.vendor_name}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_value)}</td>
                        <td><span className={`badge ${b.is_paid ? 'badge-green' : 'badge-red'}`}>{b.is_paid ? '✅ Paid' : '🔴 Not Paid'}</span></td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setDetailBillId(b.id)}>View</button>
                          {!b.is_paid && <button className="btn btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)', fontSize: 11 }} onClick={() => handleMarkPaid(b.id)} disabled={markingPaidId === b.id}>{markingPaidId === b.id ? '…' : '✅ Mark Paid'}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Sales Tax — with filter dropdown ── */}
          {tab === 'salestax' && (() => {
            const crLookup = {};
            (itemReturnData.returns || []).forEach(r => {
              (r.lines || []).filter(l => l.return_type === 'customer_return').forEach(l => {
                if (!l.sale_bill_number) return;
                const key = `${l.sale_bill_number}__${l.product_name}`;
                crLookup[key] = (crLookup[key] || 0) + parseFloat(l.quantity || 0);
              });
            });
            const adjustedItems = (salesTaxData?.items || []).map(item => {
              const key = `${item.bill_number}__${item.product_name}`;
              const returnedQty = crLookup[key] || 0;
              if (returnedQty <= 0) return item;
              const ratio = Math.min(returnedQty / item.quantity, 1);
              return {
                ...item,
                quantity:       item.quantity       - returnedQty,
                total_amount:   item.total_amount   * (1 - ratio),
                taxable_amount: item.taxable_amount * (1 - ratio),
                cgst:           item.cgst           * (1 - ratio),
                sgst:           item.sgst           * (1 - ratio),
                total_tax:      item.total_tax      * (1 - ratio),
                _returned: true,
              };
            }).filter(item => item.quantity > 0);

            const adjTaxable = adjustedItems.reduce((s, i) => s + i.taxable_amount, 0);
            const adjCgst    = adjustedItems.reduce((s, i) => s + i.cgst, 0);
            const adjSgst    = adjustedItems.reduce((s, i) => s + i.sgst, 0);
            const adjTax     = adjustedItems.reduce((s, i) => s + i.total_tax, 0);

            return (
              <>
                {/* ── Sales Tax Rate Dropdown ── */}
                <TaxRateFilter
                  value={salesTaxRateFilter}
                  onChange={setSalesTaxRateFilter}
                  availableRates={
                    salesTaxData?.available_tax_rates ||
                    [...new Set((salesTaxData?.items||[]).map(i=>i.tax_rate).filter(Boolean))].sort((a,b)=>a-b) ||
                    salesTaxAvailableRates
                  }
                />

                {salesTaxData && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
                    {[
                      { label: 'Taxable Amount', value: fmt(adjTaxable), color: 'var(--text)' },
                      { label: 'Total CGST',     value: fmt(adjCgst),    color: 'var(--blue)' },
                      { label: 'Total SGST',     value: fmt(adjSgst),    color: 'var(--purple)' },
                      { label: 'Total Tax',      value: fmt(adjTax),     color: 'var(--accent)' },
                    ].map(s => (
                      <div key={s.label} className="stat-card"><div className="label">{s.label}</div><div className="value" style={{ color: s.color }}>{s.value}</div></div>
                    ))}
                  </div>
                )}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Bill No</th><th>Date</th><th>Product</th><th>Qty</th>
                        <th>MRP</th><th>Total (incl. tax)</th><th>Taxable Amt</th>
                        <th>Tax Rate</th><th>CGST</th><th>SGST</th><th>Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustedItems.map((b, i) => (
                        <tr key={i} style={{ background: b._returned ? 'rgba(234,179,8,0.04)' : undefined }}>
                          <td>
                            <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.bill_number}</span>
                            {b._returned && <div style={{ fontSize: 9, color: 'var(--yellow)', marginTop: 1 }}>↩️ partial return</div>}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.date).toLocaleDateString()}</td>
                          <td style={{ fontWeight: 600 }}>{b.product_name}</td>
                          <td>{parseFloat(b.quantity).toFixed(2)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmt(b.selling_price)}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(b.total_amount)}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{fmt(b.taxable_amount)}</td>
                          <td>
                            <div><span className="badge badge-blue">{b.tax_rate}%</span></div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>CGST {b.cgst_rate}% + SGST {b.sgst_rate}%</div>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(b.cgst)}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(b.sgst)}</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {adjustedItems.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                          <td colSpan={6} style={{ padding: '8px 12px', textAlign: 'right' }}>Grand Total</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{fmt(adjTaxable)}</td>
                          <td></td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{fmt(adjCgst)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{fmt(adjSgst)}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(adjTax)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {adjustedItems.length === 0 && <div className="empty-state"><div className="icon">🧾</div>No tax data for items with tax rate &gt; 0</div>}
                </div>
              </>
            );
          })()}

          {/* ── Purchase Tax — with filter dropdown ── */}
          {tab === 'purtax' && (
            <>
              {/* ── Purchase Tax Rate Dropdown ── */}
              <TaxRateFilter
                value={purTaxRateFilter}
                onChange={setPurTaxRateFilter}
                availableRates={
                  purTaxData?.available_tax_rates ||
                  [...new Set((purTaxData?.bills||[]).flatMap(b=>(b.items||[]).map(i=>i.tax_rate)).filter(Boolean))].sort((a,b)=>a-b) ||
                  purTaxAvailableRates
                }
              />

              {purTaxData && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
                  {[
                    { label: 'Taxable Amount', value: fmt(purTaxData.grand_taxable), color: 'var(--text)' },
                    { label: 'Total CGST',     value: fmt(purTaxData.grand_cgst),    color: 'var(--blue)' },
                    { label: 'Total SGST',     value: fmt(purTaxData.grand_sgst),    color: 'var(--purple)' },
                    { label: 'Grand Total',    value: fmt(purTaxData.grand_total),   color: 'var(--accent)' },
                  ].map(s => (
                    <div key={s.label} className="stat-card"><div className="label">{s.label}</div><div className="value" style={{ color: s.color }}>{s.value}</div></div>
                  ))}
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>PO No</th><th>Date</th><th>Vendor</th><th>Taxable Amt</th><th>CGST</th><th>SGST</th><th>Total Tax</th><th>Total Amount</th></tr></thead>
                  <tbody>
                    {(purTaxData?.bills || []).map((b, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{b.purchase_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.date).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600 }}>{b.vendor_name}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{fmt(b.taxable_amount)}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(b.cgst)}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(b.sgst)}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{fmt(b.total_tax)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!purTaxData || purTaxData.bills.length === 0) && <div className="empty-state"><div className="icon">🧾</div>No purchase tax data</div>}
              </div>
            </>
          )}

          {/* ── Direct Sale ── */}
          {tab === 'direct' && (
            <>
              {directData && directData.sales && directData.sales.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
                  <div className="stat-card"><div className="label">Grand Total</div><div className="value" style={{ color: 'var(--accent)' }}>{fmt(directData.grand_total)}</div></div>
                  <div className="stat-card"><div className="label">Cash</div><div className="value" style={{ color: 'var(--green)' }}>{fmt(directData.cash_total)}</div></div>
                  <div className="stat-card"><div className="label">Card</div><div className="value" style={{ color: 'var(--blue)' }}>{fmt(directData.card_total)}</div></div>
                  <div className="stat-card"><div className="label">UPI</div><div className="value" style={{ color: 'var(--purple)' }}>{fmt(directData.upi_total)}</div></div>
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>DS No</th><th>Date</th><th>Item Name</th><th>Amount</th><th>Payment</th><th>By</th></tr></thead>
                  <tbody>
                    {(directData?.sales || []).map((s, i) => (
                      <tr key={i}>
                        <td><span className="badge badge-green" style={{ fontFamily: 'var(--mono)' }}>{s.sale_number || '—'}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(s.date).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmt(s.price)}</td>
                        <td><span className="badge badge-blue">{payLabel[s.payment_type] || s.payment_type}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!directData || !directData.sales || directData.sales.length === 0) && <div className="empty-state"><div className="icon">💵</div>No direct sales in this period</div>}
              </div>
            </>
          )}
        </>
      )}

      {/* Modals */}
      {showPrintModal    && <PrintModal title="Print Sale Report"            onClose={() => setShowPrintModal(false)}    onPrint={handleSalePrint} />}
      {showPurPrint      && <PrintModal title="Print Purchase Report"        onClose={() => setShowPurPrint(false)}      onPrint={handlePurchasePrint} />}
      {showSalesTaxPrint && <PrintModal title={`Print Sales Tax Report${salesTaxRateFilter ? ` (${salesTaxRateFilter}%)` : ''}`} onClose={() => setShowSalesTaxPrint(false)} onPrint={handleSalesTaxPrint} />}
      {showPurTaxPrint   && <PrintModal title={`Print Purchase Tax Report${purTaxRateFilter ? ` (${purTaxRateFilter}%)` : ''}`} onClose={() => setShowPurTaxPrint(false)}   onPrint={handlePurTaxPrint} />}
      {showPurRetPrint   && <PrintModal title="Print Purchase Return Report" onClose={() => setShowPurRetPrint(false)}   onPrint={handlePurRetPrint} />}
      {showItemwisePrint && <PrintModal title="Print Item-wise Sale Report"  onClose={() => setShowItemwisePrint(false)} onPrint={handleItemwisePrint} />}
      {showInternalPrint && <PrintModal title="Print Internal Sale Report"   onClose={() => setShowInternalPrint(false)} onPrint={handleInternalPrint} />}
      {showDirectPrint   && <PrintModal title="Print Direct Sale Report"     onClose={() => setShowDirectPrint(false)}  onPrint={handleDirectPrint} />}
      {showIRPrint       && <PrintModal title="Print Item Return Report"     onClose={() => setShowIRPrint(false)}       onPrint={handleItemReturnPrint} />}
      {detailBillId      && <PurchaseBillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />}
      {showPendingRet    && purRetData && <PendingReturnsModal returns={purRetData.returns} onClose={() => setShowPendingRet(false)} />}
      {purListModal      && <PurchaseBillsListModal bills={purListModal.bills} title={purListModal.title} onClose={() => setPurListModal(null)} onViewDetail={id => { setPurListModal(null); setDetailBillId(id); }} />}
      {itemRetDetail     && <ItemReturnDetailModal ret={itemRetDetail} onClose={() => setItemRetDetail(null)} />}
      {intBillDetail     && <InternalSaleBillDetailModal bill={intBillDetail} onClose={() => setIntBillDetail(null)} />}
    </div>
  );
}