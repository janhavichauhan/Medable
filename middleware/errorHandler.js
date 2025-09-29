const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '..', 'logs');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      
      if (Object.keys(meta).length > 0) {
        log += ' ' + JSON.stringify(meta);
      }
      
      if (stack) {
        log += '\n' + stack;
      }
      
      return log;
    })
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for error logs only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Error handling middleware
function errorHandler(error, req, res, next) {
  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? req.user.userId : 'anonymous'
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'The request data is invalid',
      details: sanitizeValidationError(error)
    });
  }
  
  if (error.name === 'MulterError') {
    return res.status(400).json({
      error: 'File upload error',
      message: sanitizeMulterError(error)
    });
  }
  
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication error',
      message: 'Invalid or expired token'
    });
  }
  
  if (error.code === 'ENOENT') {
    return res.status(404).json({
      error: 'Resource not found',
      message: 'The requested resource could not be found'
    });
  }
  
  if (error.code === 'ENOSPC') {
    return res.status(507).json({
      error: 'Storage error',
      message: 'Insufficient storage space available'
    });
  }

  // Default error response - don't expose internal details
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred. Please try again later.',
    requestId: req.id || 'unknown'
  });
}

// Sanitize validation errors
function sanitizeValidationError(error) {
  if (error.details && Array.isArray(error.details)) {
    return error.details.map(detail => ({
      field: detail.path ? detail.path.join('.') : 'unknown',
      message: detail.message
    }));
  }
  
  return 'Invalid request data';
}

// Sanitize multer errors
function sanitizeMulterError(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds the maximum allowed limit';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'LIMIT_PART_COUNT':
      return 'Too many parts in the upload';
    case 'LIMIT_FIELD_KEY':
      return 'Field name too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value too long';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    default:
      return 'File upload failed';
  }
}

// Request logging middleware
function requestLogger(req, res, next) {
  // Generate request ID
  req.id = require('uuid').v4();
  
  // Log request
  logger.info('Request received', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? req.user.userId : 'anonymous'
  });
  
  // Log response when finished
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      requestId: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
}

// Rate limiting helper
const rateLimitStore = new Map();

function rateLimit(windowMs = 15 * 60 * 1000, maxRequests = 100) {
  return (req, res, next) => {
    const identifier = req.ip + (req.user ? ':' + req.user.userId : '');
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, validTimestamps);
      }
    }
    
    // Get current requests for this identifier
    const currentRequests = rateLimitStore.get(identifier) || [];
    const validRequests = currentRequests.filter(t => t > windowStart);
    
    if (validRequests.length >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        identifier,
        requests: validRequests.length,
        maxRequests,
        windowMs
      });
      
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    validRequests.push(now);
    rateLimitStore.set(identifier, validRequests);
    
    next();
  };
}

module.exports = {
  logger,
  errorHandler,
  requestLogger,
  rateLimit
};