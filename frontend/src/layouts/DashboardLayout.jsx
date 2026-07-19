import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FolderClosed, Settings as SettingsIcon, LogOut, ChevronRight, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

import { signOut } from 'firebase/auth';
import { auth } from '../core/firebase.js';
import { useAuth } from '../core/contexts/AuthContext.jsx';

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('backend_token');
      navigate('/auth/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleNotificationClick = () => {
    alert("You have no new notifications.");
  };

  const navItems = [
    { path: '/dashboard', label: 'My Applications', icon: LayoutDashboard },
    { path: '/dashboard/new', label: 'New Application', icon: PlusCircle },
    { path: '/dashboard/documents', label: 'Document Vault', icon: FolderClosed },
    { path: '/dashboard/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const currentPage = navItems.find(item => item.path === location.pathname)?.label || 'Overview';
  
  // Calculate initials from profile
  const getInitials = () => {
    if (!userProfile) return 'U';
    const first = userProfile.firstName ? userProfile.firstName.charAt(0).toUpperCase() : '';
    const last = userProfile.lastName ? userProfile.lastName.charAt(0).toUpperCase() : '';
    const init = first + last;
    return init || 'U';
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-background border-r border-border flex flex-col z-20">
        <div className="px-6 py-5 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg leading-none">A</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Applier</h1>
        </div>
        
        <nav className="flex-1 px-3 space-y-1 mt-4">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Main Menu</p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} className="block">
                <motion.div 
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
                    isActive 
                      ? 'bg-muted text-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-sm">{item.label}</span>
                </motion.div>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout}
            className="flex items-center space-x-3 px-3 py-2 w-full rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-muted/20 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6 z-10 sticky top-0">
          <div className="flex items-center text-sm text-muted-foreground">
            <span>Applier</span>
            <ChevronRight size={14} className="mx-1" />
            <span className="text-foreground font-medium">{currentPage}</span>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={handleNotificationClick} className="text-muted-foreground hover:text-foreground transition-colors relative" title="Notifications">
              <Bell size={18} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full border border-background"></span>
            </button>
            <Link to="/dashboard/settings" title="Go to Settings">
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer border border-border shadow-sm">
                {getInitials()}
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
