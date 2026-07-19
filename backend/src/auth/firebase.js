import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config/env.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: config.firebasePrivateKey,
    }),
    storageBucket: config.firebaseStorageBucket,
  });
}

const admin = {
  auth: () => getAuth(),
  storage: () => getStorage()
};

export const firebaseAdmin = admin;
export { admin };
