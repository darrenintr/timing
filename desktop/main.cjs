const { app, BrowserWindow, net, protocol } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const webRoot = path.resolve(__dirname, '..', 'www');
protocol.registerSchemesAsPrivileged([{scheme:'timing', privileges:{standard:true, secure:true, supportFetchAPI:true, allowServiceWorkers:true}}]);

function serveApplication(request) {
  const url = new URL(request.url);
  if (url.host !== 'app') return new Response('Unknown host', {status:404});
  const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const target = path.resolve(webRoot, filename);
  const relative = path.relative(webRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Invalid path', {status:403});
  return net.fetch(pathToFileURL(target).toString());
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 640,
    backgroundColor: '#f5f7f3',
    title: 'Timing',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.loadURL('timing://app/');
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
}

app.whenReady().then(() => {
  protocol.handle('timing', serveApplication);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
