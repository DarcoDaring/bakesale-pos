import React, { useEffect } from 'react';
import { usePrinter } from '../hooks/usePrinter';

const payLabel = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  cash_card: 'Cash & Card', cash_upi: 'Cash & UPI',
};


export default function PrintBill({ bill, onClose }) {
  const { printBill } = usePrinter();

  const doPrint = () => {
    if (!bill) return;

    const items  = bill.items || [];
    const total  = parseFloat(bill.total_amount || 0);
    let totalTax = 0;
    items.forEach(item => {
      const r = parseFloat(item.tax || 0);
      const s = parseFloat(item.price || 0) * parseFloat(item.quantity || 0);
      if (r > 0) totalTax += s - s / (1 + r / 100);
    });

    const fmtRs = n => `Rs.${parseFloat(n || 0).toFixed(2)}`;
    const sep = `<hr style="border:none;border-top:1px dashed #000;margin:5px 0">`;

    const infoHtml = [
      ['Bill No',  bill.bill_number,  700],
      ['Date',     new Date(bill.created_at).toLocaleDateString('en-IN'),  400],
      ['Time',     new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),  400],
      ['Payment',  payLabel[bill.payment_type] || bill.payment_type,  400],
      ...(bill.created_by_username ? [['Cashier', bill.created_by_username, 400]] : []),
    ].map(([l, v, w]) =>
      `<tr>
        <td style="padding:2px 0;font-size:12px">${l}</td>
        <td style="padding:2px 0;font-size:12px;text-align:right;font-weight:${w}">${v}</td>
      </tr>`
    ).join('');

    const itemRows = items.map(item => {
      const qty = parseFloat(item.quantity || 0);
      const sub = qty * parseFloat(item.price || 0);
      return `<tr>
        <td style="padding:3px 0;font-size:12px;word-break:break-word;vertical-align:top">${item.product_name || ''}</td>
        <td style="padding:3px 2px;font-size:12px;text-align:center;white-space:nowrap;vertical-align:top">${qty % 1 === 0 ? qty : qty.toFixed(3)}</td>
        <td style="padding:3px 0;font-size:12px;text-align:right;white-space:nowrap;vertical-align:top">${fmtRs(sub)}</td>
      </tr>`;
    }).join('');

    const taxSection = totalTax > 0 ? `
      ${sep}
      <table width="100%" style="border-collapse:collapse;font-size:12px;font-weight:700">
        <tr><td style="padding:2px 0">Taxable Amount</td><td style="padding:2px 0;text-align:right">${fmtRs(total - totalTax)}</td></tr>
        <tr><td style="padding:2px 0">CGST</td><td style="padding:2px 0;text-align:right">${fmtRs(totalTax / 2)}</td></tr>
        <tr><td style="padding:2px 0">SGST</td><td style="padding:2px 0;text-align:right">${fmtRs(totalTax / 2)}</td></tr>
      </table>
      ${sep}
      <table width="100%" style="border-collapse:collapse;font-size:12px;font-weight:900">
        <tr><td style="padding:2px 0">Total Tax</td><td style="padding:2px 0;text-align:right">${fmtRs(totalTax)}</td></tr>
      </table>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
@page { size: 80mm auto; margin: 0; }
html, body {
  width: 100%;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { padding: 2mm 1mm; }
table { width:100%; border-collapse:collapse; font-family:inherit; }
</style></head><body>

<div style="text-align:center;margin-bottom:6px">
  <div style="font-size:22px;font-weight:900;letter-spacing:2px">ALTHAHANI</div>
  <div style="font-size:9px;font-weight:400;line-height:1.7;margin-top:3px">
    GST IN: 27AAACB7450P1ZV<br>FSSAI: 10012022000234<br>MOB: 8921201010
  </div>
</div>

${sep}

<table>
  <colgroup><col style="width:48%"><col style="width:52%"></colgroup>
  <tbody>${infoHtml}</tbody>
</table>

${sep}

<table style="font-size:11px;font-weight:700">
  <colgroup><col style="width:55%"><col style="width:15%"><col style="width:30%"></colgroup>
  <thead>
    <tr>
      <th style="text-align:left;padding-bottom:4px">Item</th>
      <th style="text-align:center;padding-bottom:4px">Qty</th>
      <th style="text-align:right;padding-bottom:4px">Amount</th>
    </tr>
    <tr><th colspan="3" style="border-top:1px dashed #000;padding:2px 0 0"></th></tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

${taxSection}

${sep}

<table style="font-weight:900">
  <tr>
    <td style="font-size:16px">TOTAL</td>
    <td style="font-size:16px;text-align:right">${fmtRs(total)}</td>
  </tr>
</table>

${sep}

<p style="text-align:center;font-size:10px;font-weight:400;margin-top:3px">Items sold are non-returnable</p>
<br><br>
</body></html>`;

    printBill(html, { width: 80000, height: 2000000 });
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); doPrint(); }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, bill]);

  if (!bill) return null;

  // ── Screen preview ──
  const items   = bill.items || [];
  const total   = parseFloat(bill.total_amount || 0);
  let totalTax  = 0;
  items.forEach(item => {
    const r = parseFloat(item.tax || 0);
    const s = parseFloat(item.price || 0) * parseFloat(item.quantity || 0);
    if (r > 0) totalTax += s - s / (1 + r / 100);
  });
  const fmtRs = n => `Rs.${parseFloat(n || 0).toFixed(2)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div className="no-print" style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={doPrint}>
            🖨️ Print Bill (Enter)
          </button>
          <button className="btn btn-secondary" onClick={onClose}>✕ Close (Esc)</button>
        </div>

        <div style={{ padding: '20px 24px', fontFamily: 'monospace', fontSize: 13, color: '#000', background: '#fff', lineHeight: 1.6 }}>

          {/* ── Header ── */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>ALTHAHANI</div>
            <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
              GST IN: 27AAACB7450P1ZV<br />
              FSSAI: 10012022000234<br />
              MOB: 8921201010
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Bill info */}
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            {[
              ['Bill No',  bill.bill_number],
              ['Date',     new Date(bill.created_at).toLocaleDateString('en-IN')],
              ['Time',     new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })],
              ['Payment',  payLabel[bill.payment_type] || bill.payment_type],
              ...(bill.created_by_username ? [['Cashier', bill.created_by_username]] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span style={{ fontWeight: label === 'Bill No' ? 700 : 400 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Items header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px', gap: 10, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            <span>Item</span>
            <span style={{ textAlign: 'center' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
          </div>

          {/* Items */}
          {items.map((item, i) => {
            const qty      = parseFloat(item.quantity || 0);
            const price    = parseFloat(item.price    || 0);
            const subtotal = qty * price;
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px', gap: 10, fontSize: 12, alignItems: 'start' }}>
                  <span style={{ fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3 }}>{item.product_name}</span>
                  <span style={{ textAlign: 'center', color: '#555' }}>{qty % 1 === 0 ? qty : qty.toFixed(3)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmtRs(subtotal)}</span>
                </div>
              </div>
            );
          })}

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Tax breakdown */}
          {totalTax > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              {[
                ['Taxable Amount', fmtRs(total - totalTax)],
                ['CGST',          fmtRs(totalTax / 2)],
                ['SGST',          fmtRs(totalTax / 2)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{label}</span><span>{value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total Tax</span><span>{fmtRs(totalTax)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            </div>
          )}

          {/* Grand total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, marginTop: 4 }}>
            <span>TOTAL</span><span>{fmtRs(total)}</span>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '12px 0 8px' }} />

          {/* ── Footer ── */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#888' }}>
            <div>Items sold are non-returnable</div>
          </div>

        </div>
      </div>
    </div>
  );
}