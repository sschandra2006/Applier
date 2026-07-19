import { Profile } from './profile.model.js';
import { User } from './user.model.js';

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    let profile = await Profile.findOne({ userId });

    if (!profile) {
      profile = await Profile.create({ userId });
    }

    res.status(200).json({
      success: true,
      data: {
        email: user.email,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phone: profile.phone || '',
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, phone } = req.body;

    let profile = await Profile.findOne({ userId });
    
    if (!profile) {
      profile = new Profile({ userId });
    }

    profile.firstName = firstName;
    profile.lastName = lastName;
    profile.phone = phone;

    await profile.save();

    res.status(200).json({
      success: true,
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone
      }
    });
  } catch (error) {
    next(error);
  }
};
