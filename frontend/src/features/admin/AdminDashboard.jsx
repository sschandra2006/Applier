import React, { useState, useEffect } from 'react';
import { ShieldCheck, Activity, AlertTriangle, Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [statsRes, queueRes] = await Promise.all([
          fetch('http://localhost:5000/api/v1/admin/stats', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('http://localhost:5000/api/v1/admin/queue', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        const statsData = await statsRes.json();
        const queueData = await queueRes.json();
        
        if (statsData.success && queueData.success) {
          setStats(statsData.data);
          setQueue(queueData.data);
        } else {
          setError(statsData.error || queueData.error || 'Access Denied');
        }
      } catch (err) {
        console.error(err);
        setError('Network Error or Unauthorized');
      }
    };
    
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 5000); // Live poll
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-4">
        <ShieldCheck size={64} className="text-red-500/50" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'RUNNING': return <Play size={16} className="text-blue-400" />;
      case 'PAUSED_OTP': return <Pause size={16} className="text-yellow-400" />;
      case 'FAILED': return <AlertTriangle size={16} className="text-red-400" />;
      case 'COMPLETED': return <ShieldCheck size={16} className="text-emerald-400" />;
      default: return <Activity size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center space-x-2 bg-indigo-500/10 text-indigo-400 px-4 py-2 rounded-full border border-indigo-500/20 mb-4">
          <ShieldCheck size={18} />
          <span className="font-medium">Administrator Controls</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">System Overview</h1>
      </header>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Submissions', value: stats?.totalApplications || 0, icon: Activity, color: 'emerald' },
          { label: 'Active Jobs (Queue)', value: stats?.activeJobs || 0, icon: Play, color: 'blue' },
          { label: 'Failed Automations', value: stats?.failedJobs || 0, icon: AlertTriangle, color: 'red' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`bg-gray-800/40 backdrop-blur-md border border-${stat.color}-500/20 p-6 rounded-2xl relative overflow-hidden`}
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${stat.color}-500/10 blur-3xl rounded-full`} />
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 bg-${stat.color}-500/10 text-${stat.color}-400 rounded-xl`}>
                <stat.icon size={24} />
              </div>
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-gray-400 text-sm font-medium">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Live Automation Queue */}
      <div className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-700/50 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Live Automation Queue</h2>
          <span className="px-3 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20 flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Live Sync</span>
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900/50">
              <tr>
                <th className="px-6 py-4">Job ID</th>
                <th className="px-6 py-4">Target Application</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {queue.map(job => (
                <tr key={job._id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{job._id}</td>
                  <td className="px-6 py-4 text-white font-medium">{job.workflowId?.name || 'Unknown'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(job.status)}
                      <span>{job.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">{new Date(job.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length === 0 && (
            <div className="p-10 text-center text-gray-500">Queue is empty</div>
          )}
        </div>
      </div>
    </div>
  );
}
