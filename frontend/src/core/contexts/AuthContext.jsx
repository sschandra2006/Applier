import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js';
import { meApi } from '../../features/auth/services/auth.api.js';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBackendProfile = useCallback(async () => {
    try {
      const response = await meApi();
      if (response.success) {
        setUserProfile(response.data);
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      console.error('Failed to fetch backend profile:', error);
      setUserProfile(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (localStorage.getItem('backend_token')) {
        await fetchBackendProfile();
      }
      setLoading(false);
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && localStorage.getItem('backend_token')) {
        await fetchBackendProfile();
      }
    });

    return () => unsubscribe();
  }, [fetchBackendProfile]);

  const logout = () => {
    localStorage.removeItem('backend_token');
    setUserProfile(null);
    setFirebaseUser(null);
  };

  const value = {
    firebaseUser,
    userProfile,
    isAuthenticated: !!userProfile,
    fetchBackendProfile,
    logout
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
