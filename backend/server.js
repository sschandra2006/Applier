import express from 'express';
import cors from 'cors';
import dns from 'dns';
import { config } from './src/config/env.js';

try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (_) {}
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './src/auth/auth.routes.js';
import usersRoutes from './src/users/users.routes.js';
import interviewRoutes from './src/interview/interview.routes.js';
import documentsRoutes from './src/documents/documents.routes.js';
import trackingRoutes from './src/tracking/tracking.routes.js';
import automationRoutes from './src/automation/automation.routes.js';
import workflowRoutes from './src/workflow/workflow.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './src/config/logger.js';
import pinoHttp from 'pino-http';
import { correlationIdMiddleware } from './src/middleware/correlationId.middleware.js';
import { globalErrorHandler } from './src/error/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Phase 12: Process & Async Audit (Prevent Zombie Crashes)
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception detected! Shutting down immediately.');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ err: reason }, 'Unhandled Promise Rejection detected! Shutting down immediately.');
  process.exit(1);
});

const app = express();
const PORT = config.port;

app.use(correlationIdMiddleware);
app.use(pinoHttp({ logger, autoLogging: false }));

// CORS must be before rate limit and helmet so that rejected requests still have CORS headers
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Security Middleware
// Temporarily disable helmet's crossOriginResourcePolicy for /uploads to be accessible
app.use(helmet({ crossOriginResourcePolicy: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for prototyping/polling
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10mb' }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/interview', interviewRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/api/v1/automation', automationRoutes);
app.use('/api/v1/workflow', workflowRoutes);

// Basic Route
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'Applier API is running' });
});

const connectDB = async (retries = 5, delayMs = 2000) => {
  const mongoUri = config.mongoUri;
  if (!mongoUri) {
    logger.warn('No MONGO_URI provided, skipping DB connection for now.');
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(mongoUri);
      logger.info('MongoDB Connected...');
      return;
    } catch (error) {
      if (attempt < retries) {
        logger.warn({ err: error.message }, `MongoDB connection attempt ${attempt}/${retries} failed. Retrying in ${delayMs}ms...`);
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        logger.fatal({ err: error }, 'Database connection failed after maximum retries (Fail-Fast)');
        process.exit(1);
      }
    }
  }
};

app.use(globalErrorHandler);

app.listen(PORT, async () => {
  await connectDB();
  logger.info(`Server running on port ${PORT}`);
});
