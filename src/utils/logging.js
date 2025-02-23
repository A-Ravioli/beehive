const winston = require('winston');
const path = require('path');
const { app } = require('electron');

function setupLogging(component) {
  const logDir = process.env.NODE_ENV === 'development' 
    ? path.join(__dirname, '..', '..', 'logs')
    : path.join(app.getPath('userData'), 'logs');

  // Create format
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Create logger
  const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: logFormat,
    defaultMeta: { component },
    transports: [
      // File transport for errors
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // File transport for all logs
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV === 'development') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return logger;
}

module.exports = {
  setupLogging
}; 