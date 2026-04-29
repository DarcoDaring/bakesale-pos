import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCReport } from './kaapiApi';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];

const PAY_BADGE = {
  cash: 'badge-green', card: 'badge-blue', upi: 'badge-purple',
  cash_card: 'badge-yellow', cash_upi: 'badge-yellow',
};
const PAY_LABEL = {
  cash: '💵 Cash', card: '💳 Card', upi: '📱 UPI',
  cash_card: '💵+💳 Split', cash_upi: '💵+📱 Split',
};

function printHTML(html, title) {
  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) { toast.error('Allow popups to print'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#000}
    h2{text-align:center;font-size:16px;margin-bottom:4px}
    .meta{text-align:center;font-size:11px;color:#555;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f0f0f0;border:1px solid #ccc;padding:5px 8px;font-size:11px;text-align:left}
    td{border:1px solid #ccc;padding:5px 8px;font-size:12px}
    .total{font-weight:700;background:#f9f9f9}
    .section{font-weight:700;font-size:13px;margin:12px 0 4px;border-bottom:1px solid #000;padding-bottom:3px}
    @media print{body{padding:0}}
  </style></head><body>${html}
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  win.document.close();
}

const TABS = [
  { k: 'daily_sale',  label: 'Daily Sale' },
  { k: 'itemwise',    label: 'Item-wise Sale' },
  { k: 'purchase',    label: 'Purchase Report' },
  { k: 'balance',     label: 'Balance / Stock' },
  { k: 'store_issue', label: 'Store Issue' },
];

export default function KCReportPage() {
  const navigate = useNavigate();
  const [tab, setTab]             = useState('daily_sale');
  const [dateFrom, setDateFrom]   = useState(today());
  const [dateTo, setDateTo]       = useState(today());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [issueView, setIssueView] = useState('summary');

  const loadReport = async () => {
    setLoading(true);
    try {
      const { data: d } = await getKCReport({ type: tab, date_from: dateFrom, date_to: dateTo });
      setData(d);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadReport(); }, [tab]);

  const handlePrint = () => {
    if (!data) return;
    const heading = `<h2>☕ KAAPI CHAI</h2><div class="meta">${TABS.find(t => t.k === tab)?.label} | ${dateFrom} to ${dateTo} | Printed: ${new Date().toLocaleString('en-IN')}</div>`;
    let body = '';

    if (tab === 'daily_sale') {
      body = `
        <div class="section">Summary</div>
        <table><tbody>
          <tr><td>Total Bills</td><td style="text-align:right;font-weight:700">${data.total_bills || 0}</td></tr>
          <tr><td>Grand Total</td><td style="text-align:right;font-weight:700">${fmt(data.grand_total)}</td></tr>
          <tr><td>💵 Cash Total</td><td style="text-align:right;font-weight:700">${fmt(data.cash_total)}</td></tr>
          <tr><td>💳 Card Total</td><td style="text-align:right;font-weight:700">${fmt(data.card_total)}</td></tr>
          <tr><td>📱 UPI Total</td><td style="text-align:right;font-weight:700">${fmt(data.upi_total)}</td></tr>
        </tbody></table>
        <div class="section">Bills</div>
        <table><thead><tr><th>Bill No</th><th>Payment</th><th>Date</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${(data.bills || []).map(b => `<tr><td>${b.bill_number}</td><td>${PAY_LABEL[b.payment_type] || 'Cash'}</td><td>${new Date(b.created_at).toLocaleString('en-IN')}</td><td style="text-align:right">${fmt(b.total)}</td></tr>`).join('')}
        <tr class="total"><td colspan="3">Grand Total</td><td style="text-align:right">${fmt(data.grand_total)}</td></tr>
        </tbody></table>`;
    }

    if (tab === 'itemwise') {
      body = `<table><thead><tr><th>Item</th><th>Qty Sold</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${(data.items || []).map(i => `<tr><td>${i.item_name}</td><td style="text-align:center">${i.total_qty}</td><td style="text-align:right">${fmt(i.total_amount)}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Grand Total</td><td style="text-align:right">${fmt(data.grand_total)}</td></tr>
      </tbody></table>`;
    }

    if (tab === 'purchase') {
      body = `<table><thead><tr><th>Purchase No</th><th>Date</th><th>Item</th><th>Purchased</th><th>Sold</th><th>Balance</th><th>Sale Amt</th></tr></thead><tbody>
      ${(data.purchases || []).map(p => (p.lines || []).map(l => `<tr><td>${p.purchase_number}</td><td>${new Date(p.created_at).toLocaleDateString('en-IN')}</td><td>${l.item_name}</td><td>${l.purchased_qty}</td><td>${l.sold_qty}</td><td>${l.balance_qty}</td><td>${fmt(l.sale_amount)}</td></tr>`).join('')).join('')}
      </tbody></table>`;
    }

    if (tab === 'balance') {
      body = `<table><thead><tr><th>Date</th><th>Item</th><th>Balance Qty</th><th>Carry Forward</th></tr></thead><tbody>
      ${(data.stock || []).map(s => (s.lines || []).map(l => `<tr><td>${new Date(s.created_at).toLocaleDateString('en-IN')}</td><td>${l.item_name}</td><td style="text-align:center">${l.qty}</td><td style="text-align:center">${l.carry_forward ? 'Yes' : 'No'}</td></tr>`).join('')).join('')}
      </tbody></table>`;
    }

    if (tab === 'store_issue') {
      const summary = data.item_summary || [];
      body = `
        <div class="section">Store Issue Summary</div>
        <table><thead><tr>
          <th>Item</th><th>Unit</th>
          <th style="text-align:center">Issued Qty</th>
          <th style="text-align:right">Issue Cost</th>
          <th style="text-align:center">Closing Qty</th>
          <th style="text-align:right">Closing Cost</th>
          <th style="text-align:right">Cost of Goods Sold</th>
        </tr></thead><tbody>
        ${summary.map(s => {
          const cogs = Math.max(s.issue_cost - s.closing_cost, 0);
          return `<tr>
            <td>${s.item_name}</td>
            <td>${s.unit}</td>
            <td style="text-align:center">${s.issued_qty}</td>
            <td style="text-align:right">${fmt(s.issue_cost)}</td>
            <td style="text-align:center">${s.closing_qty > 0 ? s.closing_qty : '—'}</td>
            <td style="text-align:right">${s.closing_qty > 0 ? fmt(s.closing_cost) : '—'}</td>
            <td style="text-align:right;font-weight:700">${fmt(cogs)}</td>
          </tr>`;
        }).join('')}
        <tr class="total">
          <td colspan="3">Total</td>
          <td style="text-align:right">${fmt(summary.reduce((s, i) => s + i.issue_cost, 0))}</td>
          <td></td>
          <td style="text-align:right">${fmt(summary.reduce((s, i) => s + i.closing_cost, 0))}</td>
          <td style="text-align:right">${fmt(summary.reduce((s, i) => s + Math.max(i.issue_cost - i.closing_cost, 0), 0))}</td>
        </tr>
        </tbody></table>`;
    }

    printHTML(heading + body, `${TABS.find(t => t.k === tab)?.label} Report`);
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/kaapi-chai')}>← Back</button>
          <h1>📊 Report</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 160 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ width: 160 }} />
          <button className="btn btn-primary btn-sm" onClick={loadReport}>Load</button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrint}>🖨️ Print</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} className="btn btn-sm" onClick={() => setTab(t.k)}
            style={{
              background: tab === t.k ? 'var(--accent)' : 'var(--surface)',
              color:      tab === t.k ? '#fff' : 'var(--text2)',
              border:    `1px solid ${tab === t.k ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: tab === t.k ? 700 : 400,
            }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : !data ? (
        <div className="empty-state"><div className="icon">📊</div>Select date range and click Load</div>
      ) : (
        <>
          {/* ── Daily Sale ── */}
          {tab === 'daily_sale' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                <div className="stat-card" style={{ borderColor: 'var(--accent)' }}>
                  <div className="label">Grand Total</div>
                  <div className="value" style={{ color: 'var(--accent)' }}>{fmt(data.grand_total)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{data.total_bills || 0} bills</div>
                </div>
                <div className="stat-card">
                  <div className="label">💵 Cash</div>
                  <div className="value" style={{ color: 'var(--green)' }}>{fmt(data.cash_total || 0)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">💳 Card</div>
                  <div className="value" style={{ color: 'var(--blue)' }}>{fmt(data.card_total || 0)}</div>
                </div>
                <div className="stat-card">
                  <div className="label">📱 UPI</div>
                  <div className="value" style={{ color: 'var(--purple)' }}>{fmt(data.upi_total || 0)}</div>
                </div>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Bill No</th><th>Date &amp; Time</th><th>Payment</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.bills || []).map(b => (
                      <tr key={b.id}>
                        <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                        <td><span className={`badge ${PAY_BADGE[b.payment_type] || 'badge-green'}`}>{PAY_LABEL[b.payment_type] || '💵 Cash'}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {(data.bills || []).length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                        <td colSpan={3} style={{ textAlign: 'right', padding: '10px 14px' }}>Grand Total</td>
                        <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 16 }}>{fmt(data.grand_total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {(data.bills || []).length === 0 && <div className="empty-state"><div className="icon">🧾</div>No bills in this period</div>}
              </div>
            </>
          )}

          {/* ── Item-wise ── */}
          {tab === 'itemwise' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Item Name</th><th style={{ textAlign: 'center' }}>Qty Sold</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                <tbody>
                  {(data.items || []).map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}><span className="badge badge-blue">{parseFloat(item.total_qty).toFixed(0)}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {(data.items || []).length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                      <td colSpan={2} style={{ textAlign: 'right', padding: '10px 14px' }}>Grand Total</td>
                      <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 16 }}>{fmt(data.grand_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {(data.items || []).length === 0 && <div className="empty-state"><div className="icon">📦</div>No sales in this period</div>}
            </div>
          )}

          {/* ── Purchase ── */}
          {tab === 'purchase' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {(data.purchases || []).map(p => (
                <div key={p.id} style={{ borderBottom: '2px solid var(--border)', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{p.purchase_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(p.created_at).toLocaleString('en-IN')}</span>
                    {p.group_name && <span className="badge badge-blue">{p.group_name}</span>}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'center' }}>Purchased</th>
                        <th style={{ textAlign: 'center' }}>Carried In</th>
                        <th style={{ textAlign: 'center' }}>Sold Qty</th>
                        <th style={{ textAlign: 'right' }}>Sale Amount</th>
                        <th style={{ textAlign: 'center' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(p.lines || []).map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{l.purchased_qty}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{l.carried_qty > 0 ? `+${l.carried_qty}` : '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{l.sold_qty > 0 ? l.sold_qty : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{l.sale_amount > 0 ? fmt(l.sale_amount) : '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, fontFamily: 'var(--mono)',
                            color: l.balance_qty <= 0 ? 'var(--red)' : l.balance_qty <= 3 ? 'var(--yellow)' : 'var(--green)' }}>
                            {l.balance_qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {p.lines && p.lines.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                          <td style={{ padding: '8px 14px' }}>Total</td>
                          <td style={{ textAlign: 'center', padding: '8px 14px', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{p.lines.reduce((s, l) => s + l.purchased_qty, 0)}</td>
                          <td></td>
                          <td style={{ textAlign: 'center', padding: '8px 14px', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{p.lines.reduce((s, l) => s + l.sold_qty, 0)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(p.lines.reduce((s, l) => s + l.sale_amount, 0))}</td>
                          <td style={{ textAlign: 'center', padding: '8px 14px', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{p.lines.reduce((s, l) => s + l.balance_qty, 0)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              ))}
              {(data.purchases || []).length === 0 && <div className="empty-state"><div className="icon">📦</div>No purchases in this period</div>}
            </div>
          )}

          {/* ── Balance/Stock ── */}
          {tab === 'balance' && (
            <div>
              {(data.stock || []).map(s => (
                <div key={s.id} className="card" style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)' }}>{s.stock_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(s.created_at).toLocaleString('en-IN')}</span>
                  </div>
                  <table>
                    <thead><tr><th>Item</th><th style={{ textAlign: 'center' }}>Balance Qty</th><th style={{ textAlign: 'center' }}>Carry Forward</th></tr></thead>
                    <tbody>
                      {(s.lines || []).map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{l.qty}</td>
                          <td style={{ textAlign: 'center' }}>
                            {l.carry_forward ? <span className="badge badge-green">✓ Yes</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>No</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {(data.stock || []).length === 0 && <div className="empty-state"><div className="icon">🗃️</div>No balance stock records in this period</div>}
            </div>
          )}

          {/* ── Store Issue ── */}
          {tab === 'store_issue' && (
            <>
              {/* View toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { k: 'summary', label: '📊 Summary' },
                  { k: 'detail',  label: '📋 Detailed' },
                ].map(v => (
                  <button key={v.k} className="btn btn-sm" onClick={() => setIssueView(v.k)}
                    style={{
                      background: issueView === v.k ? 'var(--accent)' : 'var(--surface)',
                      color:      issueView === v.k ? '#fff' : 'var(--text2)',
                      border:    `1px solid ${issueView === v.k ? 'var(--accent)' : 'var(--border)'}`,
                      fontWeight: issueView === v.k ? 700 : 400,
                    }}>{v.label}</button>
                ))}
              </div>

              {/* ── Summary view ── */}
              {issueView === 'summary' && (() => {
                const summary          = data.item_summary || [];
                const totalIssueCost   = summary.reduce((s, i) => s + i.issue_cost, 0);
                const totalClosingCost = summary.reduce((s, i) => s + i.closing_cost, 0);
                // COGS = Issue Cost − Closing Cost
                const totalCOGS        = summary.reduce((s, i) => s + Math.max(i.issue_cost - i.closing_cost, 0), 0);

                return (
                  <>
                    {/* Stat cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                      <div className="stat-card">
                        <div className="label">Total Issue Cost</div>
                        <div className="value" style={{ color: 'var(--accent)' }}>{fmt(totalIssueCost)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>cost of all items issued</div>
                      </div>
                      <div className="stat-card">
                        <div className="label">Total Closing Cost</div>
                        <div className="value" style={{ color: 'var(--yellow)' }}>{fmt(totalClosingCost)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>value of remaining stock</div>
                      </div>
                      <div className="stat-card" style={{ borderColor: 'var(--green)' }}>
                        <div className="label">Cost of Goods Sold</div>
                        <div className="value" style={{ color: 'var(--green)' }}>{fmt(totalCOGS)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Issue Cost − Closing Cost</div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Item Name</th>
                            <th>Unit</th>
                            <th style={{ textAlign: 'center' }}>Issued Qty</th>
                            <th style={{ textAlign: 'right' }}>Issue Cost</th>
                            <th style={{ textAlign: 'center' }}>Closing Qty</th>
                            <th style={{ textAlign: 'right' }}>Closing Cost</th>
                            <th style={{ textAlign: 'right', color: 'var(--green)' }}>Cost of Goods Sold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.map((s, i) => {
                            const cogs = Math.max(s.issue_cost - s.closing_cost, 0);
                            return (
                              <tr key={i}>
                                <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                                <td><span className="badge badge-blue">{s.unit}</span></td>
                                <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                                  {s.issued_qty}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>
                                  {fmt(s.issue_cost)}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)',
                                  color: s.closing_qty > 0 ? 'var(--yellow)' : 'var(--text3)' }}>
                                  {s.closing_qty > 0 ? s.closing_qty : '—'}
                                  {s.closing_qty > 0 && s.closing_updated && (
                                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                                      {new Date(s.closing_updated).toLocaleDateString('en-IN')}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)',
                                  color: s.closing_cost > 0 ? 'var(--yellow)' : 'var(--text3)', fontWeight: 700 }}>
                                  {s.closing_cost > 0 ? fmt(s.closing_cost) : '—'}
                                </td>
                                {/* COGS = Issue Cost − Closing Cost */}
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--green)' }}>
                                  {fmt(cogs)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {summary.length > 0 && (
                          <tfoot>
                            <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                              <td colSpan={3} style={{ textAlign: 'right', padding: '12px 14px', fontSize: 14 }}>Total</td>
                              {/* Issue Cost total */}
                              <td style={{ textAlign: 'right', padding: '12px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 15 }}>
                                {fmt(totalIssueCost)}
                              </td>
                              {/* Closing Qty — blank */}
                              <td></td>
                              {/* Closing Cost total */}
                              <td style={{ textAlign: 'right', padding: '12px 14px', color: 'var(--yellow)', fontFamily: 'var(--mono)', fontSize: 15 }}>
                                {fmt(totalClosingCost)}
                              </td>
                              {/* COGS total */}
                              <td style={{ textAlign: 'right', padding: '12px 14px', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 16 }}>
                                {fmt(totalCOGS)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      {summary.length === 0 && <div className="empty-state"><div className="icon">🏪</div>No store issues in this period</div>}
                    </div>
                  </>
                );
              })()}

              {/* ── Detailed view (raw issues) ── */}
              {issueView === 'detail' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Issue No</th><th>Date</th><th>Item</th><th>Unit</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Cost</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.issues || []).map((s, i) => (
                        <tr key={i}>
                          <td><span className="badge badge-purple" style={{ fontFamily: 'var(--mono)' }}>{s.issue_number}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(s.created_at).toLocaleString('en-IN')}</td>
                          <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                          <td><span className="badge badge-blue">{s.unit}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{s.qty}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(s.cost)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {(data.issues || []).length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                          <td colSpan={6} style={{ textAlign: 'right', padding: '10px 14px' }}>Grand Total</td>
                          <td style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 16 }}>{fmt(data.grand_total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {(data.issues || []).length === 0 && <div className="empty-state"><div className="icon">🏪</div>No store issues in this period</div>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}