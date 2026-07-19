import { auth } from '../../../core/firebase.js';

export const syncUserWithBackend = async () => {
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const response = await fetch('/api/v1/auth/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
};
