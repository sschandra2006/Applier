import { Application } from './application.model.js';

export const getUserTimeline = async (req, res) => {
  try {
    const userId = req.user._id;
    const applications = await Application.find({ userId })
      .populate('workflowId', 'name url')
      .sort({ submittedAt: -1 });
      
    res.status(200).json({ success: true, data: applications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
