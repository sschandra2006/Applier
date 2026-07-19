import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config/env.js';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: config.firebaseProjectId,
        clientEmail: config.firebaseClientEmail,
        privateKey: config.firebasePrivateKey,
      }),
    });
  } catch (error) {
    console.log('Firebase Admin skipping initialization: Provide valid credentials in .env');
  }
}

const admin = {
  auth: () => getApps().length ? getAuth() : { verifyIdToken: async () => ({}) },
  storage: () => getApps().length ? getStorage() : { bucket: () => ({ file: () => ({ save: async () => {}, makePublic: async () => {} }) }) }
};

export const firebaseAdmin = admin;
export { admin };
