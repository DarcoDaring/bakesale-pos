const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer (React app)
contextBridge.exposeInMainWorld('electronAPI', {

  // ── Printer APIs ────────────────────────────────────────────────────────────

  /** Get list of all available printers */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /** Get system default printer name */
  getDefaultPrinter: () => ipcRenderer.invoke('get-default-printer'),

  /**
   * Silent print (no dialog) — for bill printing to default/saved printer
   * @param {string} html  - Full HTML string to print
   * @param {string} printerName - Printer name
   * @param {object} options - { pageSize, copies, etc. }
   */
  silentPrint: (html, printerName, options) =>
    ipcRenderer.invoke('silent-print', { html, printerName, options }),

  /**
   * Print with dialog — for barcode & report printing
   * @param {string} html - Full HTML string to print
   * @param {object} options - print options
   */
  printWithDialog: (html, options) =>
    ipcRenderer.invoke('print-with-dialog', { html, options }),

  // ── Printer config persistence ───────────────────────────────────────────────
  saveDefaultPrinter: (name) => ipcRenderer.invoke('save-default-printer', name),
  loadDefaultPrinter: () => ipcRenderer.invoke('load-default-printer'),

  // ── Server config ────────────────────────────────────────────────────────────
  /** Save server/client mode config */
  saveServerConfig: (config) => ipcRenderer.invoke('save-server-config', config),
  /** Load server/client mode config */
  loadServerConfig: () => ipcRenderer.invoke('load-server-config'),
  /** Get local IP and server status */
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),

  // ── Misc ─────────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /** Check if running inside Electron */
  isElectron: true,
});
