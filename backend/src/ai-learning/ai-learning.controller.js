import { AILearning } from './ai-learning.model.js';

export const getInsightsController = async (req, res) => {
  try {
    const insights = await AILearning.find()
      .populate('workflowId', 'name url')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const applyInsightController = async (req, res) => {
  try {
    const { id } = req.params;
    // In a real system, applying the insight would programmatically update the WorkflowSchema
    // For now, we just mark it as APPLIED.
    const insight = await AILearning.findByIdAndUpdate(id, { status: 'APPLIED' }, { new: true });
    res.status(200).json({ success: true, data: insight });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
