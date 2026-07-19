import { Application } from '../tracking/application.model.js';
import { AutomationJob } from '../automation/automation.model.js';
// If User model doesn't exist, we skip counting users for now or use firebase admin

export const getSystemStats = async (req, res) => {
  try {
    const totalApplications = await Application.countDocuments();
    const activeJobs = await AutomationJob.countDocuments({ status: { $in: ['RUNNING', 'PAUSED_OTP'] } });
    const failedJobs = await AutomationJob.countDocuments({ status: 'FAILED' });
    
    res.status(200).json({
      success: true,
      data: {
        totalApplications,
        activeJobs,
        failedJobs,
        systemHealth: 'Healthy',
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAutomationQueue = async (req, res) => {
  try {
    const jobs = await AutomationJob.find()
      .populate('workflowId', 'name url')
      .sort({ createdAt: -1 })
      .limit(50);
      
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
