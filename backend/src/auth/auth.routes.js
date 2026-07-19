import { Router } from 'express';
import { register, login, me, refresh, logout, forgotPassword, verifyOtp, resetPassword, sendRegisterOtp } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { requireJwtAuth } from './jwt.middleware.js';

const router = Router();

// Firebase Token Verification endpoints (Issue JWTs)
router.post('/register', requireAuth, register);
router.post('/login', requireAuth, login);

// Pre-Registration OTP
router.post('/send-register-otp', sendRegisterOtp);

// Password Reset endpoints
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// Backend JWT endpoints
router.get('/me', requireJwtAuth, me);
router.post('/refresh', requireJwtAuth, refresh);
router.post('/logout', requireJwtAuth, logout);

export default router;
