import React, { useState, useEffect } from 'react';
import { Bell, ShieldAlert, CheckCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:5000/api/v1/notifications', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setNotifications(data.data);
          setUnreadCount(data.data.filter(n => !n.read).length);
        }
      } catch (error) {
        console.error('Failed to fetch notifications', error);
      }
    };
    
    // In a real app, use WebSockets/SSE for real-time updates. Polling for MVP.
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`http://localhost:5000/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error(error);
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'SUCCESS': return <CheckCircle className="text-emerald-400" size={20} />;
      case 'ACTION_REQUIRED': return <ShieldAlert className="text-yellow-400" size={20} />;
      case 'ERROR': return <X className="text-red-400" size={20} />;
      default: return <Info className="text-indigo-400" size={20} />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 relative bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 rounded-full transition-colors border border-gray-700"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white border border-gray-900">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-2xl overflow-hidden z-50"
          >
            <div className="p-4 border-b border-gray-800 bg-gray-900/90 backdrop-blur-md flex justify-between items-center">
              <h3 className="font-semibold text-white">Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  You're all caught up!
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {notifications.map(notif => (
                    <div 
                      key={notif._id} 
                      onClick={() => !notif.read && markAsRead(notif._id)}
                      className={`p-4 hover:bg-gray-800/50 transition-colors cursor-pointer flex space-x-3 ${!notif.read ? 'bg-indigo-900/10' : ''}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getIcon(notif.type)}
                      </div>
                      <div>
                        <h4 className={`text-sm font-medium ${!notif.read ? 'text-white' : 'text-gray-300'}`}>
                          {notif.title}
                        </h4>
                        <p className="text-xs text-gray-400 mt-1">{notif.message}</p>
                        <span className="text-[10px] text-gray-500 mt-2 block">
                          {new Date(notif.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
