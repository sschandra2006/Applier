import { logger } from '../config/logger.js';

export const globalErrorHandler = (err, req, res, next) => {
  // If headers are already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Preserve full traceback in logs
  logger.error({
    msg: 'Unhandled Exception',
    err: {
      message: err.message,
      stack: err.stack,
    },
    correlationId: req.correlationId,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.isOperational ? err.message : 'An unexpected error occurred.';

  // MongoDB Hardening
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = Object.values(err.errors).map(val => val.message).join(', ');
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'CAST_ERROR';
    message = `Invalid value for ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY_ERROR';
    message = 'Duplicate field value entered.';
  }

  // Firebase Hardening
  if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
    statusCode = 401;
    code = err.code.toUpperCase().replace('/', '_');
    message = 'Authentication failed. Please log in again.';
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : code,
      message: message,
      details: err.details || null,
      requestId: req.correlationId,
      timestamp: new Date().toISOString(),
      retryable: err.retryable || false
    }
  });
};
