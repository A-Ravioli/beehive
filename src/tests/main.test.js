const { jest } = require('@jest/globals');
const { app, BrowserWindow, ipcMain, Tray } = require('electron');
const path = require('path');

// Mock the required modules
jest.mock('../config/default');
jest.mock('../storage/structure');
jest.mock('../offline/capabilities');
jest.mock('../network/p2p');
jest.mock('../backend/server');

describe('Main Process', () => {
  let main;

  beforeEach(() => {
    // Reset modules before each test
    jest.resetModules();
    main = require('../main');
  });

  describe('application lifecycle', () => {
    it('should initialize core systems on ready', async () => {
      const config = require('../config/default');
      const storage = require('../storage/structure');
      const offline = require('../offline/capabilities');
      const p2p = require('../network/p2p');
      const server = require('../backend/server');

      // Trigger ready event
      await app.emit('ready');

      expect(config.initialize).toHaveBeenCalled();
      expect(storage.initialize).toHaveBeenCalled();
      expect(offline.initialize).toHaveBeenCalled();
      expect(p2p.initialize).toHaveBeenCalled();
      expect(server.initializeServer).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const config = require('../config/default');
      config.initialize.mockRejectedValueOnce(new Error('Init error'));

      const quit = jest.spyOn(app, 'quit');

      // Trigger ready event
      await app.emit('ready');

      expect(quit).toHaveBeenCalled();
    });

    it('should quit on window-all-closed (non-darwin)', async () => {
      const platform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });

      const quit = jest.spyOn(app, 'quit');
      
      await app.emit('window-all-closed');
      
      expect(quit).toHaveBeenCalled();

      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: platform
      });
    });

    it('should not quit on window-all-closed (darwin)', async () => {
      const platform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });

      const quit = jest.spyOn(app, 'quit');
      
      await app.emit('window-all-closed');
      
      expect(quit).not.toHaveBeenCalled();

      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: platform
      });
    });
  });

  describe('window management', () => {
    it('should create main window', () => {
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1200,
          height: 800,
          webPreferences: expect.any(Object)
        })
      );
    });

    it('should load correct URL in development', () => {
      process.env.NODE_ENV = 'development';
      const window = new BrowserWindow();
      
      expect(window.loadURL).toHaveBeenCalledWith('http://localhost:3000');
      expect(window.webContents.openDevTools).toHaveBeenCalled();
    });

    it('should load correct file in production', () => {
      process.env.NODE_ENV = 'production';
      const window = new BrowserWindow();
      
      expect(window.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html')
      );
    });

    it('should handle window close events', () => {
      const window = new BrowserWindow();
      const event = { preventDefault: jest.fn() };

      window.emit('close', event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(window.hide).toHaveBeenCalled();
    });
  });

  describe('system tray', () => {
    it('should create system tray', () => {
      expect(Tray).toHaveBeenCalled();
      expect(Tray.prototype.setToolTip).toHaveBeenCalledWith('Beehive');
      expect(Tray.prototype.setContextMenu).toHaveBeenCalled();
    });

    it('should handle tray click events', () => {
      const tray = new Tray();
      const window = new BrowserWindow();

      tray.emit('click');
      
      expect(window.isVisible).toHaveBeenCalled();
    });

    it('should handle context menu actions', () => {
      const window = new BrowserWindow();
      const tray = new Tray();

      // Simulate show window action
      const menu = tray.setContextMenu.mock.calls[0][0];
      menu.items.find(item => item.label === 'Show Window').click();
      
      expect(window.show).toHaveBeenCalled();
    });
  });

  describe('IPC communication', () => {
    it('should handle app:getVersion', async () => {
      const handler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'app:getVersion'
      )[1];

      const version = await handler();
      expect(version).toBe(app.getVersion());
    });

    it('should handle app:getPath', async () => {
      const handler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'app:getPath'
      )[1];

      const path = await handler({}, 'userData');
      expect(path).toBe(app.getPath('userData'));
    });

    it('should handle config:get', async () => {
      const config = require('../config/default');
      const handler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'config:get'
      )[1];

      await handler({}, 'test.key');
      expect(config.get).toHaveBeenCalledWith('test.key');
    });

    it('should handle network:status', async () => {
      const handler = ipcMain.handle.mock.calls.find(
        call => call[0] === 'network:status'
      )[1];

      const status = await handler();
      expect(status).toHaveProperty('online');
      expect(status).toHaveProperty('p2pConnected');
    });
  });

  describe('error handling', () => {
    it('should handle uncaught exceptions', () => {
      const error = new Error('Test error');
      process.emit('uncaughtException', error);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Uncaught Exception')
      );
    });

    it('should handle unhandled rejections', () => {
      const error = new Error('Test error');
      process.emit('unhandledRejection', error);
      
      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled Rejection')
      );
    });
  });

  describe('deep linking', () => {
    it('should set up protocol handler', () => {
      expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('beehive');
    });

    it('should handle open-url events', () => {
      const window = new BrowserWindow();
      const event = { preventDefault: jest.fn() };
      const url = 'beehive://test';

      app.emit('open-url', event, url);
      
      expect(event.preventDefault).toHaveBeenCalled();
      expect(window.webContents.send).toHaveBeenCalledWith(
        'app:deepLink',
        url
      );
    });
  });
}); 