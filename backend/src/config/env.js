import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().optional().default('5000'),
  MONGO_URI: z.string().url('MONGO_URI is required and must be a valid URL'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase Project ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('Invalid Firebase Client Email'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'Firebase Private Key is required'),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  PYTHON_API_URL: z.string().url().optional().default('http://127.0.0.1:8000/api/v1/ai/execute'),
  JWT_SECRET: z.string().min(1, 'JWT Secret is required')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ FATAL: Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const envVars = parsedEnv.data;

export const config = {
  port: envVars.PORT,
  mongoUri: envVars.MONGO_URI,
  firebaseProjectId: envVars.FIREBASE_PROJECT_ID,
  firebaseClientEmail: envVars.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: envVars.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  firebaseStorageBucket: envVars.FIREBASE_STORAGE_BUCKET || envVars.FIREBASE_PROJECT_ID + '.appspot.com',
  pythonApiUrl: envVars.PYTHON_API_URL,
  jwtSecret: envVars.JWT_SECRET,
};
