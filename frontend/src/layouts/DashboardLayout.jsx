import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Network, Settings, LogOut, ShieldCheck, ShoppingBag } from 'lucide-react';
import { motion } from 'framer-motion';
import NotificationCenter from '../features/notifications/NotificationCenter';

export default function DashboardLayout() {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { path: '/dashboard/marketplace', label: 'Marketplace', icon: ShoppingBag },
    { path: '/dashboard/workflows', label: 'Workflow Builder', icon: Network },
    { path: '/dashboard/tracking', label: 'Tracking', icon: Settings },
    { path: '/dashboard/admin', label: 'Admin Panel', icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">
      <aside className="w-64 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 flex flex-col z-10">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">Applier AI</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}>
                <motion.div 
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </motion.div>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-800">
          <button className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black relative">
        <header className="h-16 border-b border-gray-700 bg-gray-900/50 backdrop-blur-md flex items-center justify-between px-8 z-10 sticky top-0">
          <h2 className="text-lg font-semibold text-white capitalize">
            {location.pathname.split('/').pop() || 'overview'}
          </h2>
          <div className="flex items-center space-x-4">
            <NotificationCenter />
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg border border-gray-700 cursor-pointer">
              JD
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
