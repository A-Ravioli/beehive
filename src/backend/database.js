const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs').promises;
const { setupLogging } = require('../utils/logging');
const { paths } = require('../config/paths');

const logger = setupLogging('database');
let db = null;

// Initialize database
async function setupDatabase() {
  try {
    // Ensure database directory exists
    await fs.mkdir(path.dirname(paths.db.main), { recursive: true });

    // Initialize SQLite database
    db = new Database(paths.db.main, {
      verbose: logger.debug
    });

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
      -- User Management
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS preferences (
        user_id TEXT PRIMARY KEY,
        settings JSON NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Device Management
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capabilities JSON NOT NULL,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS compute_resources (
        device_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        available INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (device_id, resource_type),
        FOREIGN KEY (device_id) REFERENCES devices(id)
      );

      -- Model Management
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        config JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS model_partitions (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        partition_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models(id),
        FOREIGN KEY (device_id) REFERENCES devices(id)
      );

      -- Document Management
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
      CREATE INDEX IF NOT EXISTS idx_compute_resources_updated ON compute_resources(updated_at);
      CREATE INDEX IF NOT EXISTS idx_model_partitions_status ON model_partitions(status);
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
    `);

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

// Get database instance
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Close database connection
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

module.exports = {
  setupDatabase,
  getDatabase,
  closeDatabase
}; 