import { User } from '../users/user.model.js';
import { Profile } from '../users/profile.model.js';

export const syncUserWithFirebase = async (firebaseUser) => {
  const { uid, email } = firebaseUser;

  // Try to find existing user
  let user = await User.findOne({ firebaseUid: uid });

  if (!user) {
    // Check if user exists by email
    user = await User.findOne({ email });
    
    if (user) {
      // Link firebase uid to existing email
      user.firebaseUid = uid;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        firebaseUid: uid,
        email: email,
        lastLoginAt: new Date()
      });

      // Create empty profile
      await Profile.create({ userId: user._id });
    }
  } else {
    // Update last login
    user.lastLoginAt = new Date();
    await user.save();
  }

  return user;
};
