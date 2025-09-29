const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024';

function requireAuth(req, res, next) {
  const authHeader = req.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please provide a valid JWT token in Authorization header'
    });
  }

  try {
    const token = authHeader.split(' ')[1];
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Invalid token',
      message: 'The provided token is invalid or expired'
    });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.get('authorization');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const user = jwt.verify(token, JWT_SECRET);
      req.user = user;
    } catch (error) {
      // Continue without user - token was invalid
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Admin access required',
      message: 'This operation requires administrator privileges'
    });
  }
  next();
}

// Create a test token (for development/testing)
function createTestToken(userId, role = 'user') {
  return jwt.sign(
    { 
      userId, 
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) 
    }, 
    JWT_SECRET
  );
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  createTestToken,
  JWT_SECRET
};