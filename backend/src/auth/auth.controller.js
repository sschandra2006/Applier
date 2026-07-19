import { syncUserWithFirebase, generateToken } from './auth.service.js';
import { User } from '../users/user.model.js';
import { Otp } from './otp.model.js';
import { firebaseAdmin } from './firebase.js';
import { sendNotification } from '../notifications/notifications.service.js';
import mongoose from 'mongoose';

export const register = async (req, res, next) => {
  try {
    const firebaseUser = req.user; 
    const { otp } = req.body;
    
    console.log('Firebase User Provider Details:', firebaseUser.firebase);

    // Strict DB Check: Prevent registration if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ firebaseUid: firebaseUser.uid }, { email: firebaseUser.email }] 
    });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists in database. Please login instead.' });
    }

    // Check if OTP is required (Google users bypass this)
    if (firebaseUser.firebase?.sign_in_provider !== 'google.com') {
      if (!otp) {
        await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
        return res.status(400).json({ success: false, error: 'OTP is required for email registration.' });
      }

      const otpRecord = await Otp.findOne({ email: firebaseUser.email.toLowerCase(), otp });
      if (!otpRecord) {
        await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
        return res.status(400).json({ success: false, error: 'Invalid or expired OTP.' });
      }
      await Otp.deleteOne({ _id: otpRecord._id });
    }

    const user = await syncUserWithFirebase(firebaseUser);
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          userId: user._id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const firebaseUser = req.user; 
    
    // Strict DB Check: Prevent login if user does not exist
    const existingUser = await User.findOne({ 
      $or: [{ firebaseUid: firebaseUser.uid }, { email: firebaseUser.email }] 
    });
    if (!existingUser) {
      return res.status(400).json({ success: false, error: 'User does not exist in database. Please register first.' });
    }

    const user = await syncUserWithFirebase(firebaseUser);
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          userId: user._id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        userId: req.user._id,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = generateToken(req.user._id);
    res.status(200).json({
      success: true,
      data: { token }
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Otp.deleteMany({ email: user.email });
    await Otp.create({ email: user.email, otp, expiresAt });

    await sendNotification(
      user._id,
      'Password Reset OTP',
      `Your password reset OTP is: ${otp}. It is valid for 10 minutes.`,
      'INFO',
      {},
      user.email
    );

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const otpRecord = await Otp.findOne({ email: email.toLowerCase(), otp });

    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    const otpRecord = await Otp.findOne({ email: email.toLowerCase(), otp });
    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    await firebaseAdmin.auth().updateUser(user.firebaseUid, {
      password: newPassword
    });

    await Otp.deleteOne({ _id: otpRecord._id });

    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
};

export const sendRegisterOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists. Please login instead.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Otp.deleteMany({ email: email.toLowerCase() });
    await Otp.create({ email: email.toLowerCase(), otp, expiresAt });

    const dummyId = new mongoose.Types.ObjectId();
    await sendNotification(
      dummyId,
      'Applier AI - Registration OTP',
      `Your registration OTP is: ${otp}. It is valid for 10 minutes.`,
      'INFO',
      {},
      email.toLowerCase()
    );

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    next(error);
  }
};
