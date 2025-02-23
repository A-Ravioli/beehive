// Mock Electron
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => `/mock/path/${name}`),
    getVersion: jest.fn(() => '1.0.0'),
    on: jest.fn(),
    quit: jest.fn(),
    setAsDefaultProtocolClient: jest.fn()
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    on: jest.fn(),
    webContents: {
      openDevTools: jest.fn(),
      send: jest.fn()
    },
    show: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
    on: jest.fn()
  })),
  Menu: {
    buildFromTemplate: jest.fn(() => ({
      popup: jest.fn()
    }))
  }
}));

// Mock better-sqlite3
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    }),
    exec: jest.fn(),
    transaction: jest.fn()
  }));
});

// Mock node-webrtc
jest.mock('node-webrtc', () => ({
  RTCPeerConnection: jest.fn().mockImplementation(() => ({
    createDataChannel: jest.fn(),
    createOffer: jest.fn(),
    setLocalDescription: jest.fn(),
    setRemoteDescription: jest.fn(),
    onicecandidate: jest.fn(),
    ondatachannel: jest.fn()
  }))
}));

// Mock fs promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  chmod: jest.fn(),
  rm: jest.fn(),
  statfs: jest.fn()
}));

// Global test setup
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test teardown
afterEach(() => {
  jest.resetModules();
}); 