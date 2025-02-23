// TODO: Main Electron Entry Point
// TODO: Initialize app window
// TODO: Set up IPC communication
// TODO: Handle app lifecycle events
// TODO: Implement system tray integration
// TODO: Set up auto-updates
// TODO: Initialize backend services
// TODO: Handle deep linking
// TODO: Implement crash reporting
// TODO: Set up analytics
// TODO: Handle external protocols
// TODO: Implement security policies 

const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { setupLogging } = require('./utils/logging');
const { initializeServer } = require('./backend/server');
const { setupPaths } = require('./config/paths');
const config = require('./config/default');
const offlineCapabilities = require('./offline/capabilities');
const p2pNetwork = require('./network/p2p');
const storage = require('./storage/structure');

// Initialize configuration
const store = new Store();
let mainWindow = null;
let tray = null;
const isDev = process.env.NODE_ENV === 'development';
let isQuitting = false;

// Setup logging
const logger = setupLogging('main');

// Initialize application
async function initialize() {
  try {
    // Initialize core systems
    await config.initialize();
    await storage.initialize();
    await offlineCapabilities.initialize();
    await p2pNetwork.initialize();
    await initializeServer();

    logger.info('Core systems initialized');
  } catch (err) {
    logger.error('Failed to initialize core systems:', err);
    throw err;
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    show: false // Don't show until ready
  });

  // Load application
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));
  }

  // Window event handlers
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icons/tray.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => mainWindow.show()
    },
    {
      label: 'Network Status',
      submenu: [
        {
          label: 'Online Mode',
          type: 'radio',
          checked: !config.get('features.offlineMode'),
          click: () => toggleOfflineMode(false)
        },
        {
          label: 'Offline Mode',
          type: 'radio',
          checked: config.get('features.offlineMode'),
          click: () => toggleOfflineMode(true)
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: 'Settings',
      click: () => showSettings()
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Beehive');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

// IPC Communication
function setupIPC() {
  // System events
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPath', (event, name) => app.getPath(name));
  ipcMain.handle('app:getPaths', () => setupPaths());

  // Configuration
  ipcMain.handle('config:get', (event, key) => config.get(key));
  ipcMain.handle('config:set', async (event, key, value) => {
    try {
      await config.set(key, value);
      return true;
    } catch (err) {
      logger.error(`Failed to set config ${key}:`, err);
      throw err;
    }
  });

  // Network status
  ipcMain.handle('network:status', () => {
    return {
      online: !config.get('features.offlineMode'),
      p2pConnected: p2pNetwork.isConnected(),
      peers: p2pNetwork.getPeerCount()
    };
  });

  // Resource metrics
  ipcMain.handle('system:metrics', async () => {
    return {
      storage: await storage.calculateStorageUsage(),
      resources: await offlineCapabilities.getCurrentResourceMetrics()
    };
  });
}

// Toggle offline mode
async function toggleOfflineMode(enabled) {
  try {
    await config.set('features.offlineMode', enabled);
    mainWindow.webContents.send('network:modeChanged', enabled);
  } catch (err) {
    logger.error('Failed to toggle offline mode:', err);
  }
}

// Show settings window
function showSettings() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('app:showSettings');
  }
}

// Error reporting
function setupErrorReporting() {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
  });
}

// Application lifecycle
app.on('ready', async () => {
  try {
    // Initialize core systems
    await initialize();

    // Create UI
    createWindow();
    createTray();
    setupIPC();
    setupErrorReporting();

    // Set up auto-updates
    if (process.env.NODE_ENV === 'production') {
      require('./utils/updater').checkForUpdates();
    }

    logger.info('Application ready');
  } catch (err) {
    logger.error('Failed to start application:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Handle deep linking
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('beehive', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('beehive');
}

// Handle external protocols
app.on('open-url', (event, url) => {
  event.preventDefault();
  
  if (mainWindow) {
    mainWindow.webContents.send('app:deepLink', url);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  }
}); 