// P2P Networking Architecture

const { app } = require('electron');
const WebRTC = require('node-webrtc');
const crypto = require('crypto');
const { setupLogging } = require('../utils/logging');
const { paths } = require('../config/paths');
const sqlite3 = require('better-sqlite3');

const logger = setupLogging('p2p');

class P2PNetwork {
  constructor() {
    this.peers = new Map();
    this.connections = new Map();
    this.pendingConnections = new Map();
    this.resourceInfo = new Map();
    this.db = null;
    
    // Connection settings
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      maxRetries: 3,
      retryDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000
    };

    // Resource limits
    this.limits = {
      maxPeers: 10,
      maxConnections: 20,
      maxPendingConnections: 5,
      maxMessageSize: 1024 * 1024 // 1MB
    };
  }

  // Initialize P2P network
  async initialize() {
    try {
      // Initialize database
      this.db = new sqlite3(paths.db.main);
      await this.setupDatabase();

      // Start network services
      await this.startDiscovery();
      await this.startConnectionManager();
      await this.startResourceMonitor();

      logger.info('P2P network initialized');
      return true;
    } catch (err) {
      logger.error('Failed to initialize P2P network:', err);
      throw err;
    }
  }

  // Database setup
  async setupDatabase() {
    const schema = [
      `CREATE TABLE IF NOT EXISTS peers (
        id TEXT PRIMARY KEY,
        name TEXT,
        publicKey TEXT,
        lastSeen INTEGER,
        trustScore REAL,
        status TEXT,
        metadata JSON
      )`,
      `CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        peerId TEXT,
        status TEXT,
        established INTEGER,
        lastActive INTEGER,
        metadata JSON,
        FOREIGN KEY(peerId) REFERENCES peers(id)
      )`,
      `CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        peerId TEXT,
        cpu REAL,
        memory INTEGER,
        storage INTEGER,
        updated INTEGER,
        FOREIGN KEY(peerId) REFERENCES peers(id)
      )`
    ];

    for (const query of schema) {
      this.db.exec(query);
    }
  }

  // Discovery Layer
  async startDiscovery() {
    // Local network discovery using mDNS
    this.discovery = {
      interval: null,
      peers: new Set(),
      
      start: () => {
        this.discovery.interval = setInterval(() => {
          this.scanNetwork();
        }, 60000); // Scan every minute
        
        this.scanNetwork(); // Initial scan
      },
      
      stop: () => {
        if (this.discovery.interval) {
          clearInterval(this.discovery.interval);
        }
      }
    };

    this.discovery.start();
  }

  async scanNetwork() {
    try {
      // Implement mDNS scanning
      // For now, just handle manual peer addition
      logger.debug('Network scan complete');
    } catch (err) {
      logger.error('Network scan failed:', err);
    }
  }

  // Connection Layer
  async startConnectionManager() {
    // Initialize WebRTC
    this.peerConnection = new WebRTC.RTCPeerConnection(this.config);
    
    // Set up data channel
    this.dataChannel = this.peerConnection.createDataChannel('p2p', {
      ordered: true
    });

    // Handle connection lifecycle
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        this.handleICECandidate(event.candidate);
      }
    };

    this.peerConnection.ondatachannel = event => {
      this.handleDataChannel(event.channel);
    };

    // Start connection monitoring
    setInterval(() => {
      this.monitorConnections();
    }, this.config.heartbeatInterval);
  }

  // Resource Layer
  async startResourceMonitor() {
    setInterval(() => {
      this.updateResourceInfo();
    }, 60000); // Update every minute
  }

  async updateResourceInfo() {
    const os = require('os');
    const resourceInfo = {
      cpu: os.loadavg()[0],
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      },
      uptime: os.uptime()
    };

    // Store resource info
    this.db.prepare(`
      INSERT OR REPLACE INTO resources (
        id, cpu, memory, storage, updated
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      this.getId(),
      resourceInfo.cpu,
      resourceInfo.memory.free,
      0, // TODO: Implement storage tracking
      Date.now()
    );

    // Broadcast to connected peers
    this.broadcast({
      type: 'RESOURCE_UPDATE',
      data: resourceInfo
    });
  }

  // Peer Management
  async addPeer(peer) {
    if (this.peers.size >= this.limits.maxPeers) {
      throw new Error('Maximum peer limit reached');
    }

    const peerId = this.generatePeerId(peer);
    
    // Store peer info
    this.db.prepare(`
      INSERT OR REPLACE INTO peers (
        id, name, publicKey, lastSeen, trustScore, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      peerId,
      peer.name,
      peer.publicKey,
      Date.now(),
      1.0, // Initial trust score
      'new',
      JSON.stringify(peer.metadata || {})
    );

    this.peers.set(peerId, peer);
    this.initializeConnection(peerId);

    return peerId;
  }

  async removePeer(peerId) {
    // Clean up connections
    if (this.connections.has(peerId)) {
      await this.closeConnection(peerId);
    }

    // Remove from database
    this.db.prepare('DELETE FROM peers WHERE id = ?').run(peerId);
    this.db.prepare('DELETE FROM connections WHERE peerId = ?').run(peerId);
    this.db.prepare('DELETE FROM resources WHERE peerId = ?').run(peerId);

    // Remove from memory
    this.peers.delete(peerId);
    this.resourceInfo.delete(peerId);
  }

  // Connection Management
  async initializeConnection(peerId) {
    if (this.connections.size >= this.limits.maxConnections) {
      throw new Error('Maximum connection limit reached');
    }

    try {
      const connection = {
        id: crypto.randomUUID(),
        peerId,
        status: 'initializing',
        established: Date.now(),
        retries: 0
      };

      // Store connection info
      this.db.prepare(`
        INSERT INTO connections (
          id, peerId, status, established, lastActive, metadata
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        connection.id,
        peerId,
        connection.status,
        connection.established,
        connection.established,
        '{}'
      );

      this.connections.set(peerId, connection);
      await this.establishConnection(peerId);

      return connection;
    } catch (err) {
      logger.error(`Failed to initialize connection to peer ${peerId}:`, err);
      throw err;
    }
  }

  async establishConnection(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error('Peer not found');
    }

    try {
      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer to peer
      await this.sendToPeer(peerId, {
        type: 'OFFER',
        data: offer
      });

      // Wait for answer
      const answer = await this.waitForAnswer(peerId);
      await this.peerConnection.setRemoteDescription(answer);

      // Update connection status
      this.updateConnectionStatus(peerId, 'connected');

      logger.info(`Connection established with peer ${peerId}`);
    } catch (err) {
      logger.error(`Failed to establish connection with peer ${peerId}:`, err);
      this.handleConnectionError(peerId, err);
    }
  }

  // Message Handling
  async handleMessage(message) {
    try {
      // Validate message
      if (!this.validateMessage(message)) {
        throw new Error('Invalid message format');
      }

      // Process message based on type
      switch (message.type) {
        case 'PEER_ANNOUNCE':
          await this.handlePeerAnnouncement(message.data);
          break;
        case 'RESOURCE_UPDATE':
          await this.handleResourceUpdate(message.data);
          break;
        case 'OFFER':
          await this.handleOffer(message.data);
          break;
        case 'ANSWER':
          await this.handleAnswer(message.data);
          break;
        case 'ICE_CANDIDATE':
          await this.handleICECandidate(message.data);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (err) {
      logger.error('Error handling message:', err);
      throw err;
    }
  }

  // Security
  generatePeerId(peer) {
    return crypto.createHash('sha256')
      .update(peer.publicKey)
      .digest('hex');
  }

  validateMessage(message) {
    return message &&
           typeof message === 'object' &&
           typeof message.type === 'string' &&
           message.data !== undefined;
  }

  // Helper methods
  getId() {
    return crypto.randomUUID();
  }

  async broadcast(message) {
    for (const [peerId, connection] of this.connections) {
      if (connection.status === 'connected') {
        try {
          await this.sendToPeer(peerId, message);
        } catch (err) {
          logger.error(`Failed to broadcast to peer ${peerId}:`, err);
        }
      }
    }
  }

  updateConnectionStatus(peerId, status) {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.status = status;
      connection.lastActive = Date.now();

      // Update database
      this.db.prepare(`
        UPDATE connections
        SET status = ?, lastActive = ?
        WHERE peerId = ?
      `).run(status, connection.lastActive, peerId);
    }
  }

  async monitorConnections() {
    const now = Date.now();
    for (const [peerId, connection] of this.connections) {
      if (connection.status === 'connected' &&
          now - connection.lastActive > this.config.connectionTimeout) {
        logger.warn(`Connection to peer ${peerId} timed out`);
        await this.handleConnectionTimeout(peerId);
      }
    }
  }

  async handleConnectionTimeout(peerId) {
    try {
      await this.closeConnection(peerId);
      if (this.shouldRetryConnection(peerId)) {
        await this.retryConnection(peerId);
      }
    } catch (err) {
      logger.error(`Failed to handle connection timeout for peer ${peerId}:`, err);
    }
  }

  shouldRetryConnection(peerId) {
    const connection = this.connections.get(peerId);
    return connection && connection.retries < this.config.maxRetries;
  }

  async retryConnection(peerId) {
    const connection = this.connections.get(peerId);
    if (connection) {
      connection.retries++;
      setTimeout(() => {
        this.establishConnection(peerId);
      }, this.config.retryDelay * connection.retries);
    }
  }
}

module.exports = new P2PNetwork(); 