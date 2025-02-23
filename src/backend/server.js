// TODO: Express Server Setup (Local Only - runs as part of Electron process)
// TODO: Initialize SQLite database (local file-based database)
// TODO: Set up local authentication system
// TODO: Implement local API routes
// TODO: Set up local WebSocket for real-time updates
// TODO: Initialize local vector database (e.g., LanceDB/ChromaDB local instance)
// TODO: Set up document processing pipeline with local file system
// TODO: Implement local model management
// TODO: Handle distributed inference through P2P
// TODO: Set up local caching
// TODO: Implement basic rate limiting for API stability
// TODO: Set up local logging
// TODO: Implement local security measures
// TODO: Handle error reporting locally 

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const { setupLogging } = require('../utils/logging');
const { setupDatabase, closeDatabase } = require('./database');
const { paths } = require('../config/paths');

// Import studio collector
const collectorApp = require('../studio/collector');

const logger = setupLogging('server');
const app = express();
let wss = null;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// Mount collector app for document processing
app.use('/collector', collectorApp);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket message handler
function handleMessage(ws, message) {
  try {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      
      case 'document_update':
        // Broadcast document updates to all clients
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify({
              type: 'document_updated',
              documentId: data.documentId
            }));
          }
        });
        break;
      
      default:
        logger.warn(`Unknown message type: ${data.type}`);
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      error: 'Invalid message format' 
    }));
  }
}

// Initialize server
async function initializeServer(port = 3000) {
  try {
    // Initialize database
    await setupDatabase();
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Setup WebSocket server
    wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      logger.info('New WebSocket connection');
      
      ws.on('message', (message) => handleMessage(ws, message));
      
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
      
      ws.on('close', () => {
        logger.info('Client disconnected');
      });
    });
    
    // Start server
    server.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });
    
    // Handle shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      closeServer(server);
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      closeServer(server);
    });
    
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    throw error;
  }
}

// Graceful shutdown
function closeServer(server) {
  wss?.close(() => {
    logger.info('WebSocket server closed');
    server?.close(() => {
      logger.info('HTTP server closed');
      closeDatabase();
      process.exit(0);
    });
  });
}

module.exports = {
  initializeServer
}; 