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

    const infoRows = [
      ['Bill No',  bill.bill_number,  true],
      ['Date',     new Date(bill.created_at).toLocaleDateString('en-IN'),  false],
      ['Time',     new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),  false],
      ['Payment',  payLabel[bill.payment_type] || bill.payment_type,  false],
      ...(bill.created_by_username ? [['Cashier', bill.created_by_username, false]] : []),
    ];

    const itemsHtml = items.map(item => {
      const qty      = parseFloat(item.quantity || 0);
      const price    = parseFloat(item.price    || 0);
      const subtotal = qty * price;
      return `<div style="display:grid;grid-template-columns:1fr 44px 80px;gap:6px;font-size:12px;margin-bottom:5px;align-items:start">
        <span style="font-weight:600;word-break:break-word;line-height:1.3">${item.product_name || ''}</span>
        <span style="text-align:center;color:#444">${qty % 1 === 0 ? qty : qty.toFixed(3)}</span>
        <span style="text-align:right;font-weight:600">${fmtRs(subtotal)}</span>
      </div>`;
    }).join('');

    const taxHtml = totalTax > 0 ? `
      <div style="font-size:12px;margin-bottom:4px">
        ${[['Taxable Amount', fmtRs(total - totalTax)], ['CGST', fmtRs(totalTax / 2)], ['SGST', fmtRs(totalTax / 2)]]
          .map(([l, v]) => `<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${v}</span></div>`).join('')}
      </div>
      <div style="border-top:1px dashed #999;margin:6px 0"></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:12px;margin-bottom:4px">
        <span>Total Tax</span><span>${fmtRs(totalTax)}</span>
      </div>
      <div style="border-top:1px dashed #999;margin:6px 0"></div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 2mm 3mm; }
html, body { margin: 0; padding: 0; width: 74mm;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px; color: #000; background: #fff;
  line-height: 1.6; -webkit-print-color-adjust: exact; }
</style></head><body>
  <div style="text-align:center;margin-bottom:10px">
    <div style="font-size:22px;font-weight:900;letter-spacing:2px">ALTHAHANI</div>
    <div style="font-size:9px;color:#555;margin-top:2px">
      GST IN: 27AAACB7450P1ZV<br>FSSAI: 10012022000234<br>MOB: 8921201010
    </div>
  </div>
  <div style="border-top:1px dashed #999;margin:6px 0"></div>
  <div style="font-size:12px;margin-bottom:6px">
    ${infoRows.map(([l, v, bold]) =>
      `<div style="display:flex;justify-content:space-between">
        <span>${l}</span>
        <span style="font-weight:${bold ? '700' : '400'}">${v}</span>
      </div>`).join('')}
  </div>
  <div style="border-top:1px dashed #999;margin:6px 0"></div>
  <div style="display:grid;grid-template-columns:1fr 44px 80px;gap:6px;font-size:11px;font-weight:700;margin-bottom:4px">
    <span>Item</span>
    <span style="text-align:center">Qty</span>
    <span style="text-align:right">Amount</span>
  </div>
  <div style="border-top:1px dashed #999;margin:4px 0 6px"></div>
  ${itemsHtml}
  <div style="border-top:1px dashed #999;margin:6px 0"></div>
  ${taxHtml}
  <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;margin-top:4px">
    <span>TOTAL</span><span>${fmtRs(total)}</span>
  </div>
  <div style="border-top:1px dashed #999;margin:10px 0 6px"></div>
  <div style="text-align:center;font-size:11px;color:#888">Items sold are non-returnable</div>
  <br><br><br>
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