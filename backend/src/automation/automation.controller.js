import { startAutomation, updateJobStatus } from './automation.service.js';

export const startAutomationController = async (req, res) => {
  try {
    const { interviewStateId } = req.body;
    const userId = req.user._id;
    const job = await startAutomation(userId, interviewStateId);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Webhook for Python to update status
export const statusWebhookController = async (req, res) => {
  try {
    const { jobId, status, message } = req.body;
    await updateJobStatus(jobId, status, message);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
