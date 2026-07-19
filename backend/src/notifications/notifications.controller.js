import { Notification } from './notification.model.js';

export const getUserNotificationsController = async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(20);
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markAsReadController = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;
    
    await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true }
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
