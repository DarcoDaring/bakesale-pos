const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');

const BACKEND_PORT = 8000;
let mainWindow = null;
let djangoProcess = null;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function waitForDjango(port, retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const client = new net.Socket();
      client.setTimeout(1000);
      client.connect(port, '127.0.0.1', () => { client.destroy(); resolve(); });
      client.on('error', () => {
        client.destroy();
        if (++attempts >= retries) return reject(new Error('Django failed to start'));
        setTimeout(check, 1000);
      });
      client.on('timeout', () => {
        client.destroy();
        if (++attempts >= retries) return reject(new Error('Django timeout'));
        setTimeout(check, 1000);
      });
    };
    check();
  });
}

function isPortFree(port) {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function startDjango() {
  const free = await isPortFree(BACKEND_PORT);
  if (!free) {
    console.log('Port', BACKEND_PORT, 'in use — killing existing process...');
    // Kill any existing python/django on this port
    const { execSync } = require('child_process');
    try {
      execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${BACKEND_PORT} ^| findstr LISTENING') do taskkill /f /pid %a`, { shell: true });
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // Find the backend folder — go up from electron/ to project root, then into backend/
  // Find backend path:
  // 1. Check saved config for custom backend path
  // 2. If packaged, check next to the exe
  // 3. Fall back to relative path (dev mode)
  let backendPath;
  const backendConfigPath = path.join(app.getPath('userData'), 'backend-path.json');
  
  if (fs.existsSync(backendConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(backendConfigPath, 'utf8'));
      if (cfg.backendPath && fs.existsSync(cfg.backendPath)) {
        backendPath = cfg.backendPath;
      }
    } catch {}
  }
  
  if (!backendPath) {
    if (app.isPackaged) {
      // Try next to the exe (e.g. E:\bakesale_complete\bakesale_complete\backend)
      const exeDir = path.dirname(app.getPath('exe'));
      const candidates = [
        path.join(exeDir, '..', 'bakesale_complete', 'backend'),
        path.join(exeDir, 'backend'),
        path.join(exeDir, '..', 'backend'),
        'E:\\bakesale_complete\\bakesale_complete\\backend',
      ];
      for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'manage.py'))) {
          backendPath = c;
          break;
        }
      }
    }
    if (!backendPath) {
      backendPath = path.join(__dirname, '..', 'backend');
    }
  }
  
  const managePy = path.join(backendPath, 'manage.py');

  const venvPython = path.join(backendPath, 'venv', 'Scripts', 'python.exe');
  const python = fs.existsSync(venvPython) ? venvPython : 'python';

  console.log('Starting Django:', backendPath);

  djangoProcess = spawn(python, [managePy, 'runserver', `0.0.0.0:${BACKEND_PORT}`], {
    cwd: backendPath,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  djangoProcess.stdout.on('data', d => console.log('[Django]', d.toString().trim()));
  djangoProcess.stderr.on('data', d => console.error('[Django]', d.toString().trim()));
  djangoProcess.on('exit', code => { console.log('Django exited:', code); djangoProcess = null; });

  await waitForDjango(BACKEND_PORT);
  console.log('Django ready!');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Bakesale POS',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
mainWindow.setMenu(null);
mainWindow.maximize();
  // ── Find the built frontend index.html ──────────────────────────────────────
  let indexPath;
  if (app.isPackaged) {
    // When packaged, frontend/build is inside resources/app/frontend/build
    indexPath = path.join(process.resourcesPath, 'app', 'frontend', 'build', 'index.html');
    // Fallback: try asar unpacked location
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(path.dirname(app.getPath('exe')), 'resources', 'app', 'frontend', 'build', 'index.html');
    }
  } else {
    indexPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
  }

  console.log('Looking for frontend at:', indexPath);
  console.log('Exists:', fs.existsSync(indexPath));

  if (!fs.existsSync(indexPath)) {
    // Show helpful error instead of blank white screen
    mainWindow.loadURL(`data:text/html,
      <html>
      <body style="font-family:sans-serif;padding:40px;background:#1e293b;color:#e2e8f0">
        <h2 style="color:#f59e0b">⚠️ Frontend build not found</h2>
        <p>Expected at: <code style="background:#0f172a;padding:4px 8px;border-radius:4px">${indexPath}</code></p>
        <p>Please run in Command Prompt:</p>
        <pre style="background:#0f172a;padding:16px;border-radius:8px">cd frontend\nnom run build</pre>
        <p>Then restart the app.</p>
      </body>
      </html>
    `);
    return;
  }

  const fileUrl = `file:///${indexPath.replace(/\\/g, '/')}`;
  console.log('Loading URL:', fileUrl);
  mainWindow.loadURL(fileUrl);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-printers', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  } catch { return []; }
});

ipcMain.handle('get-default-printer', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const def = printers.find(p => p.isDefault);
    return def ? def.name : (printers[0]?.name || null);
  } catch { return null; }
});

ipcMain.handle('silent-print', async (event, { html, printerName, options }) => {
  return new Promise((resolve, reject) => {
    const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print({ silent: true, printBackground: true, deviceName: printerName || '', ...options },
        (success, errorType) => { printWin.close(); success ? resolve({ success: true }) : reject(new Error(errorType)); });
    });
  });
});

ipcMain.handle('print-with-dialog', async (event, { html, options }) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print({ silent: false, printBackground: true, ...options },
        (success, errorType) => { printWin.close(); resolve({ success, reason: errorType }); });
    });
  });
});

ipcMain.handle('get-server-info', () => ({ localIP: getLocalIP(), port: BACKEND_PORT, isServer: djangoProcess !== null }));
ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

ipcMain.handle('save-default-printer', (event, printerName) => {
  const configPath = path.join(app.getPath('userData'), 'printer-config.json');
  fs.writeFileSync(configPath, JSON.stringify({ defaultPrinter: printerName }));
  return true;
});

ipcMain.handle('load-default-printer', () => {
  const configPath = path.join(app.getPath('userData'), 'printer-config.json');
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')).defaultPrinter; } catch { return null; }
});

ipcMain.handle('save-server-config', (event, config) => {
  const configPath = path.join(app.getPath('userData'), 'server-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  return true;
});

ipcMain.handle('load-server-config', () => {
  const configPath = path.join(app.getPath('userData'), 'server-config.json');
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return null; }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // Check server config
    const configPath = path.join(app.getPath('userData'), 'server-config.json');
    let isClientMode = false;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      isClientMode = config?.mode === 'client';
    } catch {}

    if (!isClientMode) {
      await startDjango();
    }

    createWindow();
  } catch (err) {
    console.error('Startup error:', err);
    dialog.showErrorBox('Startup Error', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
app.on('before-quit', () => { if (djangoProcess) { djangoProcess.kill(); } });