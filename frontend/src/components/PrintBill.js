import React, { useEffect, useRef } from 'react';
import { usePrinter, PrinterPickerModal } from '../hooks/usePrinter';

const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;

const payLabel = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  cash_card: 'Cash & Card', cash_upi: 'Cash & UPI',
};

function buildBillHTML(bill) {
  const items   = bill.items || [];
  const total   = parseFloat(bill.total_amount || 0);
  let totalTax  = 0;
  let taxRows   = '';

  items.forEach(item => {
    const taxRate = parseFloat(item.tax || 0);
    const price   = parseFloat(item.price || 0);
    const qty     = parseFloat(item.quantity || 0);
    const subtotal = price * qty;
    const taxable  = subtotal / (1 + taxRate / 100);
    const itemTax  = subtotal - taxable;
    totalTax += itemTax;
    if (taxRate > 0) {
      taxRows += `
        <tr><td>${item.product_name}</td>
        <td style="text-align:right">${(taxRate/2).toFixed(1)}% — ₹${(itemTax/2).toFixed(2)}</td>
        <td style="text-align:right">${(taxRate/2).toFixed(1)}% — ₹${(itemTax/2).toFixed(2)}</td></tr>`;
    }
  });

  const itemRows = items.map(item => {
    const qty      = parseFloat(item.quantity || 0);
    const price    = parseFloat(item.price    || 0);
    const subtotal = qty * price;
    return `<tr>
      <td style="font-weight:600">${item.product_name}</td>
      <td style="text-align:center;color:#555">${qty % 1 === 0 ? qty : qty.toFixed(3)}</td>
      <td style="text-align:right;font-weight:600">₹${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const taxSection = totalTax > 0 ? `
    <tr><td colspan="3"><hr style="border:none;border-top:1px dashed #999;margin:6px 0"/></td></tr>
    <tr><td>Taxable Amount</td><td></td><td style="text-align:right">₹${(total - totalTax).toFixed(2)}</td></tr>
    <tr><td>CGST</td><td></td><td style="text-align:right">₹${(totalTax/2).toFixed(2)}</td></tr>
    <tr><td>SGST</td><td></td><td style="text-align:right">₹${(totalTax/2).toFixed(2)}</td></tr>
    <tr><td colspan="3"><hr style="border:none;border-top:1px dashed #999;margin:6px 0"/></td></tr>
    <tr style="font-weight:700"><td>Total Tax</td><td></td><td style="text-align:right">₹${totalTax.toFixed(2)}</td></tr>
    <tr><td colspan="3"><hr style="border:none;border-top:1px dashed #999;margin:6px 0"/></td></tr>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 14px; color: #000; background: #fff; padding: 4mm 3mm; width: 80mm; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 3px 0; font-size: 13px; vertical-align: top; }
    hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
    .center { text-align: center; }
    .total-row td { font-size: 18px; font-weight: 900; }
  </style></head><body>
  <div class="center" style="margin-bottom:10px">
    <div style="font-size:24px;font-weight:900;letter-spacing:2px">BAKESALE</div>
    <div style="font-size:12px;color:#555;margin-top:2px">
      GST IN: 27AAACB7450P1ZV<br>FSSAI: 10012022000234
    </div>
  </div>
  <hr/>
  <table>
    <tr><td>Bill No</td><td style="text-align:right;font-weight:700">${bill.bill_number}</td></tr>
    <tr><td>Date</td><td style="text-align:right">${new Date(bill.created_at).toLocaleDateString('en-IN')}</td></tr>
    <tr><td>Time</td><td style="text-align:right">${new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td></tr>
    <tr><td>Payment</td><td style="text-align:right">${payLabel[bill.payment_type] || bill.payment_type}</td></tr>
    ${bill.created_by_username ? `<tr><td>Cashier</td><td style="text-align:right">${bill.created_by_username}</td></tr>` : ''}
  </table>
  <hr/>
  <table>
    <tr style="font-weight:700;font-size:13px">
      <td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Amount</td>
    </tr>
    ${itemRows}
  </table>
  <hr/>
  <table>
    ${taxSection}
    <tr class="total-row"><td>TOTAL</td><td></td><td style="text-align:right">${fmt(total)}</td></tr>
  </table>
  <hr/>
  <div class="center" style="font-size:12px;color:#888;margin-top:8px">
    <div>Thank you for your purchase!</div>
    <div style="margin-top:2px">Items sold are non-returnable</div>
  </div>
</body></html>`;
}

export default function PrintBill({ bill, onClose }) {
  const { printBill, openPrinterSettings, showPrinterPicker, setShowPrinterPicker, printers, selectDefaultPrinter } = usePrinter();
  const hasPrinted = useRef(false);

  // Auto-print silently as soon as bill loads
  useEffect(() => {
    if (!bill || hasPrinted.current) return;
    hasPrinted.current = true;
    printBill(buildBillHTML(bill));
  }, [bill, printBill]);

  // Enter = reprint, Escape = close
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); printBill(buildBillHTML(bill)); }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [bill, onClose, printBill]);

  if (!bill) return null;

  const items = bill.items || [];
  const total = parseFloat(bill.total_amount || 0);
  let totalTax = 0;
  items.forEach(item => {
    const taxRate  = parseFloat(item.tax || 0);
    const subtotal = parseFloat(item.price || 0) * parseFloat(item.quantity || 0);
    totalTax += subtotal - subtotal / (1 + taxRate / 100);
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div className="no-print" style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => printBill(buildBillHTML(bill))}>
            🖨️ Reprint (Enter)
          </button>
          <button className="btn btn-secondary" onClick={openPrinterSettings} title="Change default printer">⚙️</button>
          <button className="btn btn-secondary" onClick={onClose}>✕ Close</button>
        </div>

        <div id="print-bill-content" style={{ padding: '20px 24px', fontFamily: 'monospace', fontSize: 13, color: '#000', background: '#fff', lineHeight: 1.6 }}>

          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>BAKESALE</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              GST IN: 27AAACB7450P1ZV<br />
              FSSAI: 10012022000234
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bill No</span><span style={{ fontWeight: 700 }}>{bill.bill_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Date</span><span>{new Date(bill.created_at).toLocaleDateString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Time</span><span>{new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Payment</span><span>{payLabel[bill.payment_type] || bill.payment_type}</span>
            </div>
            {bill.created_by_username && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cashier</span><span>{bill.created_by_username}</span>
              </div>
            )}
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
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(subtotal)}</span>
                </div>
              </div>
            );
          })}

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {totalTax > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Taxable Amount</span><span>{fmt(total - totalTax)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>CGST</span><span>{fmt(totalTax / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SGST</span><span>{fmt(totalTax / 2)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total Tax</span><span>{fmt(totalTax)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, marginTop: 4 }}>
            <span>TOTAL</span><span>{fmt(total)}</span>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '12px 0 8px' }} />
          <div style={{ textAlign: 'center', fontSize: 11, color: '#888' }}>
            <div>Thank you for your purchase!</div>
            <div style={{ marginTop: 2 }}>Items sold are non-returnable</div>
          </div>
        </div>
      </div>

      {showPrinterPicker && (
        <PrinterPickerModal
          printers={printers}
          onSelect={selectDefaultPrinter}
          onClose={() => setShowPrinterPicker(false)}
        />
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-bill-content, #print-bill-content * { visibility: visible; }
          #print-bill-content {
            position: fixed; top: 0; left: 0;
            width: 80mm; padding: 4mm 3mm; font-size: 14px;
            font-family: 'Courier New', monospace;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}