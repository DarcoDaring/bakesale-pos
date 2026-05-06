import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  createProduct, updateProduct, getProducts,
  getProductByBarcode, searchProducts,
  createPurchaseBill, getPurchases, getVendors, createVendor, updateVendor,
  createPurchaseReturn
} from '../services/api';
import { usePermissions } from '../context/PermissionContext';
const UNITS = ['nos', 'kg', 'case'];
const fmt   = n => `₹${parseFloat(n || 0).toFixed(2)}`;

const BARCODE_SETTINGS_KEY = 'barcode_print_settings';
const loadBarcodeSettings = () => {
  try { return JSON.parse(localStorage.getItem(BARCODE_SETTINGS_KEY) || '{}'); }
  catch { return {}; }
};

const noArrow = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); };
const noWheel = e => e.target.blur();

// ─────────────────────────────────────────────────────────────────────────────
function VendorMasterModal({ onClose }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);

  const fetchVendors = async () => {
    setLoading(true);
    const { data } = await getVendors();
    setVendors(data); setLoading(false);
  };
  useEffect(() => { fetchVendors(); }, []);

  const toggleActive = async v => {
    try {
      await updateVendor(v.id, { is_active: !v.is_active });
      toast.success(`Vendor ${v.is_active ? 'disabled' : 'enabled'}`);
      fetchVendors();
    } catch { toast.error('Failed to update vendor'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>🏪 Vendor Master</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>+ Add Vendor</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600, color: v.is_active ? 'var(--text)' : 'var(--text3)' }}>{v.name}</td>
                    <td style={{ color: 'var(--text3)' }}>{v.phone || '—'}</td>
                    <td><span className={`badge ${v.is_active ? 'badge-green' : 'badge-red'}`}>{v.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal(v)}>✏️ Edit</button>
                        <button className={`btn btn-sm ${v.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => toggleActive(v)}>
                          {v.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vendors.length === 0 && <div className="empty-state"><div className="icon">🏪</div>No vendors yet</div>}
          </div>
        )}
        {modal && <VendorFormModal vendor={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={fetchVendors} />}
      </div>
    </div>
  );
}

function VendorFormModal({ vendor, onClose, onSaved }) {
  const nameRef  = useRef();
  const phoneRef = useRef();
  const [name, setName]     = useState(vendor?.name  || '');
  const [phone, setPhone]   = useState(vendor?.phone || '');
  const [loading, setLoading] = useState(false);
  const isEdit = !!vendor;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Vendor name required'); return; }
    setLoading(true);
    try {
      if (isEdit) { await updateVendor(vendor.id, { name, phone: phone || null }); toast.success('Vendor updated'); }
      else        { await createVendor({ name, phone: phone || null });             toast.success('Vendor created'); }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.name?.[0] || 'Failed to save vendor'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }}>
        <h2>{isEdit ? '✏️ Edit Vendor' : '+ Add Vendor'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Vendor Name *</label>
            <input ref={nameRef} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fresh Foods Pvt Ltd"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); phoneRef.current?.focus(); } }} />
          </div>
          <div className="form-group">
            <label>Phone (optional)</label>
            <input ref={phoneRef} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9876543210" type="tel"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Saving…' : isEdit ? '✓ Update' : '✓ Create'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ProductMasterModal({ onClose }) {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await getProducts();
    setProducts(data); setLoading(false);
  };
  useEffect(() => { fetchProducts(); }, []);

  const toggleActive = async p => {
    try {
      await updateProduct(p.id, { is_active: !p.is_active });
      toast.success(`Product ${p.is_active ? 'disabled' : 'enabled'}`);
      fetchProducts();
    } catch { toast.error('Failed to update product'); }
  };

  // ── printBarcode: TSC TTP-244 Pro, packed date above expiry ──────────────
const printBarcode = p => {
  const handleMessage = event => {
    if (event.data?.type === 'BARCODE_SETTINGS_SAVE') {
      try { localStorage.setItem(BARCODE_SETTINGS_KEY, JSON.stringify(event.data.settings)); }
      catch {}
      window.removeEventListener('message', handleMessage);
    }
  };
  window.addEventListener('message', handleMessage);

  const saved = loadBarcodeSettings();
  const todayISO = new Date().toISOString().split('T')[0];

  const d = {
    copies:        saved.copies        ?? 1,
    includePacked: saved.includePacked ?? true,
    packedDate:    saved.packedDate    || todayISO,
    includeExpiry: saved.includeExpiry ?? false,
    expiryDate:    saved.expiryDate    || '',
  };

  const price = parseFloat(p.selling_price || 0).toFixed(2);

  const win = window.open('', '_blank', 'width=720,height=560');
  if (!win) { toast.error('Popup blocked. Please allow popups.'); return; }

  // ── Build the pure print HTML sent to Electron silentPrint ───────────────
  // Key insight: @page size = full label (100x50mm landscape = 100mm wide, 50mm tall)
  // body margin-left = 38mm pushes content past the yellow zone into the white area
  // NO position:absolute — just normal flow with margin
  const buildPrintHTML = (v) => {
    const fmtDate = s => {
      if (!s) return '';
      try { const [y, m, dd] = s.split('-'); return dd + '/' + m + '/' + y; }
      catch { return s; }
    };

    let labelsHTML = '';
    for (let i = 0; i < v.copies; i++) {
      labelsHTML += '<div class="lbl">';
      labelsHTML += '<div class="lbl-name">' + p.name.toUpperCase() + '</div>';
      if (v.includePacked && v.packedDate)
        labelsHTML += '<div class="lbl-date">Pkd. Date : ' + fmtDate(v.packedDate) + '</div>';
      if (v.includeExpiry && v.expiryDate)
        labelsHTML += '<div class="lbl-date">Exp. Date : ' + fmtDate(v.expiryDate) + '</div>';
      labelsHTML += '<div class="lbl-rate">Rate : ' + price + '</div>';
      labelsHTML += '<svg id="bc' + i + '"></svg>';
      labelsHTML += '</div>';
    }

    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>x</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: 100mm 50mm;
    margin: 0;
  }

  /*
   * Full label is 100mm wide x 50mm tall.
   * Yellow zone = left 38mm (pre-printed, we skip it).
   * White zone  = remaining 62mm on the right.
   * Using margin-left on body pushes content into the white zone.
   * Width is set to 62mm so content stays within the white area.
   */
  html, body {
    margin: 0;
    padding: 0;
    width: 100mm;
    height: 50mm;
  }

  body {
    margin-left: 38mm;
    width: 62mm;
  }

  .lbl {
    width: 62mm;
    height: 50mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 5px 8px;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }

  .lbl-name {
    font-family: Arial, sans-serif;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.2;
    margin-bottom: 5px;
    word-break: break-word;
  }
  .lbl-date {
    font-family: Arial, sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    color: #111;
    line-height: 1.9;
  }
  .lbl-rate {
    font-family: Arial, sans-serif;
    font-size: 17px;
    font-weight: 900;
    color: #000;
    margin-top: 5px;
    margin-bottom: 5px;
  }
  svg { max-width: 100%; display: block; }
</style>
</head><body>
${labelsHTML}
<script>
window.onload = function() {
  for (var i = 0; i < ${v.copies}; i++) {
    JsBarcode('#bc' + i, ${JSON.stringify(p.barcode)}, {
      format: 'CODE128', width: 1.5, height: 26,
      displayValue: true, fontSize: 9, margin: 2, textMargin: 1,
    });
  }
};
<\/script>
</body></html>`;
  };

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>x</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; background: #ddd; color: #111; }

      .controls {
        background: #fff; border-bottom: 2px solid #ddd;
        padding: 12px 16px; display: flex; flex-wrap: wrap;
        gap: 16px; align-items: flex-end;
      }
      .grp { display: flex; flex-direction: column; gap: 4px; }
      .grp > span { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#555; }
      .grp input[type=number] { width:70px; padding:6px 8px; border:1px solid #ccc; border-radius:4px; font-size:14px; font-weight:700; }
      .grp input[type=date]   { width:148px; padding:6px 8px; border:1px solid #ccc; border-radius:4px; font-size:13px; }
      .toggle-lbl { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; color:#222; cursor:pointer; }
      .toggle-lbl input[type=checkbox] { width:15px; height:15px; accent-color:#2563eb; }
      .date-row { display:flex; align-items:center; gap:8px; margin-top:5px; margin-left:22px; }
      .date-row > span { font-size:10px; font-weight:700; text-transform:uppercase; color:#666; }

      .printer-select { padding:6px 8px; border:1.5px solid #ccc; border-radius:4px; font-size:13px; min-width:200px; background:#fff; cursor:pointer; }
      .printer-select.saved { border-color:#16a34a; color:#15803d; font-weight:700; }
      .printer-badge { font-size:10px; color:#16a34a; font-weight:700; display:none; margin-top:2px; }

      .btn-print { padding:10px 28px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:800; cursor:pointer; align-self:flex-end; }
      .btn-print:hover    { background:#1d4ed8; }
      .btn-print:disabled { background:#93c5fd; cursor:not-allowed; }

      .preview { padding:20px; display:flex; flex-wrap:wrap; gap:10px; background:#bbb; }
      .lbl {
        background:#fff; border:1.5px dashed #999;
        width:62mm; height:50mm;
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; text-align:center;
        padding:5px 8px; overflow:hidden;
      }
      .lbl-name { font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:0.04em; line-height:1.2; margin-bottom:5px; word-break:break-word; }
      .lbl-date { font-size:11.5px; font-weight:700; color:#111; line-height:1.9; }
      .lbl-rate { font-size:17px; font-weight:900; color:#000; margin-top:5px; margin-bottom:5px; line-height:1.1; }
      .lbl-bc   { max-width:100%; display:block; }
    </style>
  </head><body>

  <div class="controls">
    <div class="grp">
      <span>Copies</span>
      <input type="number" id="copies" value="${d.copies}" min="1" max="200" oninput="render()">
    </div>

    <div class="grp">
      <label class="toggle-lbl">
        <input type="checkbox" id="chkPacked" ${d.includePacked ? 'checked' : ''} onchange="togglePacked();render()">
        📦 Packed Date
      </label>
      <div class="date-row" id="wrapPacked" style="display:${d.includePacked ? 'flex' : 'none'}">
        <span>Date:</span>
        <input type="date" id="packedDate" value="${d.packedDate}" oninput="render()">
      </div>
    </div>

    <div class="grp">
      <label class="toggle-lbl">
        <input type="checkbox" id="chkExpiry" ${d.includeExpiry ? 'checked' : ''} onchange="toggleExpiry();render()">
        📅 Expiry Date
      </label>
      <div class="date-row" id="wrapExpiry" style="display:${d.includeExpiry ? 'flex' : 'none'}">
        <span>Date:</span>
        <input type="date" id="expiryDate" value="${d.expiryDate}" oninput="render()">
      </div>
    </div>

    <div class="grp">
      <span>🖨️ Printer</span>
      <select class="printer-select" id="printerSelect" onchange="onPrinterChange()">
        <option value="">Loading…</option>
      </select>
      <div class="printer-badge" id="printerBadge">✓ Saved as default</div>
    </div>

    <button class="btn-print" id="printBtn" onclick="doPrint()">🖨️ Print</button>
  </div>

  <div class="preview" id="preview"></div>

  <script>
    const BC_VAL    = ${JSON.stringify(p.barcode)};
    const PROD_NAME = ${JSON.stringify(p.name)};
    const PRICE     = '${price}';
    const TODAY     = '${todayISO}';
    const STORE_KEY = 'barcode_print_settings';

    async function loadPrinters() {
      const api = window.opener?.electronAPI || window.electronAPI;
      const sel = document.getElementById('printerSelect');
      if (!api) { sel.innerHTML = '<option value="">— No printer API —</option>'; return; }
      try {
        const [printers, savedName] = await Promise.all([api.getPrinters(), api.loadDefaultPrinter()]);
        sel.innerHTML = '';
        if (!printers.length) { sel.innerHTML = '<option value="">— No printers found —</option>'; return; }
        printers.forEach(pr => {
          const opt = document.createElement('option');
          opt.value = pr.name;
          opt.textContent = pr.name + (pr.isDefault ? ' (system default)' : '');
          sel.appendChild(opt);
        });
        if (savedName && printers.find(pr => pr.name === savedName)) {
          sel.value = savedName;
          sel.classList.add('saved');
          document.getElementById('printerBadge').style.display = 'block';
        } else {
          const def = printers.find(pr => pr.isDefault);
          if (def) sel.value = def.name;
        }
      } catch(e) { sel.innerHTML = '<option value="">— Error —</option>'; }
    }

    async function onPrinterChange() {
      const api = window.opener?.electronAPI || window.electronAPI;
      const sel = document.getElementById('printerSelect');
      if (!api || !sel.value) return;
      try {
        await api.saveDefaultPrinter(sel.value);
        sel.classList.add('saved');
        document.getElementById('printerBadge').style.display = 'block';
      } catch(e) {}
    }

    function togglePacked() {
      const on = document.getElementById('chkPacked').checked;
      document.getElementById('wrapPacked').style.display = on ? 'flex' : 'none';
      if (on && !document.getElementById('packedDate').value)
        document.getElementById('packedDate').value = TODAY;
    }
    function toggleExpiry() {
      const on = document.getElementById('chkExpiry').checked;
      document.getElementById('wrapExpiry').style.display = on ? 'flex' : 'none';
    }
    function fmtDate(s) {
      if (!s) return '';
      try { const [y, m, dd] = s.split('-'); return dd + '/' + m + '/' + y; }
      catch { return s; }
    }
    function vals() {
      return {
        copies:        Math.max(1, Math.min(200, parseInt(document.getElementById('copies').value) || 1)),
        includePacked: document.getElementById('chkPacked').checked,
        packedDate:    document.getElementById('packedDate').value || '',
        includeExpiry: document.getElementById('chkExpiry').checked,
        expiryDate:    document.getElementById('expiryDate').value || '',
      };
    }

    function makePreviewLabel(v, bcId) {
      const box = document.createElement('div');
      box.className = 'lbl';
      const name = document.createElement('div');
      name.className = 'lbl-name'; name.textContent = PROD_NAME;
      box.appendChild(name);
      if (v.includePacked && v.packedDate) {
        const pd = document.createElement('div');
        pd.className = 'lbl-date'; pd.textContent = 'Pkd. Date : ' + fmtDate(v.packedDate);
        box.appendChild(pd);
      }
      if (v.includeExpiry && v.expiryDate) {
        const ed = document.createElement('div');
        ed.className = 'lbl-date'; ed.textContent = 'Exp. Date : ' + fmtDate(v.expiryDate);
        box.appendChild(ed);
      }
      const rate = document.createElement('div');
      rate.className = 'lbl-rate'; rate.textContent = 'Rate : ' + PRICE;
      box.appendChild(rate);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', bcId); svg.className = 'lbl-bc';
      box.appendChild(svg);
      return box;
    }

    function render() {
      const v = vals();
      const preview = document.getElementById('preview');
      preview.innerHTML = '';
      for (let i = 0; i < v.copies; i++) preview.appendChild(makePreviewLabel(v, 'pbc' + i));
      requestAnimationFrame(() => {
        for (let i = 0; i < v.copies; i++) {
          const el = document.getElementById('pbc' + i);
          if (el) JsBarcode(el, BC_VAL, { format:'CODE128', width:1.5, height:26, displayValue:true, fontSize:9, margin:2, textMargin:1 });
        }
      });
    }

    function saveSettings(v) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch(e) {}
      try { window.opener.postMessage({ type: 'BARCODE_SETTINGS_SAVE', settings: v }, '*'); } catch(e) {}
    }

    async function doPrint() {
      const v = vals();
      saveSettings(v);

      const btn         = document.getElementById('printBtn');
      const printerName = document.getElementById('printerSelect').value || '';
      btn.disabled = true; btn.textContent = 'Printing…';

      const fmtD = s => {
        if (!s) return '';
        try { const [y, m, dd] = s.split('-'); return dd + '/' + m + '/' + y; } catch { return s; }
      };

      // Build labels
      let labelsHTML = '';
      for (let i = 0; i < v.copies; i++) {
        labelsHTML += '<div class="lbl">';
        labelsHTML += '<div class="lbl-name">' + PROD_NAME.toUpperCase() + '</div>';
        if (v.includePacked && v.packedDate) labelsHTML += '<div class="lbl-date">Pkd. Date : ' + fmtD(v.packedDate) + '</div>';
        if (v.includeExpiry && v.expiryDate) labelsHTML += '<div class="lbl-date">Exp. Date : ' + fmtD(v.expiryDate) + '</div>';
        labelsHTML += '<div class="lbl-rate">Rate : ' + PRICE + '</div>';
        labelsHTML += '<svg id="bc' + i + '"></svg>';
        labelsHTML += '</div>';
      }

      /*
       * PRINT HTML LAYOUT:
       * - @page size: 100mm 50mm  (no landscape keyword — Electron respects width>height)
       * - html/body width: 100mm, height: 50mm
       * - body margin-left: 38mm  ← this shifts ALL content past the yellow zone
       * - .lbl width: 62mm        ← fills only the white zone
       * No position:absolute, no left: offset — pure margin flow
       */
      const html =
        '<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8"><title>x</title>' +
        '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\\/script>' +
        '<style>' +
        '*{box-sizing:border-box;margin:0;padding:0;}' +
        '@page{size:100mm 50mm;margin:0;}' +
        'html,body{margin:0;padding:0;width:100mm;height:50mm;}' +
        'body{margin-left:38mm;width:62mm;}' +
        '.lbl{width:62mm;height:50mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5px 8px;overflow:hidden;page-break-after:always;break-after:page;}' +
        '.lbl-name{font-family:Arial,sans-serif;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;line-height:1.2;margin-bottom:5px;word-break:break-word;}' +
        '.lbl-date{font-family:Arial,sans-serif;font-size:11.5px;font-weight:700;color:#111;line-height:1.9;}' +
        '.lbl-rate{font-family:Arial,sans-serif;font-size:17px;font-weight:900;color:#000;margin-top:5px;margin-bottom:5px;}' +
        'svg{max-width:100%;display:block;}' +
        '</style></head><body>' +
        labelsHTML +
        '<script>window.onload=function(){' +
        'for(var i=0;i<' + v.copies + ';i++){' +
        'JsBarcode("#bc"+i,' + JSON.stringify(BC_VAL) + ',' +
        '{format:"CODE128",width:1.5,height:26,displayValue:true,fontSize:9,margin:2,textMargin:1});' +
        '}};' +
        '<\\/script></body></html>';

      try {
        const api = window.opener?.electronAPI || window.electronAPI;
        if (api && api.silentPrint) {
          await api.silentPrint(html, printerName, {
            pageSize:        { width: 100000, height: 50000 }, // 100mm x 50mm in microns
            landscape:       false,   // size already defined as landscape (width > height)
            marginsType:     2,       // no margins
            printBackground: true,
            copies:          1,
          });
          btn.textContent = '✓ Printed!';
          setTimeout(() => { btn.disabled = false; btn.textContent = '🖨️ Print'; }, 2000);
          return;
        }
      } catch(err) {
        console.error('silentPrint error:', err);
        toast && toast.error('Print failed: ' + err.message);
      }

      btn.disabled = false; btn.textContent = '🖨️ Print';
    }

    window.onload = () => { render(); loadPrinters(); };
  <\/script>
  </body></html>`);
  win.document.close();
};

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search)
  );

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 1100, width: '96vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>📦 Product Master</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>+ Add Product</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search by name or barcode…" style={{ marginBottom: 16 }} />
        {loading ? <div className="spinner" /> : (
          <div style={{ overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Barcode</th>
                  <th style={{ minWidth: 200 }}>Product Name</th>
                  <th style={{ minWidth: 120 }}>Selling Price</th>
                  <th style={{ minWidth: 80 }}>Unit</th>
                  <th style={{ minWidth: 100 }}>Stock</th>
                  <th style={{ minWidth: 80 }}>Status</th>
                  <th style={{ minWidth: 220, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.barcode}</span></td>
                    <td style={{ fontWeight: 600, color: p.is_active ? 'var(--text)' : 'var(--text3)' }}>{p.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmt(p.selling_price)}</td>
                    <td><span className="badge badge-blue">{p.selling_unit}</span></td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{parseFloat(p.stock_quantity).toFixed(p.selling_unit === 'kg' ? 3 : 0)}</td>
                    <td><span className={`badge ${p.is_active ? 'badge-green' : 'badge-red'}`}>{p.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal(p)}>✏️ Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => printBarcode(p)}
                          style={{ color: 'var(--purple)', borderColor: 'var(--purple)' }}>🖨️ Barcode</button>
                        <button className={`btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-green'}`} onClick={() => toggleActive(p)}>
                          {p.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state"><div className="icon">📦</div>No products found</div>}
          </div>
        )}
        {modal && <ProductFormModal product={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={fetchProducts} />}
      </div>
    </div>
  );
}

// ─── Barcode Warning Dialog ───────────────────────────────────────────────────
function BarcodeWarningDialog({ onConfirm, onCancel }) {
  const okRef = useRef();
  useEffect(() => {
    okRef.current?.focus();
    const handler = e => {
      if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel();  }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onConfirm, onCancel]);

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text)' }}>Barcode Not Entered</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
          No barcode was entered. A custom barcode will be auto-generated for this product.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button ref={okRef} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm}>
            ✓ OK, Create
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'monospace' }}>Enter</span>
          </button>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>
            Cancel
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'monospace', color: 'var(--text3)' }}>Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Form Modal ───────────────────────────────────────────────────────
function ProductFormModal({ product, onClose, onSaved }) {
  const nameRef    = useRef();
  const barcodeRef = useRef();
  const [form, setForm] = useState({ name: product?.name || '', barcode: product?.barcode || '', auto_barcode: false });
  const [loading,            setLoading]            = useState(false);
  const [showBarcodeWarning, setShowBarcodeWarning] = useState(false);
  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!product;

  const doCreate = useCallback(async () => {
    setLoading(true);
    try {
      const payload = { name: form.name };
      if (!form.auto_barcode && form.barcode.trim()) payload.barcode = form.barcode.trim();
      await createProduct(payload);
      toast.success('Product created');
      onSaved(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.barcode?.[0] || 'Failed to save product');
    } finally { setLoading(false); }
  }, [form, onSaved, onClose]);

  const handleSubmit = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.name.trim()) { toast.error('Product name required'); return; }
    if (isEdit) {
      setLoading(true);
      try { await updateProduct(product.id, { name: form.name }); toast.success('Product updated'); onSaved(); onClose(); }
      catch { toast.error('Failed to save product'); }
      finally { setLoading(false); }
      return;
    }
    if (!form.auto_barcode && !form.barcode.trim()) { setShowBarcodeWarning(true); return; }
    await doCreate();
  };

  return (
    <>
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 420 }}>
          <h2>{isEdit ? '✏️ Edit Product' : '+ Add Product'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Product Name *</label>
              <input ref={nameRef} autoFocus value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. Chocolate Cake"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!isEdit && !form.auto_barcode) barcodeRef.current?.focus(); else handleSubmit(e); } }} />
            </div>
            {!isEdit && (
              <>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0 }}>
                    <input type="checkbox" checked={form.auto_barcode} onChange={e => set('auto_barcode', e.target.checked)} style={{ width: 'auto' }} />
                    Auto-generate Barcode
                  </label>
                </div>
                {!form.auto_barcode && (
                  <div className="form-group">
                    <label>Barcode (scan or enter manually)</label>
                    <input ref={barcodeRef} value={form.barcode} onChange={e => set('barcode', e.target.value)}
                      placeholder="Scan barcode here…" style={{ fontFamily: 'var(--mono)' }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e); } }} />
                  </div>
                )}
              </>
            )}
            {isEdit && (
              <div className="form-group">
                <label>Barcode</label>
                <input value={form.barcode} readOnly style={{ fontFamily: 'var(--mono)', opacity: 0.6, cursor: 'not-allowed' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Saving…' : isEdit ? '✓ Update' : '✓ Create'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
      {showBarcodeWarning && (
        <BarcodeWarningDialog
          onConfirm={() => { setShowBarcodeWarning(false); doCreate(); }}
          onCancel={() => setShowBarcodeWarning(false)}
        />
      )}
    </>
  );
}

// ─── PurchaseReturnModal ──────────────────────────────────────────────────────
function PurchaseReturnModal({ onClose }) {
  const [vendors,      setVendors]      = useState([]);
  const [vendorId,     setVendorId]     = useState('');
  const [vendorQuery,  setVendorQuery]  = useState('');
  const [vendorOpen,   setVendorOpen]   = useState(false);
  const [vendorHiIdx,  setVendorHiIdx]  = useState(0);
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [resultHiIdx,  setResultHiIdx]  = useState(0);
  const [searching,    setSearching]    = useState(false);
  const [lines,        setLines]        = useState([]);
  const [reason,       setReason]       = useState('');
  const [loading,      setLoading]      = useState(false);

  const debounceRef      = useRef();
  const vendorInputRef   = useRef();
  const productSearchRef = useRef();
  const qtyRefs          = useRef({});
  const lastAddedKeyRef  = useRef(null);
  const vendorWrapRef    = useRef();
  const resultsRef       = useRef([]);
  resultsRef.current = results;

  useEffect(() => {
    getVendors().then(r => setVendors(r.data.filter(v => v.is_active)));
    setTimeout(() => vendorInputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    if (lastAddedKeyRef.current) {
      const el = qtyRefs.current[lastAddedKeyRef.current];
      if (el) { el.focus(); el.select && el.select(); }
      lastAddedKeyRef.current = null;
    }
  }, [lines]);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'F1') { e.preventDefault(); handleSubmit(); return; }
      if (e.key === 'Escape') {
        if (vendorOpen) { setVendorOpen(false); return; }
        e.preventDefault(); onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [vendorId, lines, reason, loading, vendorOpen]);

  useEffect(() => {
    const handler = e => { if (vendorWrapRef.current && !vendorWrapRef.current.contains(e.target)) setVendorOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(vendorQuery.toLowerCase()) || (v.phone && v.phone.includes(vendorQuery))
  );

  const confirmVendor = v => {
    setVendorId(String(v.id)); setVendorQuery(v.name); setVendorOpen(false);
    setTimeout(() => productSearchRef.current?.focus(), 50);
  };

  const handleVendorChange = e => { setVendorQuery(e.target.value); setVendorId(''); setVendorHiIdx(0); setVendorOpen(true); };
  const handleVendorKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setVendorHiIdx(h => Math.min(h+1, filteredVendors.length-1)); setVendorOpen(true); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setVendorHiIdx(h => Math.max(h-1, 0)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); if (filteredVendors.length > 0) confirmVendor(filteredVendors[vendorHiIdx] ?? filteredVendors[0]); return; }
    if (e.key === 'Escape')    { setVendorOpen(false); return; }
  };

  const doSearch = async q => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try { const { data } = await searchProducts(q); setResults(data); setResultHiIdx(0); }
    catch { setResults([]); } finally { setSearching(false); }
  };

  const handleSearchChange = e => {
    const v = e.target.value; setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const addProduct = p => {
    setQuery(''); setResults([]); setResultHiIdx(0);
    setLines(prev => {
      const exists = prev.find(l => l.product_id === p.id);
      if (exists) {
        setTimeout(() => { const el = qtyRefs.current[exists._key]; if (el) { el.focus(); el.select && el.select(); } }, 40);
        return prev.map(l => l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l);
      }
      const newKey = `${p.id}_${Date.now()}`;
      lastAddedKeyRef.current = newKey;
      return [...prev, { _key: newKey, product_id: p.id, product_name: p.name, barcode: p.barcode, mrp: parseFloat(p.selling_price || 0), qty: 1, selling_unit: p.selling_unit || 'nos', stock: parseFloat(p.stock_quantity || 0) }];
    });
  };

  const handleScanKey = async e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setResultHiIdx(h => Math.min(h + 1, cur.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setResultHiIdx(h => Math.max(h - 1, 0)); return; }
    if (e.key === 'Escape') { setResults([]); setResultHiIdx(0); return; }
    if (e.key !== 'Enter' || !query.trim()) return;
    clearTimeout(debounceRef.current);
    if (cur.length > 0) { addProduct(cur[resultHiIdx] ?? cur[0]); return; }
    try {
      const { data } = await getProductByBarcode(query.trim());
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length > 0) addProduct(rows[0]); else toast.error('Product not found');
    } catch { toast.error('Product not found'); }
  };

  const updateLine = (key, field, val) => setLines(prev => prev.map(l => l._key === key ? { ...l, [field]: val } : l));
  const removeLine = key => setLines(prev => prev.filter(l => l._key !== key));
  const handleQtyKeyDown = (e, key) => { noArrow(e); if (e.key === 'Enter') { e.preventDefault(); productSearchRef.current?.focus(); } };

  const handleSubmit = async () => {
    if (!vendorId) { toast.error('Please select a vendor first'); return; }
    if (lines.length === 0) { toast.error('Add at least one product'); return; }
    for (const l of lines) {
      if (!l.qty || l.qty <= 0) { toast.error(`Enter valid qty for ${l.product_name}`); return; }
      if (l.qty > l.stock)      { toast.error(`Qty exceeds stock for ${l.product_name}`); return; }
    }
    setLoading(true);
    try {
      for (const l of lines) await createPurchaseReturn({ product: l.product_id, vendor: parseInt(vendorId), quantity: parseFloat(l.qty), reason: reason || '' });
      toast.success(`Purchase return recorded for ${lines.length} item(s)!`);
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record return'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>↩️ Purchase Return</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              <span style={{ fontFamily: 'monospace', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>F1</span> Record ·{' '}
              <span style={{ fontFamily: 'monospace', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>Esc</span> Cancel
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="form-group" style={{ position: 'relative' }} ref={vendorWrapRef}>
          <label>Vendor *{vendorId && <span style={{ color: 'var(--green)', marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>✓ selected</span>}</label>
          <input ref={vendorInputRef} value={vendorQuery} onChange={handleVendorChange} onKeyDown={handleVendorKeyDown}
            onFocus={() => { if (vendorQuery) setVendorOpen(true); }} placeholder="Type vendor name or use ↑↓ to browse…"
            style={{ borderColor: vendorId ? 'var(--green)' : undefined }} autoComplete="off" />
          {vendorOpen && filteredVendors.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
              {filteredVendors.map((v, i) => (
                <div key={v.id} onMouseDown={() => confirmVendor(v)} onMouseEnter={() => setVendorHiIdx(i)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: vendorHiIdx === i ? 'var(--accent-dim)' : '' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: vendorHiIdx === i ? 'var(--accent)' : 'var(--text)' }}>{v.name}</div>
                    {v.phone && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{v.phone}</div>}
                  </div>
                  {vendorHiIdx === i && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace' }}>Enter ↵</span>}
                </div>
              ))}
              <div style={{ padding: '5px 14px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)' }}>↑↓ Navigate · Enter Select · Esc Close</div>
            </div>
          )}
          {vendorOpen && vendorQuery && filteredVendors.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--text3)', fontSize: 13, marginTop: 2 }}>
              No vendors match "{vendorQuery}"
            </div>
          )}
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input ref={productSearchRef} value={query} onChange={handleSearchChange} onKeyDown={handleScanKey}
            placeholder={vendorId ? '🔍 Scan barcode or search product… (↑↓ navigate, Enter to add)' : '⬆ Select a vendor first'}
            disabled={!vendorId} style={{ fontSize: 14, padding: '10px 14px', opacity: !vendorId ? 0.45 : 1 }} />
          {searching && <div style={{ position: 'absolute', right: 14, top: 14, fontSize: 12, color: 'var(--text3)' }}>…</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow)', marginTop: 2 }}>
              {results.map((p, i) => (
                <div key={`${p.id}-${i}`} onClick={() => addProduct(p)} onMouseEnter={() => setResultHiIdx(i)}
                  style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: resultHiIdx === i ? 'var(--accent-dim)' : '' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: resultHiIdx === i ? 'var(--accent)' : 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.barcode}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 700 }}>MRP: ₹{parseFloat(p.selling_price||0).toFixed(2)}</div>
                    <div style={{ color: 'var(--text3)' }}>Stock: {parseFloat(p.stock_quantity).toFixed(p.selling_unit==='kg'?3:0)} {p.selling_unit}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '5px 14px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)' }}>↑↓ Navigate · Enter Add · Esc Close</div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {lines.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="icon">↩️</div>
              {vendorId ? 'Search and add items to return' : 'Select a vendor first'}
            </div>
          ) : (
            <table>
              <thead><tr><th>Product</th><th>MRP</th><th>Qty <span style={{ fontWeight: 400, fontSize: 10 }}>(Enter→search)</span></th><th></th></tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l._key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.product_name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{l.barcode}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Stock: {l.stock} {l.selling_unit}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>₹{l.mrp.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => updateLine(l._key, 'qty', Math.max(1, l.qty - 1))} style={{ padding: '2px 7px' }}>−</button>
                        <input type="number" value={l.qty} min="0.001"
                          ref={el => { if (el) qtyRefs.current[l._key] = el; else delete qtyRefs.current[l._key]; }}
                          onChange={e => updateLine(l._key, 'qty', parseFloat(e.target.value) || 1)}
                          onKeyDown={e => handleQtyKeyDown(e, l._key)} onWheel={noWheel}
                          style={{ width: 60, textAlign: 'center', fontWeight: 700, padding: '4px 6px', fontSize: 13, border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }} />
                        <button className="btn btn-secondary btn-sm" onClick={() => { if (l.qty + 1 > l.stock) { toast.error('Exceeds stock'); return; } updateLine(l._key, 'qty', l.qty + 1); }} style={{ padding: '2px 7px' }}>+</button>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{l.selling_unit}</span>
                      </div>
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeLine(l._key)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Reason for Return (optional)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Damaged, expired…" rows={2} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleSubmit} disabled={loading || !vendorId || lines.length === 0}>
            {loading ? 'Recording…' : `✓ Record ${lines.length} Return${lines.length !== 1 ? 's' : ''}`}
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 6px', marginLeft: 8, fontFamily: 'monospace' }}>F1</span>
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 6px', marginLeft: 6, fontFamily: 'monospace' }}>Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProductSearchCell ────────────────────────────────────────────────────────
function ProductSearchCell({ value, onSelect, onEnterNext, excludeProductIds = [] }) {
  const [query,    setQuery]    = useState(value?.name || '');
  const [results,  setResults]  = useState([]);
  const [searching,setSearching]= useState(false);
  const [hiIdx,    setHiIdx]    = useState(0);
  const [open,     setOpen]     = useState(false);
  const wrapRef = useRef(); const debounceRef = useRef(); const resultsRef = useRef([]);
  resultsRef.current = results;

  const doSearch = useCallback(async q => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const { data } = await searchProducts(q);
      const seen = new Set();
      const unique = data.filter(p => {
        const key = p.batch_id ? `${p.id}_${p.batch_id}` : String(p.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return !excludeProductIds.includes(p.id);
      });
      setResults(unique); setHiIdx(0); setOpen(unique.length > 0);
    } catch { setResults([]); setOpen(false); } finally { setSearching(false); }
  }, [excludeProductIds]);

  const handleChange = e => {
    const v = e.target.value; setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 300);
  };

  const pick = p => {
    setQuery(p.name); setResults([]); setOpen(false); setHiIdx(0);
    onSelect(p); if (onEnterNext) setTimeout(onEnterNext, 30);
  };

  const handleKeyDown = async e => {
    const cur = resultsRef.current;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHiIdx(h => Math.min(h+1, cur.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHiIdx(h => Math.max(h-1, 0)); return; }
    if (e.key === 'Escape')    { setResults([]); setOpen(false); setHiIdx(0); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); clearTimeout(debounceRef.current);
      if (open && cur.length > 0) { pick(cur[hiIdx] || cur[0]); return; }
      const q = query.trim(); if (!q) return;
      try {
        const { data } = await getProductByBarcode(q);
        const rows = Array.isArray(data) ? data : [data];
        const filtered = rows.filter(p => !excludeProductIds.includes(p.id));
        if (filtered.length > 0) pick(filtered[0]);
        else if (rows.length > 0) toast.error('Product already added in this purchase');
        else toast.error('Product not found');
      } catch { toast.error('Product not found'); }
    }
  };

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setResults([]); setOpen(false); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 200 }}>
      <input value={query} onChange={handleChange} onKeyDown={handleKeyDown}
        placeholder="Scan / search…" style={{ fontSize: 13, padding: '6px 10px', width: '100%' }} />
      {searching && <div style={{ position: 'absolute', right: 8, top: 8, fontSize: 11, color: 'var(--text3)' }}>…</div>}
      {open && results.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setResults([]); setOpen(false); } }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', width: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
              <span>↑↓ to navigate · Enter to select · Esc to close</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {results.map((p, i) => (
                <div key={`${p.id}_${p.batch_id ?? i}`} onMouseDown={() => pick(p)}
                  style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: hiIdx===i?'var(--accent-dim)':'' }}
                  onMouseEnter={() => setHiIdx(i)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.barcode}</div>
                    {p.multi_batch && (
                      <div style={{ marginTop: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 4, border: '1px solid var(--accent)' }}>
                          Batch MRP: ₹{parseFloat(p.batch_mrp || p.selling_price).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.selling_price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Stock: {parseFloat(p.stock_quantity).toFixed(p.selling_unit === 'kg' ? 3 : 0)} {p.selling_unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  _id: Date.now() + Math.random(),
  product: null, purchase_unit: 'nos',
  quantity: '', purchase_price: '', tax: '0', tax_type: 'excluding',
  total_qty: '', current_mrp: '', mrp: '', selling_unit: 'nos',
});

export default function Purchase() {
  const { isAdmin, can } = usePermissions();
  const [vendors,        setVendors]        = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [rows,           setRows]           = useState([emptyRow()]);
  const [loading,        setLoading]        = useState(false);
  const [isPaid,         setIsPaid]         = useState(false);
  const [purchaseNumber, setPurchaseNumber] = useState('PB-...');
  const [showProduct,    setShowProduct]    = useState(false);
  const [showVendor,     setShowVendor]     = useState(false);
  const [showPurReturn,  setShowPurReturn]  = useState(false);
  const [roundOff, setRoundOff] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);

  const cellRefs          = useRef({});
  const mrpJustBlurredRef = useRef(null);
  const dateRef   = useRef();
  const vendorRef = useRef();
  const registerRef = (rowId, col, el) => {
    if (!cellRefs.current[rowId]) cellRefs.current[rowId] = {};
    if (el) cellRefs.current[rowId][col] = el;
  };

  const focusCell = (rowId, col) => {
    const el = cellRefs.current[rowId]?.[col];
    if (el) { setTimeout(() => { el.focus(); el.select && el.select(); }, 20); }
  };

  const nextFocus = (rowId, currentCol) => {
    const order = ['unit', 'qty', 'totalqty', 'price', 'tax', 'mrp'];
    const idx = order.indexOf(currentCol);
    if (idx >= 0 && idx < order.length - 1) {
      focusCell(rowId, order[idx + 1]);
    } else if (idx === order.length - 1) {
      const el = cellRefs.current[rowId]?.['mrp'];
      if (el) el.blur();
      mrpJustBlurredRef.current = rowId;
    }
  };

  const handleClear = useCallback(() => {
  setRows([emptyRow()]); setSelectedVendor(''); setIsPaid(false);
  setRoundOff('');
  refreshPurchaseNumber(); refreshVendors();
}, []);

  useEffect(() => {
    const handleKey = e => {
      if (showProduct || showVendor || showPurReturn) return;
      if (e.key === 'F12') { e.preventDefault(); handleClear(); return; }
      if (e.key === 'F1')  { e.preventDefault(); handleSubmit(); return; }
      if (e.key === 'Enter') {
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
        if (!isTyping && mrpJustBlurredRef.current) {
          e.preventDefault();
          const rowId = mrpJustBlurredRef.current;
          mrpJustBlurredRef.current = null;
          addRow(rowId); return;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [rows, selectedVendor, isPaid, showProduct, showVendor, showPurReturn, loading, handleClear]);

  useEffect(() => {
    const clear = () => { mrpJustBlurredRef.current = null; };
    document.addEventListener('mousedown', clear);
    return () => document.removeEventListener('mousedown', clear);
  }, []);

  const refreshPurchaseNumber = () => {
    getPurchases().then(r => {
      const bills = r.data;
      if (bills.length > 0 && bills[0].purchase_number) {
        try {
          const lastNum = parseInt(bills[0].purchase_number.replace('PB-', ''));
          setPurchaseNumber(!isNaN(lastNum) ? `PB-${lastNum + 1}` : 'PB-1');
        } catch { setPurchaseNumber('PB-1'); }
      } else { setPurchaseNumber('PB-1'); }
    }).catch(() => setPurchaseNumber('PB-1'));
  };

  const refreshVendors = () => getVendors().then(r => setVendors(r.data));

  useEffect(() => { refreshPurchaseNumber(); }, []);
  useEffect(() => { refreshVendors(); }, []);
  useEffect(() => { setTimeout(() => dateRef.current?.focus(), 200); }, []);

  const updateRow = (id, field, value) =>
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'quantity' && updated.purchase_unit !== 'case') updated.total_qty = value;
      if (field === 'purchase_unit' && value !== 'case') updated.total_qty = updated.quantity;
      return updated;
    }));

  const selectProduct = (id, product) =>
    setRows(prev => prev.map(r => r._id === id ? {
      ...r, product,
      current_mrp:  product.batch_mrp ? String(product.batch_mrp) : (product.selling_price ? String(product.selling_price) : '—'),
      mrp:          product.batch_mrp ? String(product.batch_mrp) : (product.selling_price ? String(product.selling_price) : ''),
      selling_unit: product.selling_unit || 'nos',
      tax:          product.tax != null ? String(product.tax) : r.tax,
    } : r));

  const addRow = afterId => {
    const newRow = emptyRow();
    setRows(prev => {
      if (afterId) { const idx = prev.findIndex(r => r._id === afterId); const next = [...prev]; next.splice(idx + 1, 0, newRow); return next; }
      return [...prev, newRow];
    });
    setTimeout(() => {
      const inputs = document.querySelectorAll('td input[placeholder="Scan / search…"]');
      if (inputs.length > 0) { const lastEmpty = [...inputs].reverse().find(el => !el.value); if (lastEmpty) lastEmpty.focus(); }
    }, 80);
  };
  const removeRow = id => setRows(prev => prev.length > 1 ? prev.filter(r => r._id !== id) : prev);

  const getRowTotalValue = row => {
    const qty = parseFloat(row.quantity) || 0; const price = parseFloat(row.purchase_price) || 0; const tax = parseFloat(row.tax) || 0;
    if (row.tax_type === 'including') return qty * price;
    return qty * price * (1 + tax / 100);
  };

  const getBasePrice = row => {
    const price = parseFloat(row.purchase_price) || 0; const tax = parseFloat(row.tax) || 0;
    if (row.tax_type === 'including') return price / (1 + tax / 100);
    return price;
  };

  const handleSubmit = async () => {
    if (!selectedVendor) { toast.error('Please select a vendor'); return; }
    for (const row of rows) {
      if (!row.product)        { toast.error('Select a product for each row'); return; }
      if (!row.quantity)       { toast.error('Enter quantity for each row'); return; }
      if (!row.purchase_price) { toast.error('Enter purchase price for each row'); return; }
      if (!row.mrp || parseFloat(row.mrp) <= 0) { toast.error('Enter MRP for each row'); return; }
      if (!row.total_qty || parseFloat(row.total_qty) <= 0) { toast.error('Enter total qty for each row'); return; }
    }
    setLoading(true);
    try {
      const payload = {
        vendor: selectedVendor, is_paid: isPaid,
        bill_date: billDate,
        round_off: roundOffNum,
        items: rows.map(r => {
          const qty = parseFloat(r.quantity); const totalQty = parseFloat(r.total_qty);
          return { product: r.product.id, purchase_unit: r.purchase_unit, quantity: qty, purchase_price: parseFloat(getBasePrice(r).toFixed(4)), tax: parseFloat(r.tax) || 0, tax_type: r.tax_type, mrp: parseFloat(r.mrp), selling_unit: r.selling_unit, selling_qty: r.purchase_unit === 'case' ? (totalQty / qty) : 1 };
        }),
      };
      const result = await createPurchaseBill(payload);
      const assignedNumber = result?.data?.purchase_number || purchaseNumber;
      toast.success(`Purchase ${assignedNumber} recorded! Payment: ${isPaid ? 'Paid ✅' : 'Not Paid ⏳'}`);
      setRows([emptyRow()]); setSelectedVendor(''); setIsPaid(false);
      refreshPurchaseNumber();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record purchase'); }
    finally { setLoading(false); }
  };

  const subTotal    = rows.reduce((s, r) => s + getRowTotalValue(r), 0);
  const roundOffNum = parseFloat(roundOff) || 0;
  const grandTotal  = subTotal + roundOffNum;

  const Fkey = ({ k }) => (
    <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'monospace' }}>{k}</span>
  );

  return (
    <div>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      <div className="page-header">
        <h1>📦 Purchase</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleClear} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            🔄 Clear <Fkey k="F12" />
          </button>
          {(isAdmin || can('can_access_purchase_return')) && (
            <button className="btn btn-secondary" onClick={() => setShowPurReturn(true)} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>↩️ Purchase Return</button>
          )}
          {(isAdmin || can('can_access_vendor_master')) && (
            <button className="btn btn-secondary" onClick={() => setShowVendor(true)}>🏪 Vendor Master</button>
          )}
          {(isAdmin || can('can_access_product_master')) && (
            <button className="btn btn-secondary" onClick={() => setShowProduct(true)}>📦 Product Master</button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>Purchase No</div>
            <div style={{ padding: '8px 16px', borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: 'var(--accent)', letterSpacing: '0.04em' }}>
              {purchaseNumber}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>
              Bill Date
              {billDate !== new Date().toISOString().split('T')[0] && (
                <span style={{ marginLeft: 8, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>BACK DATE</span>
              )}
            </div>
            <input
              ref={dateRef}
              type="date"
              value={billDate}
              onChange={e => setBillDate(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); vendorRef.current?.focus(); }
                if (e.key === 'F1')    { e.preventDefault(); handleSubmit(); }
              }}
              style={{ padding: '8px 12px', borderRadius: 'var(--radius)', border: '1.5px solid var(--border)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: billDate !== new Date().toISOString().split('T')[0] ? 'var(--accent)' : 'var(--text)', width: 170 }}
            />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label>Vendor *{!selectedVendor && <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— required</span>}</label>
            <select ref={vendorRef} value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)}
                style={{ borderColor: !selectedVendor ? 'var(--red)' : undefined }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const inputs = document.querySelectorAll('td input[placeholder="Scan / search…"]'); if (inputs[0]) inputs[0].focus(); } }}
              >
              <option value="">— Select vendor —</option>
              {vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}{v.phone ? ` · ${v.phone}` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text3)' }}>Payment Status *</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius)', border: `1px solid ${isPaid ? 'var(--green)' : 'var(--border)'}`, background: isPaid ? 'var(--green-dim)' : 'var(--bg3)', color: isPaid ? 'var(--green)' : 'var(--text2)', fontWeight: isPaid ? 700 : 400, transition: 'all 0.15s' }}>
                <input type="radio" name="payment_status" checked={isPaid} onChange={() => setIsPaid(true)} style={{ width: 'auto', accentColor: 'var(--green)' }} />✅ Paid
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius)', border: `1px solid ${!isPaid ? 'var(--yellow)' : 'var(--border)'}`, background: !isPaid ? 'rgba(234,179,8,0.12)' : 'var(--bg3)', color: !isPaid ? 'var(--yellow)' : 'var(--text2)', fontWeight: !isPaid ? 700 : 400, transition: 'all 0.15s' }}>
                <input type="radio" name="payment_status" checked={!isPaid} onChange={() => setIsPaid(false)} style={{ width: 'auto', accentColor: 'var(--yellow)' }} />⏳ Not Paid
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ width: '100%' }}>
          <table style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} /><col style={{ width: '8%' }} /><col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Product</th><th>Pur. Unit</th><th>Qty *</th>
                <th>Total Qty *<div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>auto nos/kg</div></th>
                <th>Price (₹) *</th><th>Tax (%)</th><th>Curr. MRP</th><th>New MRP *</th><th>Sell Unit</th><th>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rowTotal   = getRowTotalValue(row);
                const isCase     = row.purchase_unit === 'case';
                const mrpChanged = row.current_mrp && row.mrp && row.current_mrp !== '—' && parseFloat(row.mrp) !== parseFloat(row.current_mrp);
                const mkKey = (e, col) => { noArrow(e); if (e.key === 'Enter') { e.preventDefault(); nextFocus(row._id, col); } };

                return (
                  <tr key={row._id}>
                    <td style={{ padding: '6px 8px' }}>
                      <ProductSearchCell
                        value={row.product}
                        onSelect={p => selectProduct(row._id, p)}
                        onEnterNext={() => focusCell(row._id, 'unit')}
                        excludeProductIds={rows.filter(r => r.product && r._id !== row._id).map(r => r.product.id)}
                      />
                      {row.product && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                          {row.product.barcode}
                          {row.product.multi_batch && <span style={{ marginLeft: 6, color: 'var(--accent)', fontWeight: 700 }}>· Batch MRP ₹{parseFloat(row.product.batch_mrp || row.product.selling_price).toFixed(2)}</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <select ref={el => registerRef(row._id, 'unit', el)} value={row.purchase_unit}
                        onChange={e => updateRow(row._id, 'purchase_unit', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusCell(row._id, 'qty'); } }}
                        style={{ fontSize: 12, padding: '5px 4px', width: '100%' }}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="number" value={row.quantity} ref={el => registerRef(row._id, 'qty', el)}
                        onChange={e => updateRow(row._id, 'quantity', e.target.value)} onKeyDown={e => mkKey(e, 'qty')} onWheel={noWheel}
                        placeholder="0" min="0" step="0.001" style={{ fontSize: 13, padding: '5px 4px', textAlign: 'right', width: '100%' }} />
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="number" value={row.total_qty} ref={el => registerRef(row._id, 'totalqty', el)}
                        onChange={e => isCase ? updateRow(row._id, 'total_qty', e.target.value) : undefined}
                        onKeyDown={e => mkKey(e, 'totalqty')} onWheel={noWheel} readOnly={!isCase}
                        placeholder={isCase ? 'total' : 'auto'} min="0" step="0.001"
                        style={{ fontSize: 12, padding: '5px 4px', textAlign: 'right', width: '100%', opacity: !isCase ? 0.5 : 1, background: !isCase ? 'var(--bg2)' : undefined, borderColor: isCase ? 'var(--blue)' : undefined }} />
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="number" value={row.purchase_price} ref={el => registerRef(row._id, 'price', el)}
                        onChange={e => updateRow(row._id, 'purchase_price', e.target.value)} onKeyDown={e => mkKey(e, 'price')} onWheel={noWheel}
                        placeholder="0.00" min="0" step="0.01" style={{ fontSize: 13, padding: '5px 4px', textAlign: 'right', width: '100%' }} />
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="number" value={row.tax} ref={el => registerRef(row._id, 'tax', el)}
                        onChange={e => updateRow(row._id, 'tax', e.target.value)} onKeyDown={e => mkKey(e, 'tax')} onWheel={noWheel}
                        placeholder="0" min="0" step="0.01" style={{ fontSize: 12, padding: '5px 4px', textAlign: 'right', width: '100%', marginBottom: 3 }} />
                      <div style={{ display: 'flex', gap: 2 }}>
                        {['excluding', 'including'].map(tt => (
                          <button key={tt} onClick={() => updateRow(row._id, 'tax_type', tt)}
                            style={{ flex: 1, fontSize: 9, padding: '2px 2px', borderRadius: 3, border: `1px solid ${row.tax_type===tt?'var(--accent)':'var(--border)'}`, background: row.tax_type===tt?'var(--accent-dim)':'var(--bg3)', color: row.tax_type===tt?'var(--accent)':'var(--text3)', cursor: 'pointer' }}>
                            {tt === 'excluding' ? 'Excl' : 'Incl'}
                          </button>
                        ))}
                      </div>
                      {row.tax_type === 'including' && parseFloat(row.tax) > 0 && parseFloat(row.purchase_price) > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 1, textAlign: 'right' }}>Base: {fmt(getBasePrice(row))}</div>
                      )}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <div style={{ padding: '5px 6px', background: 'var(--bg2)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', border: '1px solid var(--border)', textAlign: 'right' }}>
                        {row.current_mrp || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="number" value={row.mrp} ref={el => registerRef(row._id, 'mrp', el)}
                        onChange={e => updateRow(row._id, 'mrp', e.target.value)} onKeyDown={e => mkKey(e, 'mrp')} onWheel={noWheel}
                        placeholder="0.00" min="0" step="0.01"
                        style={{ fontSize: 13, padding: '5px 4px', textAlign: 'right', width: '100%', borderColor: mrpChanged ? 'var(--accent)' : undefined, color: mrpChanged ? 'var(--accent)' : undefined }} />
                      {mrpChanged && <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 1 }}>was ₹{row.current_mrp}</div>}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <select value={row.selling_unit} onChange={e => updateRow(row._id, 'selling_unit', e.target.value)} style={{ fontSize: 12, padding: '5px 4px', width: '100%' }}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <div style={{ padding: '5px 6px', background: rowTotal>0?'var(--accent-dim)':'var(--bg2)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--mono)', color: rowTotal>0?'var(--accent)':'var(--text3)', border: `1px solid ${rowTotal>0?'var(--accent)':'var(--border)'}`, textAlign: 'right', fontWeight: 700 }}>
                        {rowTotal > 0 ? fmt(rowTotal) : '—'}
                      </div>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(row._id)}
                        style={{ padding: '2px 6px', marginTop: 3, width: '100%' }} disabled={rows.length === 1}>✕ remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '10px 16px', gap: 12, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Sub Total</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--text2)', minWidth: 100, textAlign: 'right' }}>{fmt(subTotal)}</span>
           <span style={{ fontSize: 13, marginLeft: 24, color: roundOffNum !== 0 ? (roundOffNum > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)', fontWeight: roundOffNum !== 0 ? 700 : 400 }}>
            Round Off{roundOffNum !== 0 ? ` (${roundOffNum > 0 ? '+' : ''}${fmt(roundOffNum)})` : ''}
          </span>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={roundOff}
                onChange={e => setRoundOff(e.target.value)}
                onWheel={noWheel}
                onKeyDown={noArrow}
                placeholder="0.00"
                step="0.01"
                style={{
                  width: 120,
                  padding: '6px 10px',
                  fontFamily: 'var(--mono)',
                  fontSize: 14,
                  fontWeight: 800,
                  textAlign: 'right',
                  borderColor: roundOffNum > 0 ? 'var(--green)' : roundOffNum < 0 ? 'var(--red)' : 'var(--border)',
                  color: roundOffNum > 0 ? 'var(--green)' : roundOffNum < 0 ? 'var(--red)' : 'var(--text3)',
                  borderWidth: roundOffNum !== 0 ? 2 : 1,
                  borderStyle: 'solid',
                  borderRadius: 'var(--radius)',
                  background: roundOffNum > 0 ? 'rgba(22,163,74,0.06)' : roundOffNum < 0 ? 'rgba(220,38,38,0.06)' : undefined,
                  transition: 'all 0.15s',
                }}
              />
              {roundOff !== '' && (
                <button onClick={() => setRoundOff('')}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>✕</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => addRow()}>+ Add Item Row</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
              <div>
                <span style={{ color: 'var(--text3)', fontSize: 13, marginRight: 10 }}>Grand Total </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>{fmt(grandTotal)}</span>
                
                
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ padding: '12px 32px', fontSize: 15 }}>
          {loading ? 'Saving…' : 'Confirm'}
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 7px', marginLeft: 10, fontFamily: 'monospace' }}>F1</span>
        </button>
      </div>

      {showProduct   && <ProductMasterModal  onClose={() => setShowProduct(false)} />}
      {showVendor    && <VendorMasterModal   onClose={() => setShowVendor(false)} />}
      {showPurReturn && <PurchaseReturnModal onClose={() => setShowPurReturn(false)} />}
    </div>
  );
}