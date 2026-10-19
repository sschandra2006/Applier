import { startInterview, processUserMessage, resumeInterview } from './interview.service.js';

export const startInterviewController = async (req, res, next) => {
  try {
    const { workflowId } = req.body;
    const userId = req.user._id;
    const result = await startInterview(userId, workflowId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const processMessageController = async (req, res, next) => {
  try {
    const { conversationId, content } = req.body;
    const userId = req.user._id;
    const result = await processUserMessage(conversationId, userId, content);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const resumeInterviewController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.body;
    const userId = req.user._id;
    const result = await resumeInterview(userId, interviewStateId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
