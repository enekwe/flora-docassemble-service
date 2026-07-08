const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Authentication Middleware
 */

/**
 * Authenticate JWT token
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_here';

    const decoded = jwt.verify(token, jwtSecret);

    // Attach user info to request
    req.user = {
      id: decoded.id || decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();

  } catch (error) {
    logger.error('Authentication failed:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication (doesn't fail if no token)
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_here';

      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = {
          id: decoded.id || decoded.userId,
          email: decoded.email,
          role: decoded.role
        };
      } catch (error) {
        // Token invalid, but continue without user
        logger.debug('Optional auth: Invalid token');
      }
    }

    next();

  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth
};
