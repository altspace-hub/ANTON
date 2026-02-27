import { app, Tray, Menu, shell, BrowserWindow, nativeImage, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── .env helpers ─────────────────────────────────────────────────────────────

function getEnvPath(): string {
  return app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), '.env')
    : path.join(__dirname, '..', '.env');
}

function readEnvFile(): Record<string, string> {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function writeEnvValues(updates: Record<string, string>): void {
  const envPath = getEnvPath();
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  let content = existing;

  for (const [key, value] of Object.entries(updates)) {
    if (!value) continue;                               // skip blanks
    const re = new RegExp(`^(${key}=.*)$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
  // Re-apply to current process so the server picks them up
  for (const [key, value] of Object.entries(updates)) {
    if (value) process.env[key] = value;
  }
}

function hasApiKeyConfigured(): boolean {
  const env = readEnvFile();
  const key = env['ANTHROPIC_API_KEY'] || process.env.ANTHROPIC_API_KEY || '';
  return key.length > 0;
}

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const PORT = process.env.PORT || 3001;
const SERVER_URL = `http://localhost:${PORT}`;

let tray: Tray | null = null;
let serverStarted = false;
let logsWindow: BrowserWindow | null = null;
const logBuffer: string[] = [];

function captureLog(level: string, ...args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(' ')}`;
  logBuffer.push(line);
  if (logBuffer.length > 500) logBuffer.shift();
  // Relay to logsWindow if open
  logsWindow?.webContents.send('log-line', line);
}

// Patch console to capture server logs
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
console.log = (...args) => { origLog(...args); captureLog('INFO', ...args); };
console.error = (...args) => { origErr(...args); captureLog('ERROR', ...args); };

function getIconPath(name: 'tray-active' | 'tray-idle' | 'tray-loading'): string {
  const iconsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'electron', 'icons')
    : path.join(__dirname, '..', 'electron', 'icons');
  return path.join(iconsDir, `${name}.png`);
}

function openInBrowser() {
  shell.openExternal(SERVER_URL);
}

function getLoginItemEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

function toggleStartOnLogin() {
  const current = getLoginItemEnabled();
  app.setLoginItemSettings({ openAtLogin: !current });
  updateTrayMenu();
}

function openLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }
  logsWindow = new BrowserWindow({
    width: 700,
    height: 450,
    title: 'openEXPERT — Server Logs',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: app.isPackaged
        ? path.join(process.resourcesPath, 'app', 'dist', 'electron', 'logs-preload.js')
        : path.join(__dirname, '..', 'dist', 'electron', 'logs-preload.js'),
    },
  });

  // Load a simple HTML page for logs
  const logsHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Server Logs</title>
  <style>
    body { margin: 0; background: #1a1a1a; color: #d4d4d4; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
    #logs { padding: 10px; white-space: pre-wrap; word-break: break-all; }
    .error { color: #f87171; }
    .info { color: #d4d4d4; }
  </style>
</head>
<body>
  <div id="logs"></div>
  <script>
    window.electronAPI?.onLogLine((line) => {
      const div = document.getElementById('logs');
      const el = document.createElement('div');
      el.className = line.includes('[ERROR]') ? 'error' : 'info';
      el.textContent = line;
      div.appendChild(el);
      window.scrollTo(0, document.body.scrollHeight);
    });
  </script>
</body>
</html>`;

  logsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(logsHtml)}`);
  logsWindow.on('closed', () => { logsWindow = null; });
}

function updateTrayMenu() {
  if (!tray) return;
  const loginEnabled = getLoginItemEnabled();
  const menu = Menu.buildFromTemplate([
    {
      label: serverStarted ? '● openEXPERT — Running' : '○ openEXPERT — Starting…',
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Open in Browser', click: openInBrowser },
    { type: 'separator' },
    {
      label: 'Start on Login',
      type: 'checkbox',
      checked: loginEnabled,
      click: toggleStartOnLogin,
    },
    { type: 'separator' },
    { label: 'View Logs…', click: openLogsWindow },
    { type: 'separator' },
    { label: 'Quit openEXPERT', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const iconPath = getIconPath(serverStarted ? 'tray-active' : 'tray-idle');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('openEXPERT');

  // macOS: set as template image for dark/light mode
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      openInBrowser();
    }
  });

  updateTrayMenu();
}

async function startServer() {
  console.log('[electron] Starting openEXPERT server...');

  try {
    const serverPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'dist', 'server', 'index.js')
      : path.join(__dirname, '..', 'server', 'index.ts');

    if (app.isPackaged) {
      await import(serverPath);
    } else {
      // Development: use tsx to run the TypeScript server
      const { spawn } = await import('child_process');
      const tsx = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
      const serverProc = spawn(process.execPath, [tsx, serverPath], {
        stdio: 'pipe',
        env: { ...process.env },
      });
      serverProc.stdout?.on('data', (d) => console.log(d.toString().trim()));
      serverProc.stderr?.on('data', (d) => console.error(d.toString().trim()));
    }

    // Wait for server to be ready
    await waitForServer(SERVER_URL, 30000);
    serverStarted = true;

    // Update tray icon to active
    if (tray) {
      const icon = nativeImage.createFromPath(getIconPath('tray-active'));
      if (process.platform === 'darwin') icon.setTemplateImage(true);
      tray.setImage(icon);
    }
    updateTrayMenu();

    console.log(`[electron] Server ready at ${SERVER_URL}`);
    openInBrowser();
  } catch (err) {
    console.error('[electron] Server failed to start:', err);
    if (tray) {
      const icon = nativeImage.createFromPath(getIconPath('tray-idle'));
      tray.setImage(icon);
    }
    updateTrayMenu();
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

// macOS: hide dock icon (tray-only app)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

// ── First-run setup wizard ────────────────────────────────────────────────────

function showSetupWizard(): Promise<void> {
  return new Promise((resolve) => {
    const wizardWindow = new BrowserWindow({
      width: 540,
      height: 660,
      resizable: false,
      title: 'openEXPERT — Setup',
      center: true,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: app.isPackaged
          ? path.join(process.resourcesPath, 'app', 'dist', 'electron', 'wizard-preload.js')
          : path.join(__dirname, '..', 'electron', 'wizard-preload.ts'),
      },
    });

    const wizardHtml = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'electron', 'setup-wizard.html')
      : path.join(__dirname, '..', 'electron', 'setup-wizard.html');

    wizardWindow.loadFile(wizardHtml);
    if (!app.isPackaged) wizardWindow.webContents.openDevTools({ mode: 'detach' });

    ipcMain.handleOnce('wizard:save-config', async (_event, config: Record<string, string>) => {
      writeEnvValues(config);
      wizardWindow.close();
      resolve();
    });

    ipcMain.handleOnce('wizard:skip', async () => {
      wizardWindow.close();
      resolve();
    });

    wizardWindow.on('closed', () => resolve());
  });
}

app.whenReady().then(async () => {
  createTray();

  // Show first-run wizard if no API key is configured
  if (!hasApiKeyConfigured()) {
    console.log('[electron] No API key found — showing setup wizard');
    await showSetupWizard();
  }

  await startServer();
});

app.on('window-all-closed', () => {
  // Prevent app quit when all windows closed (tray app — stays in system tray)
});

app.on('before-quit', () => {
  console.log('[electron] Shutting down...');
});

// Handle second instance
app.on('second-instance', () => {
  openInBrowser();
});
