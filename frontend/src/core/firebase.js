import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { config } from '../config/env.js';

const firebaseConfig = config.firebase;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
