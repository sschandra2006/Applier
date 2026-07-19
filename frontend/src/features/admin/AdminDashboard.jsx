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
      <div className="flex flex-col items-center justify-center h-full text-destructive space-y-4">
        <ShieldCheck size={64} className="opacity-50" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'RUNNING': return <Play size={16} className="text-blue-500" />;
      case 'PAUSED_FOR_USER_INPUT': return <Pause size={16} className="text-amber-500" />;
      case 'FAILED': return <AlertTriangle size={16} className="text-destructive" />;
      case 'COMPLETED': return <ShieldCheck size={16} className="text-green-500" />;
      default: return <Activity size={16} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto py-8">
      <header>
        <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20 mb-4 text-sm">
          <ShieldCheck size={16} />
          <span className="font-medium">Administrator Controls</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor the health and queue of the AI automation workers.</p>
      </header>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Submissions', value: stats?.totalApplications || 0, icon: Activity, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Active Jobs (Queue)', value: stats?.activeJobs || 0, icon: Play, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Failed Automations', value: stats?.failedJobs || 0, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card border border-border p-6 rounded-xl relative overflow-hidden shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 ${stat.bg} ${stat.color} rounded-lg`}>
                <stat.icon size={22} />
              </div>
            </div>
            <h3 className="text-3xl font-bold mb-1">{stat.value}</h3>
            <p className="text-muted-foreground text-sm font-medium">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Live Automation Queue */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/30 flex justify-between items-center">
          <h2 className="text-lg font-semibold flex items-center gap-2">Live Automation Queue</h2>
          <span className="px-3 py-1 bg-green-500/10 text-green-600 text-xs rounded-full border border-green-500/20 flex items-center space-x-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>Live Sync</span>
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                <th className="px-6 py-4 font-medium">Job ID</th>
                <th className="px-6 py-4 font-medium">Target URL</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queue.map(job => (
                <tr key={job._id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{job._id}</td>
                  <td className="px-6 py-4 font-medium">{job.targetUrl || 'Unknown'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2 text-xs font-medium bg-muted/30 w-fit px-2 py-1 rounded">
                      {getStatusIcon(job.status)}
                      <span>{job.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(job.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">Queue is currently empty</div>
          )}
        </div>
      </div>
    </div>
  );
}
