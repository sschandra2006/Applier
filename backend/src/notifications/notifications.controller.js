import { Notification } from './notification.model.js';

export const getUserNotificationsController = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(20);
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
};

export const markAsReadController = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true }
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
