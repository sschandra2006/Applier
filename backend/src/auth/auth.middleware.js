import { firebaseAdmin } from './firebase.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();
    if (!idToken || idToken === 'undefined' || idToken === 'null') {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing token' });
    }
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = async (req, res, next) => {
  try {
    // In production, you would check Firebase custom claims or query the User database
    // For this demonstration, we check if the authenticated email is the admin email
    if (req.user && req.user.email === 'admin@applier.ai') {
      next();
    } else {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
    }
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
};
