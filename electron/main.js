// Оболочка Electron: одно окно, в котором открывается index.html.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 720,
    minHeight: 560,
    title: 'EasyType',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#17181c',
    // Окно показывается уже отрисованным, без белой вспышки
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // Приложению не нужны ни новые окна, ни переходы на другие страницы
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());

  // Меню убрано, поэтому F11 для полного экрана обрабатываем сами
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

// Повторный запуск не открывает второе окно, а поднимает первое
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
