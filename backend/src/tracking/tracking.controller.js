import { Application } from './application.model.js';
import { AutomationJob } from '../automation/automation.model.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Running Applications
    const running = await AutomationJob.countDocuments({
      userId,
      status: { $in: ['RUNNING', 'ANALYZING', 'INTERVIEWING', 'READY_TO_EXECUTE'] }
    });
    
    // Waiting for User Action
    const waiting = await AutomationJob.countDocuments({
      userId,
      status: { $in: ['PAUSED_OTP', 'PAUSED_CAPTCHA', 'PAUSED_PAYMENT'] }
    });

    // Completed Applications
    const completed = await AutomationJob.countDocuments({
      userId,
      status: 'COMPLETED'
    });
    
    // Failed Applications
    const failed = await AutomationJob.countDocuments({
      userId,
      status: 'FAILED'
    });

    res.status(200).json({
      success: true,
      data: {
        running,
        waiting,
        completed,
        failed
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentActivity = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // We'll fetch recent automation jobs as the "activity" stream
    const recentJobs = await AutomationJob.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('workflowId'); 

    res.status(200).json({ success: true, data: recentJobs });
  } catch (error) {
    next(error);
  }
};

export const getApplications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // We fetch AutomationJobs to represent the full lifecycle of applications
    const jobs = await AutomationJob.find({ userId })
      .sort({ updatedAt: -1 })
      .populate('workflowId', 'name url')
      .populate('interviewStateId', 'currentStep pendingFields completedFields status');

    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
};
