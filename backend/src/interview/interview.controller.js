import { startInterview, processUserMessage } from './interview.service.js';

export const startInterviewController = async (req, res) => {
  try {
    const { workflowId } = req.body;
    const userId = req.user._id;
    const result = await startInterview(userId, workflowId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const processMessageController = async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const userId = req.user._id;
    const result = await processUserMessage(conversationId, userId, content);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
