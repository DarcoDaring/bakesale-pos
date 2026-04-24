import React,{ useEffect } from 'react';


const fmt = n => `₹${parseFloat(n || 0).toFixed(2)}`;

const payLabel = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  cash_card: 'Cash & Card', cash_upi: 'Cash & UPI',
};

export default function PrintBill({ bill, onClose }) {

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.print();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!bill) return null;

  const items = bill.items || [];
  const total = parseFloat(bill.total_amount || 0);

  // Build per-item tax breakdown
  const taxLines = [];
  let totalTax = 0;

  items.forEach(item => {
    const taxRate = parseFloat(item.tax || 0);
    const price   = parseFloat(item.price || 0);
    const qty     = parseFloat(item.quantity || 0);

    const total   = price * qty;

    const taxable = total / (1 + taxRate / 100);
    const itemTax = total - taxable;

    const cgstRate = taxRate / 2;
    const sgstRate = taxRate / 2;

    const cgst = itemTax / 2;
    const sgst = itemTax / 2;

    totalTax += itemTax;

    if (taxRate > 0) {
      taxLines.push({
        name: item.product_name,
        taxable,
        cgstRate,
        sgstRate,
        cgst,
        sgst,
        itemTax
      });
    }
  });

  const totalCgst = totalTax / 2;
  const totalSgst = totalTax / 2;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380, padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div className="no-print" style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.print()}>
            🖨️ Print Bill
          </button>
          <button className="btn btn-secondary" onClick={onClose}>✕ Close</button>
        </div>

        <div id="print-bill-content" style={{ padding: '20px 24px', fontFamily: 'monospace', fontSize: 13, color: '#000', background: '#fff', lineHeight: 1.6 }}>
          
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>BAKESALE</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
              GST IN: 27AAACB7450P1ZV<br />
              FSSAI: 10012022000234
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Bill meta */}
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
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 90px',
                  gap: 10,
                  fontSize: 12,
                  alignItems: 'start'
                }}>
                  <span style={{
                    fontWeight: 600,
                    wordBreak: 'break-word',
                    lineHeight: 1.3
                  }}>
                    {item.product_name}
                  </span>

                  <span style={{
                    textAlign: 'center',
                    color: '#555'
                  }}>
                    {qty % 1 === 0 ? qty : qty.toFixed(3)}
                  </span>

                  <span style={{
                    textAlign: 'right',
                    fontWeight: 600
                  }}>
                    {fmt(subtotal)}
                  </span>
                </div>
              </div>
            );
          })}

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* GST Summary */}
          {totalTax > 0 && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Taxable Amount</span>
                <span>{fmt(total - totalTax)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>CGST</span>
                <span>{fmt(totalCgst)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SGST</span>
                <span>{fmt(totalSgst)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total Tax</span>
                <span>{fmt(totalTax)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            </div>
          )}

          {/* Grand Total */}
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

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-bill-content, #print-bill-content * { visibility: visible; }
          #print-bill-content {
            position: fixed; top: 0; left: 0;
            width: 80mm; padding: 8px; font-size: 12px;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}