import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../core/firebase.js';
import { syncUserWithBackend } from '../services/auth.api.js';
import { Link } from 'react-router-dom';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await syncUserWithBackend();
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-neutral-300">Email address</label>
        <div className="mt-1">
          <input type="email" required className="appearance-none block w-full px-3 py-2 border border-neutral-600 rounded-md shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-neutral-700 text-white" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-300">Password</label>
        <div className="mt-1">
          <input type="password" required className="appearance-none block w-full px-3 py-2 border border-neutral-600 rounded-md shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-neutral-700 text-white" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
        Sign in
      </button>
      <div className="text-center text-sm text-neutral-400 mt-4">
        Don't have an account? <Link to="/register" className="text-blue-500 hover:text-blue-400">Register</Link>
      </div>
    </form>
  );
};
