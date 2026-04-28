import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getKCReport } from './kaapiApi';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;
const today = () => new Date().toISOString().split('T')[0];

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
  const [tab, setTab]         = useState('daily_sale');
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo]   = useState(today());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);

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
        </tbody></table>
        <div class="section">Bills</div>
        <table><thead><tr><th>Bill No</th><th>Date</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${(data.bills || []).map(b => `<tr><td>${b.bill_number}</td><td>${new Date(b.created_at).toLocaleString('en-IN')}</td><td style="text-align:right">${fmt(b.total)}</td></tr>`).join('')}
        <tr class="total"><td colspan="2">Grand Total</td><td style="text-align:right">${fmt(data.grand_total)}</td></tr>
        </tbody></table>`;
    }
    if (tab === 'itemwise') {
      body = `<table><thead><tr><th>Item</th><th>Qty Sold</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${(data.items || []).map(i => `<tr><td>${i.item_name}</td><td style="text-align:center">${i.total_qty}</td><td style="text-align:right">${fmt(i.total_amount)}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Grand Total</td><td style="text-align:right">${fmt(data.grand_total)}</td></tr>
      </tbody></table>`;
    }
    if (tab === 'purchase') {
      body = `<table><thead><tr><th>Purchase No</th><th>Date</th><th>Group</th></tr></thead><tbody>
      ${(data.purchases || []).map(p => `<tr><td>${p.purchase_number}</td><td>${new Date(p.created_at).toLocaleString('en-IN')}</td><td>${p.group_name || '—'}</td></tr>`).join('')}
      </tbody></table>`;
    }
    if (tab === 'balance') {
      body = `<table><thead><tr><th>Date</th><th>Item</th><th>Balance Qty</th><th>Carry Forward</th></tr></thead><tbody>
      ${(data.stock || []).map(s => (s.lines || []).map(l => `<tr><td>${new Date(s.created_at).toLocaleDateString('en-IN')}</td><td>${l.item_name}</td><td style="text-align:center">${l.qty}</td><td style="text-align:center">${l.carry_forward ? 'Yes' : 'No'}</td></tr>`).join('')).join('')}
      </tbody></table>`;
    }
    if (tab === 'store_issue') {
      body = `<table><thead><tr><th>Issue No</th><th>Date</th><th>Item</th><th>Unit</th><th>Qty</th><th>Cost</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${(data.issues || []).map(s => `<tr><td>${s.issue_number}</td><td>${new Date(s.created_at).toLocaleString('en-IN')}</td><td>${s.item_name}</td><td>${s.unit}</td><td style="text-align:center">${s.qty}</td><td style="text-align:right">${fmt(s.cost)}</td><td style="text-align:right">${fmt(s.total)}</td></tr>`).join('')}
      <tr class="total"><td colspan="6">Grand Total</td><td style="text-align:right">${fmt(data.grand_total)}</td></tr>
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
          <button
            key={t.k}
            className="btn btn-sm"
            onClick={() => setTab(t.k)}
            style={{
              background:  tab === t.k ? 'var(--accent)' : 'var(--surface)',
              color:       tab === t.k ? '#fff' : 'var(--text2)',
              border:     `1px solid ${tab === t.k ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight:  tab === t.k ? 700 : 400,
            }}
          >{t.label}</button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : !data ? (
        <div className="empty-state"><div className="icon">📊</div>Select date range and click Load</div>
      ) : (
        <>
          {/* ── Daily Sale ── */}
          {tab === 'daily_sale' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
                <div className="stat-card">
                  <div className="label">Total Bills</div>
                  <div className="value">{data.total_bills || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Grand Total</div>
                  <div className="value" style={{ color: 'var(--accent)' }}>{fmt(data.grand_total)}</div>
                </div>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Bill No</th><th>Date &amp; Time</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {(data.bills || []).map(b => (
                      <tr key={b.id}>
                        <td><span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{b.bill_number}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(b.created_at).toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{fmt(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {(data.bills || []).length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg2)', fontWeight: 800 }}>
                        <td colSpan={2} style={{ textAlign: 'right', padding: '10px 14px' }}>Grand Total</td>
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
                <div key={p.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                    <span className="badge badge-orange" style={{ fontFamily: 'var(--mono)' }}>{p.purchase_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(p.created_at).toLocaleString('en-IN')}</span>
                    {p.group_name && <span className="badge badge-blue">{p.group_name}</span>}
                  </div>
                  <table>
                    <thead><tr><th>Item</th><th style={{ textAlign: 'center' }}>Qty</th></tr></thead>
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
              {(data.stock || []).length === 0 && <div className="empty-state"><div className="icon">🗃️</div>No balance stock records in this period</div>}
            </div>
          )}

          {/* ── Store Issue ── */}
          {tab === 'store_issue' && (
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
    </div>
  );
}