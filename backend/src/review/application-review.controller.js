/**
 * Application Review Controller
 * Applier 2.0 — Phase 13: Evidence-Based Application Review
 */

import { defaultApplicationReviewService } from './application-review.service.js';

export const getReviewController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.params;
    const userId = req.user._id;

    const review = await defaultApplicationReviewService.buildApplicationReview({
      userId,
      interviewStateId
    });

    res.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

export const resolveConflictController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.params;
    const { fieldKey, resolvedValue, chosenSource } = req.body;
    const userId = req.user._id;

    const updatedReview = await defaultApplicationReviewService.resolveConflict({
      userId,
      interviewStateId,
      fieldKey,
      resolvedValue,
      chosenSource
    });

    res.status(200).json({
      success: true,
      message: 'Conflict resolved successfully',
      data: updatedReview
    });
  } catch (error) {
    next(error);
  }
};

export const updateFieldController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.params;
    const { fieldKey, value, source } = req.body;
    const userId = req.user._id;

    const updatedReview = await defaultApplicationReviewService.updateFieldValue({
      userId,
      interviewStateId,
      fieldKey,
      value,
      source: source || 'USER_INPUT'
    });

    res.status(200).json({
      success: true,
      message: 'Field updated successfully',
      data: updatedReview
    });
  } catch (error) {
    if (error.code === 'CONFIRMED_VALUE_PROTECTED') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

export const confirmReviewController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.params;
    const { applicationId, workflowVersion } = req.body;
    const userId = req.user._id;

    const result = await defaultApplicationReviewService.confirmApplicationReview({
      userId,
      interviewStateId,
      applicationId,
      workflowVersion
    });

    res.status(200).json({
      success: true,
      message: 'Application explicitly confirmed and locked',
      data: result
    });
  } catch (error) {
    if (error.code === 'CONFIRMATION_BLOCKED') {
      return res.status(400).json({
        success: false,
        error: error.message,
        summary: error.summary
      });
    }
    next(error);
  }
};
