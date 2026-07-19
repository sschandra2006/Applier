import { syncUserWithFirebase } from './auth.service.js';

export const syncLogin = async (req, res) => {
  try {
    const firebaseUser = req.user; 
    
    const user = await syncUserWithFirebase(firebaseUser);

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Sync Error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error during login sync' }
    });
  }
};
