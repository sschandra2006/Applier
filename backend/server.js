import express from 'express';
import cors from 'cors';
import { config } from './src/config/env.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './src/auth/auth.routes.js';
import workflowRoutes from './src/workflow/workflow.routes.js';
import interviewRoutes from './src/interview/interview.routes.js';
import documentsRoutes from './src/documents/documents.routes.js';
import automationRoutes from './src/automation/automation.routes.js';
import trackingRoutes from './src/tracking/tracking.routes.js';
import notificationRoutes from './src/notifications/notifications.routes.js';
import adminRoutes from './src/admin/admin.routes.js';
import aiLearningRoutes from './src/ai-learning/ai-learning.routes.js';

const app = express();
const PORT = config.port;

// Security Middleware
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', apiLimiter);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/v1/interview', interviewRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/automation', automationRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/ai-learning', aiLearningRoutes);

// Basic Route
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'Applier API is running' });
});

// Database Connection
const connectDB = async () => {
  try {
    const mongoUri = config.mongoUri;
    if (mongoUri) {
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected...');
    } else {
        console.log('No MONGO_URI provided, skipping DB connection for now.');
    }
  } catch (error) {
    console.error('Database connection error:', error);
  }
};

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on port ${PORT}`);
});
