import mongoose from 'mongoose';
import { generateToken } from './src/auth/auth.service.js';
import { User } from './src/users/user.model.js';
import { Profile } from './src/users/profile.model.js';
import axios from 'axios';
import { config } from './src/config/env.js';
import express from 'express';
import cors from 'cors';
import authRoutes from './src/auth/auth.routes.js';
import usersRoutes from './src/users/users.routes.js';
import documentsRoutes from './src/documents/documents.routes.js';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/documents', documentsRoutes);

const runTest = async () => {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to DB');

  // Start temporary server
  const server = app.listen(5001, () => console.log('Test server on 5001'));

  try {
    // 1. Get or Create a User
    let user = await User.findOne();
    if (!user) {
      user = await User.create({ firebaseUid: 'test1234', email: 'test@example.com' });
    }
    
    // 2. Generate Token
    const token = generateToken(user._id);

    // 3. Make Request to /api/v1/users/profile
    const res = await axios.get('http://localhost:5001/api/v1/users/profile', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Profile Success:', res.data);

    const docRes = await axios.get('http://localhost:5001/api/v1/documents', {
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Docs Success:', docRes.data);

  } catch (error) {
    if (error.response) {
      console.error('Test Failed with HTTP Error:', error.response.status, error.response.data);
    } else {
      console.error('Test Failed:', error);
    }
  }

  server.close();
  await mongoose.disconnect();
};

runTest();
