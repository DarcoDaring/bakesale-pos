/**
 * usePrinter.js — React hook for Electron printing
 *
 * Usage:
 *   const { printBill, printBarcode, printReport, openPrinterSettings } = usePrinter();
 *
 * - printBill(html)      → Silent print to saved default printer (no dialog)
 * - printBarcode(html)   → Always shows printer selection dialog
 * - printReport(html)    → Always shows printer selection dialog
 * - openPrinterSettings  → Opens the printer picker to change default
 */
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

export function usePrinter() {
  const isElectron = window.electronAPI?.isElectron;
  const [showPrinterPicker, setShowPrinterPicker] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [pendingPrint, setPendingPrint] = useState(null); // { html, options }

  // ── Bill Printing: Silent to default printer ──────────────────────────────
  const printBill = useCallback(async (html, pageSizeOverride = null) => {
    if (!isElectron) {
      // Browser fallback
      const w = window.open('', '_blank');
      w.document.write(`<!DOCTYPE html><html><head><style>@page{size:80mm auto;margin:0}body{margin:0;padding:4mm 3mm;font-family:'Courier New',monospace;width:80mm}</style></head><body>${html}</body></html>`);
      w.document.close();
      w.focus();
      w.print();
      w.close();
      return;
    }

    try {
      const printerName = await window.electronAPI.loadDefaultPrinter();
      if (!printerName) {
        toast.error('No default printer set. Please configure printer in Settings.');
        return;
      }
      const pageSize = pageSizeOverride || { width: 80000, height: 2000000 };
      await window.electronAPI.silentPrint(html, printerName, {
        pageSize,
        margins: { marginType: 'printableArea' },
        scaleFactor: 100,
        printBackground: true,
      });
      toast.success('Bill printed!');
    } catch (e) {
      toast.error('Print failed: ' + e.message);
    }
  }, [isElectron]);

  // ── Barcode Printing: Silent to saved barcode printer ────────────────────
  const printBarcode = useCallback(async (html) => {
    if (!isElectron) {
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.print();
      w.close();
      return;
    }

    try {
      const printerName = await window.electronAPI.loadBarcodePrinter();
      if (!printerName) {
        toast.error('No barcode printer set. Please configure it in the barcode print page.');
        return;
      }
      await window.electronAPI.silentPrint(html, printerName, {
        pageSize: 'A4',
        printBackground: true,
      });
      toast.success('Barcode printed!');
    } catch (e) {
      toast.error('Barcode print failed: ' + e.message);
    }
  }, [isElectron]);

  // ── Report Printing: Always show dialog ───────────────────────────────────
  const printReport = useCallback(async (html) => {
    if (!isElectron) {
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      w.print();
      w.close();
      return;
    }

    try {
      const result = await window.electronAPI.printWithDialog(html, {
        pageSize: 'A4',
        printBackground: true,
        landscape: false,
      });
      if (result.success) toast.success('Report printed!');
    } catch (e) {
      toast.error('Report print failed: ' + e.message);
    }
  }, [isElectron]);

  // ── Change Default Printer ────────────────────────────────────────────────
  const openPrinterSettings = useCallback(async () => {
    if (!isElectron) return;
    const available = await window.electronAPI.getPrinters();
    setPrinters(available);
    setShowPrinterPicker(true);
  }, [isElectron]);

  const selectDefaultPrinter = useCallback(async (name) => {
    await window.electronAPI.saveDefaultPrinter(name);
    setShowPrinterPicker(false);
    toast.success(`Default printer set to: ${name}`);
  }, []);

  return {
    printBill,
    printBarcode,
    printReport,
    openPrinterSettings,
    // For rendering the picker UI
    showPrinterPicker,
    setShowPrinterPicker,
    printers,
    selectDefaultPrinter,
  };
}


/**
 * PrinterPickerModal — Drop-in modal to pick a default printer
 * Render this anywhere and control via `showPrinterPicker` from usePrinter()
 */
export function PrinterPickerModal({ printers, onSelect, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
          🖨️ Select Default Bill Printer
        </div>
        {printers.length === 0 && (
          <div style={{ color: '#94a3b8' }}>No printers found.</div>
        )}
        {printers.map(p => (
          <button key={p.name} style={printerBtnStyle} onClick={() => onSelect(p.name)}>
            {p.name} {p.isDefault ? '⭐' : ''}
          </button>
        ))}
        <button style={cancelBtnStyle} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
};
const modalStyle = {
  background: '#1e293b', borderRadius: 12, padding: 24, minWidth: 320,
  border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 8,
};
const printerBtnStyle = {
  padding: '10px 16px', borderRadius: 8, border: '1px solid #334155',
  background: '#0f172a', color: '#e2e8f0', cursor: 'pointer', textAlign: 'left',
  fontSize: 14,
};
const cancelBtnStyle = {
  padding: '10px 16px', borderRadius: 8, border: 'none',
  background: '#374151', color: '#9ca3af', cursor: 'pointer', marginTop: 8,
};