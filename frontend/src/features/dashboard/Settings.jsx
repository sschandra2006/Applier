import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Key, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchProfileApi, updateProfileApi } from './services/users.api.js';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchProfileApi();
        if (data.success) {
          setProfile(data.data);
        }
      } catch (err) {
        console.error('Error loading profile', err);
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleChange = (e) => {
    setProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg('');
    try {
      const data = await updateProfileApi(profile);
      if (data.success) {
        setSuccessMsg('Profile updated successfully.');
      }
    } catch (err) {
      console.error('Error saving profile', err);
      setError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account settings and preferences.</p>
      </header>

      {error && activeTab === 'profile' && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg font-medium">
          {error}
        </div>
      )}
      
      {successMsg && activeTab === 'profile' && (
        <div className="p-3 text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-lg font-medium flex items-center gap-2">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b border-border">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-3 border-b-2 text-sm font-medium transition-colors ${activeTab === 'profile' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Profile
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`px-6 py-3 border-b-2 text-sm font-medium transition-colors ${activeTab === 'security' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Security
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`px-6 py-3 border-b-2 text-sm font-medium transition-colors ${activeTab === 'notifications' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Notifications
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {activeTab === 'profile' && (
            <div className="animate-in fade-in duration-300">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-4">
                <User size={18} /> Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">First Name</label>
                  <input type="text" name="firstName" value={profile.firstName} onChange={handleChange} className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="First Name" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Last Name</label>
                  <input type="text" name="lastName" value={profile.lastName} onChange={handleChange} className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Last Name" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-foreground mb-1 block">Phone Number</label>
                  <input type="text" name="phone" value={profile.phone} onChange={handleChange} className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+1 (555) 000-0000" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-foreground mb-1 block">Email Address</label>
                  <input type="email" className="w-full h-9 px-3 text-sm rounded-md border border-border bg-muted text-muted-foreground focus:outline-none" value={profile.email} disabled />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} className="mt-4 bg-primary text-primary-foreground h-9 px-4 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center">
                {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="animate-in fade-in duration-300">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-4">
                <Shield size={18} /> Security Settings
              </h3>
              <p className="text-sm text-muted-foreground mb-4">Manage your password and security preferences.</p>
              <div className="border border-border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="text-muted-foreground" size={20} />
                    <div>
                      <p className="text-sm font-medium">Password</p>
                      <p className="text-xs text-muted-foreground">Change your account password.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => alert("Password updates are managed via Firebase Auth. This feature will be enabled in the next release.")}
                    className="h-8 px-3 border border-border rounded-md text-xs font-medium hover:bg-muted transition-colors"
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-in fade-in duration-300">
              <h3 className="font-medium text-foreground flex items-center gap-2 mb-4">
                <Bell size={18} /> Notification Preferences
              </h3>
              <p className="text-sm text-muted-foreground mb-4">Choose what alerts you want to receive.</p>
              <div className="space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">Email Alerts</p>
                    <p className="text-xs text-muted-foreground">Receive emails when applications require an OTP.</p>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-primary" defaultChecked />
                </label>
                <hr className="border-border" />
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">Application Summaries</p>
                    <p className="text-xs text-muted-foreground">Receive weekly emails outlining AI progress.</p>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-primary" defaultChecked />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
