// Local Storage Path Configuration

const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const { setupLogging } = require('../utils/logging');

const logger = setupLogging('paths');

// Base application directory (platform specific)
const getBaseDirectory = () => {
  const platform = os.platform();
  switch (platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'beehive');
    case 'win32':
      return path.join(process.env.APPDATA, 'beehive');
    default: // linux and others
      return path.join(os.homedir(), '.local', 'share', 'beehive');
  }
};

// Version tracking for path structure
const PATHS_VERSION = '1.0.0';
const PATHS_VERSION_FILE = 'paths-version';

// Define all local storage paths
const paths = {
  // Core paths
  base: {
    data: getBaseDirectory(),
    temp: path.join(os.tmpdir(), 'beehive'),
    logs: path.join(getBaseDirectory(), 'logs'),
  },

  // Database paths
  db: {
    main: path.join(getBaseDirectory(), 'db', 'beehive.db'),
    vector: path.join(getBaseDirectory(), 'db', 'vectors.db'),
    models: path.join(getBaseDirectory(), 'db', 'models.db'),
    backup: path.join(getBaseDirectory(), 'db', 'backups'),
  },

  // Model storage
  models: {
    repository: path.join(getBaseDirectory(), 'models'),
    cache: path.join(getBaseDirectory(), 'models', 'cache'),
    custom: path.join(getBaseDirectory(), 'models', 'custom'),
    configs: path.join(getBaseDirectory(), 'models', 'configs'),
  },

  // Document storage
  documents: {
    uploads: path.join(getBaseDirectory(), 'documents', 'uploads'),
    processed: path.join(getBaseDirectory(), 'documents', 'processed'),
    embeddings: path.join(getBaseDirectory(), 'documents', 'embeddings'),
    exports: path.join(getBaseDirectory(), 'documents', 'exports'),
  },

  // Cache directories
  cache: {
    inference: path.join(getBaseDirectory(), 'cache', 'inference'),
    chunks: path.join(getBaseDirectory(), 'cache', 'chunks'),
    network: path.join(getBaseDirectory(), 'cache', 'network'),
    ui: path.join(getBaseDirectory(), 'cache', 'ui'),
  },

  // Security
  security: {
    keys: path.join(getBaseDirectory(), 'security', 'keys'),
    certs: path.join(getBaseDirectory(), 'security', 'certs'),
    tokens: path.join(getBaseDirectory(), 'security', 'tokens'),
  },

  // P2P networking
  network: {
    peers: path.join(getBaseDirectory(), 'network', 'peers'),
    discovery: path.join(getBaseDirectory(), 'network', 'discovery'),
    state: path.join(getBaseDirectory(), 'network', 'state'),
  },

  // Logging
  logs: {
    app: path.join(getBaseDirectory(), 'logs', 'app'),
    inference: path.join(getBaseDirectory(), 'logs', 'inference'),
    network: path.join(getBaseDirectory(), 'logs', 'network'),
    error: path.join(getBaseDirectory(), 'logs', 'error'),
  }
};

// Path initialization and validation
const initializePaths = async () => {
  try {
    // Create base directory if it doesn't exist
    await fs.mkdir(paths.base.data, { recursive: true });

    // Check version file
    const versionPath = path.join(paths.base.data, PATHS_VERSION_FILE);
    let needsMigration = false;

    try {
      const currentVersion = await fs.readFile(versionPath, 'utf8');
      if (currentVersion !== PATHS_VERSION) {
        needsMigration = true;
      }
    } catch (err) {
      // Version file doesn't exist, create it
      await fs.writeFile(versionPath, PATHS_VERSION);
    }

    // Create all directories
    const createDirs = async (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          await fs.mkdir(obj[key], { recursive: true });
          // Set appropriate permissions (restrictive by default)
          await fs.chmod(obj[key], 0o700);
        } else if (typeof obj[key] === 'object') {
          await createDirs(obj[key]);
        }
      }
    };

    await createDirs(paths);

    // Set up temporary directory with cleanup
    const cleanupTemp = async () => {
      try {
        await fs.rm(paths.base.temp, { recursive: true, force: true });
        await fs.mkdir(paths.base.temp, { recursive: true });
      } catch (err) {
        logger.error('Failed to cleanup temp directory:', err);
      }
    };

    // Clean temp directory on startup
    await cleanupTemp();

    // Schedule periodic cleanup (every 24 hours)
    setInterval(cleanupTemp, 24 * 60 * 60 * 1000);

    if (needsMigration) {
      await migratePaths();
    }

    logger.info('Path initialization complete');
    return true;
  } catch (err) {
    logger.error('Failed to initialize paths:', err);
    throw err;
  }
};

// Path migration logic
const migratePaths = async () => {
  try {
    // Implement migration logic here when needed
    logger.info('Path migration complete');
    await fs.writeFile(path.join(paths.base.data, PATHS_VERSION_FILE), PATHS_VERSION);
  } catch (err) {
    logger.error('Failed to migrate paths:', err);
    throw err;
  }
};

// Space management
const checkSpace = async () => {
  try {
    const baseDir = paths.base.data;
    const stats = await fs.statfs(baseDir);
    const freeSpace = stats.bfree * stats.bsize;
    const totalSpace = stats.blocks * stats.bsize;
    const usedSpace = totalSpace - freeSpace;
    
    return {
      free: freeSpace,
      total: totalSpace,
      used: usedSpace,
      percentUsed: (usedSpace / totalSpace) * 100
    };
  } catch (err) {
    logger.error('Failed to check space:', err);
    throw err;
  }
};

module.exports = {
  paths,
  initializePaths,
  checkSpace,
  getBaseDirectory
}; 