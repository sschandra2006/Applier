import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

async function clearCache() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');
    
    const db = mongoose.connection.db;
    
    console.log('Clearing Workflows...');
    await db.collection('workflows').deleteMany({});
    
    console.log('Clearing InterviewStates...');
    await db.collection('interviewstates').deleteMany({});
    
    console.log('Clearing Conversations & Messages...');
    await db.collection('conversations').deleteMany({});
    await db.collection('messages').deleteMany({});
    
    console.log('Clearing AutomationJobs...');
    await db.collection('automationjobs').deleteMany({});
    
    console.log('Application cache successfully cleared!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to clear cache:', error);
    process.exit(1);
  }
}

clearCache();
