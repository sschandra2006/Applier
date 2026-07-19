import React, { useState } from 'react';
import { signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { auth, googleProvider } from '../../../core/firebase.js';
import { loginApi, registerApi } from '../services/auth.api.js';
import { useAuth } from '../../../core/contexts/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export const AuthForm = () => {
  const [error, setError] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { fetchBackendProfile } = useAuth();

  const handleGoogleAuth = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const additionalInfo = getAdditionalUserInfo(result);
      
      if (additionalInfo.isNewUser) {
        await registerApi(null);
      } else {
        try {
          await loginApi();
        } catch (loginErr) {
          if (loginErr.response?.data?.error === 'User does not exist in database. Please register first.') {
            // Auto-register them since they used Google Auth but were missing from MongoDB
            await registerApi(null);
          } else {
            throw loginErr;
          }
        }
      }
      
      await fetchBackendProfile();
      navigate('/dashboard');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.response?.data?.error || "Google sign-in failed. Please try again.");
      }
      setGoogleLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Applier AI</h2>
        <p className="text-sm text-muted-foreground mt-2">Sign in or create an account to get started</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg text-center font-medium">
          {error}
        </div>
      )}
      
      <button 
        type="button" 
        onClick={handleGoogleAuth}
        disabled={googleLoading} 
        className="w-full flex justify-center items-center py-3 px-4 border border-input rounded-xl shadow-sm bg-background text-sm font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary transition-all disabled:opacity-50"
      >
        {googleLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : (
          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        {googleLoading ? 'Connecting...' : 'Continue with Google'}
      </button>
    </div>
  );
};
