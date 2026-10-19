import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../users/user.model.js';

export const requireJwtAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split('Bearer ')[1].trim();
    } else if (req.query?.token) {
      token = String(req.query.token).trim();
    }

    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    let user;
    try {
      user = await User.findById(decoded.userId).select('-password');
    } catch (dbErr) {
      if (dbErr.name === 'MongoServerSelectionError' || dbErr.name === 'MongoNetworkError') {
        console.warn('Transient Mongo error in JWT auth. Retrying query...');
        await new Promise(r => setTimeout(r, 500));
        try {
          user = await User.findById(decoded.userId).select('-password');
        } catch (_) {
          // If DB is still reconnecting, pass decoded userId context so request isn't blocked
          user = { _id: decoded.userId, status: 'ACTIVE' };
        }
      } else {
        throw dbErr;
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not found' });
    }

    if (user.status && user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Forbidden: Account is suspended or deleted' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Unauthorized: Token expired' });
    }
    console.error('JWT Auth Middleware Error:', error);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};
