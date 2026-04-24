/**
 * ElectronSetup.js
 *
 * First-time setup screen shown inside the Electron app.
 * Lets users choose:
 *   - Server Mode: this PC runs Django + PostgreSQL (the main server)
 *   - Client Mode: connect to another PC's server via IP
 *
 * Also lets users configure the default bill printer.
 */
import React, { useState, useEffect } from 'react';

export default function ElectronSetup({ onComplete }) {
  const [mode, setMode] = useState('server');         // 'server' | 'client'
  const [serverIP, setServerIP] = useState('');
  const [serverPort, setServerPort] = useState('8000');
  const [printers, setPrinters] = useState([]);
  const [defaultPrinter, setDefaultPrinter] = useState('');
  const [localIP, setLocalIP] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load existing config
    const load = async () => {
      if (!window.electronAPI) return;
      const config = await window.electronAPI.loadServerConfig();
      if (config) {
        setMode(config.mode || 'server');
        setServerIP(config.serverIP || '');
        setServerPort(String(config.serverPort || 8000));
      }
      const info = await window.electronAPI.getServerInfo();
      setLocalIP(info.localIP);

      const saved = await window.electronAPI.loadDefaultPrinter();
      const available = await window.electronAPI.getPrinters();
      setPrinters(available);
      setDefaultPrinter(saved || available.find(p => p.isDefault)?.name || '');
    };
    load();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const url = `http://${serverIP}:${serverPort}/api/token/`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // 400 = server reachable (bad credentials expected), 200 would be wrong
      if (res.status === 400 || res.status === 401 || res.status === 200) {
        setTestResult({ ok: true, msg: '✅ Server reachable!' });
      } else {
        setTestResult({ ok: false, msg: `⚠️ Unexpected status: ${res.status}` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: `❌ Cannot reach server: ${e.message}` });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        mode,
        serverIP: mode === 'client' ? serverIP : '127.0.0.1',
        serverPort: parseInt(serverPort),
      };
      await window.electronAPI.saveServerConfig(config);
      if (defaultPrinter) {
        await window.electronAPI.saveDefaultPrinter(defaultPrinter);
      }
      // Store in window for api.js to pick up without reload
      window.__bakesaleServerConfig = config;
      onComplete(config);
    } catch (e) {
      alert('Error saving config: ' + e.message);
    }
    setSaving(false);
  };

  const s = styles;

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logo}>🧁 BAKESALE POS</div>
          <div style={s.subtitle}>Initial Setup</div>
        </div>

        {/* Mode selection */}
        <div style={s.section}>
          <div style={s.label}>This computer is:</div>
          <div style={s.modeRow}>
            <button
              style={{ ...s.modeBtn, ...(mode === 'server' ? s.modeBtnActive : {}) }}
              onClick={() => setMode('server')}
            >
              🖥️ Main Server
              <span style={s.modeDesc}>Runs the database. Other PCs connect to this.</span>
            </button>
            <button
              style={{ ...s.modeBtn, ...(mode === 'client' ? s.modeBtnActive : {}) }}
              onClick={() => setMode('client')}
            >
              💻 Billing Terminal
              <span style={s.modeDesc}>Connects to the main server PC.</span>
            </button>
          </div>
        </div>

        {/* Server mode info */}
        {mode === 'server' && (
          <div style={s.infoBox}>
            <div style={s.infoTitle}>📡 Your LAN IP Address</div>
            <div style={s.ipDisplay}>{localIP || 'Detecting...'}</div>
            <div style={s.infoHint}>
              Tell other PCs to enter this IP when setting up as a Billing Terminal.
            </div>
          </div>
        )}

        {/* Client mode: enter server IP */}
        {mode === 'client' && (
          <div style={s.section}>
            <div style={s.label}>Server IP Address</div>
            <div style={s.inputRow}>
              <input
                style={s.input}
                value={serverIP}
                onChange={e => setServerIP(e.target.value)}
                placeholder="e.g. 192.168.1.100"
              />
              <input
                style={{ ...s.input, width: 80 }}
                value={serverPort}
                onChange={e => setServerPort(e.target.value)}
                placeholder="8000"
              />
              <button style={s.testBtn} onClick={testConnection} disabled={testing || !serverIP}>
                {testing ? '...' : 'Test'}
              </button>
            </div>
            {testResult && (
              <div style={{ ...s.testResult, color: testResult.ok ? '#22c55e' : '#ef4444' }}>
                {testResult.msg}
              </div>
            )}
          </div>
        )}

        {/* Default Bill Printer */}
        <div style={s.section}>
          <div style={s.label}>Default Bill Printer</div>
          <div style={s.hint}>This printer will be used for silent bill printing (no dialog).</div>
          <select
            style={s.select}
            value={defaultPrinter}
            onChange={e => setDefaultPrinter(e.target.value)}
          >
            <option value="">-- Select Printer --</option>
            {printers.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}{p.isDefault ? ' (System Default)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button style={s.saveBtn} onClick={handleSave} disabled={saving || (mode === 'client' && !serverIP)}>
          {saving ? 'Saving...' : '✅ Save & Continue'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    background: '#1e293b', borderRadius: 16, padding: 36,
    width: 520, boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    border: '1px solid #334155',
  },
  header: { textAlign: 'center', marginBottom: 28 },
  logo: { fontSize: 28, fontWeight: 900, color: '#f59e0b', letterSpacing: 2 },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  section: { marginBottom: 24 },
  label: { color: '#e2e8f0', fontWeight: 600, marginBottom: 8, fontSize: 14 },
  hint: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  modeRow: { display: 'flex', gap: 12 },
  modeBtn: {
    flex: 1, padding: '14px 12px', borderRadius: 10,
    border: '2px solid #334155', background: '#0f172a',
    color: '#94a3b8', cursor: 'pointer', textAlign: 'center',
    fontSize: 15, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 6,
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    borderColor: '#f59e0b', background: '#1c1917', color: '#fbbf24',
  },
  modeDesc: { fontSize: 11, color: '#64748b', fontWeight: 400 },
  infoBox: {
    background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 10,
    padding: 16, marginBottom: 24, textAlign: 'center',
  },
  infoTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  ipDisplay: {
    fontSize: 28, fontWeight: 700, color: '#22d3ee',
    fontFamily: 'monospace', letterSpacing: 2,
  },
  infoHint: { color: '#64748b', fontSize: 11, marginTop: 8 },
  inputRow: { display: 'flex', gap: 8, alignItems: 'center' },
  input: {
    flex: 1, padding: '10px 12px', borderRadius: 8,
    border: '1px solid #334155', background: '#0f172a',
    color: '#e2e8f0', fontSize: 14, outline: 'none',
  },
  testBtn: {
    padding: '10px 16px', borderRadius: 8,
    background: '#334155', border: 'none',
    color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
  },
  testResult: { marginTop: 8, fontSize: 13 },
  select: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #334155', background: '#0f172a',
    color: '#e2e8f0', fontSize: 14, outline: 'none',
  },
  saveBtn: {
    width: '100%', padding: '14px', borderRadius: 10,
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    border: 'none', color: '#000', fontWeight: 700,
    fontSize: 16, cursor: 'pointer', marginTop: 8,
  },
};