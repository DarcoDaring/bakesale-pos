import React, { useEffect } from 'react';
import { usePrinter } from '../hooks/usePrinter';

const payLabel = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  cash_card: 'Cash & Card', cash_upi: 'Cash & UPI',
};

// Pad label left, value right, total `w` chars
function lr(label, value, w = 32) {
  const l = String(label);
  const v = String(value);
  const gap = w - l.length - v.length;
  return l + (gap > 0 ? ' '.repeat(gap) : ' ') + v;
}
const divider = (c = '-', w = 32) => c.repeat(w);

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

    const W = 32;
    const lines = [];

    // Header — centred
    const centre = (s, w = W) => {
      const pad = Math.max(0, Math.floor((w - s.length) / 2));
      return ' '.repeat(pad) + s;
    };

    lines.push(centre('BAKESALE'));
    lines.push(centre('GST IN: 27AAACB7450P1ZV'));
    lines.push(centre('FSSAI: 10012022000234'));
    lines.push(divider('-', W));

    // Bill info
    lines.push(lr('Bill No', bill.bill_number, W));
    lines.push(lr('Date', new Date(bill.created_at).toLocaleDateString('en-IN'), W));
    lines.push(lr('Time', new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), W));
    lines.push(lr('Payment', payLabel[bill.payment_type] || bill.payment_type, W));
    if (bill.created_by_username) lines.push(lr('Cashier', bill.created_by_username, W));
    lines.push(divider('-', W));

    // Items header
    // Columns: name(16) | qty(5) | amount(11)
    lines.push('Item            ' + '   Qty' + '    Amount');
    lines.push(divider('-', W));

    items.forEach(item => {
      const qty      = parseFloat(item.quantity || 0);
      const price    = parseFloat(item.price    || 0);
      const subtotal = qty * price;
      const qtyStr = (qty % 1 === 0 ? String(qty) : qty.toFixed(3)).padStart(6);
      const amtStr = ('Rs.' + subtotal.toFixed(2)).padStart(10);
      const name   = item.product_name || '';
      // First line: up to 16 chars of name + qty + amount
      const firstChunk = name.substring(0, 16);
      lines.push(firstChunk.padEnd(16) + qtyStr + amtStr);
      // Remaining name chars wrap to next lines, max 16 chars each (stays in name column)
      let rest = name.substring(16);
      while (rest.length > 0) {
        lines.push(rest.substring(0, 16));
        rest = rest.substring(16);
      }
    });

    lines.push(divider('-', W));

    // Tax
    if (totalTax > 0) {
      lines.push(lr('Taxable Amount', 'Rs.' + (total - totalTax).toFixed(2), W));
      lines.push(lr('CGST',           'Rs.' + (totalTax / 2).toFixed(2), W));
      lines.push(lr('SGST',           'Rs.' + (totalTax / 2).toFixed(2), W));
      lines.push(divider('-', W));
      lines.push(lr('Total Tax',      'Rs.' + totalTax.toFixed(2), W));
      lines.push(divider('-', W));
    }

    // Total
    lines.push(lr('TOTAL', 'Rs.' + total.toFixed(2), W));
    lines.push(divider('-', W));
    lines.push(centre('Thank you for your purchase!'));
    lines.push(centre('Items sold are non-returnable'));
    // Feed lines for auto-cut
    lines.push('');
    lines.push('');
    lines.push('');

    const text = lines.join('\n');

    // Each line at 9.5pt * 1.5 line-height = ~14.25pt = ~5.03mm
    // Plus 4mm top+bottom margin
    const lineHeightMm = 5.1;
    const totalHeightMm = lines.length * lineHeightMm + 8;
    const heightMicrons = Math.round(totalHeightMm * 1000);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 80mm ${totalHeightMm.toFixed(1)}mm; margin: 2mm 2mm; }
html, body { margin: 0; padding: 0; width: 76mm;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9.5pt; line-height: 1.5; color: #000; background: #fff;
  font-weight: bold; -webkit-print-color-adjust: exact; }
pre { margin: 0; padding: 0; white-space: pre; overflow: hidden; font-weight: bold; }
</style></head><body><pre>${text}</pre></body></html>`;

    printBill(html, { width: 80000, height: heightMicrons });
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

  // ── Screen preview — exactly as before ──
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

          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>BAKESALE</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              GST IN: 27AAACB7450P1ZV<br />
              FSSAI: 10012022000234
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px', gap: 10, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            <span>Item</span>
            <span style={{ textAlign: 'center' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
          </div>

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

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, marginTop: 4 }}>
            <span>TOTAL</span><span>{fmtRs(total)}</span>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '12px 0 8px' }} />
          <div style={{ textAlign: 'center', fontSize: 11, color: '#888' }}>
            <div>Thank you for your purchase!</div>
            <div style={{ marginTop: 2 }}>Items sold are non-returnable</div>
          </div>
        </div>
      </div>
    </div>
  );
}