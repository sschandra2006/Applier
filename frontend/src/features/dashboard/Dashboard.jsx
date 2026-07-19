import React, { useState, useEffect } from 'react';
import { Play, PauseCircle, CheckCircle, XCircle, FileText, Download, RotateCcw, Trash2, Activity, ListFilter, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchDashboardStatsApi, fetchApplicationsApi } from './services/tracking.api.js';
import ViewLogsModal from './components/ViewLogsModal';
import ResumeModal from './components/ResumeModal';
import apiClient from '../../core/api/api.client.js';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <motion.div 
    whileHover={{ y: -2 }}
    className="bg-card text-card-foreground border border-border p-5 rounded-xl shadow-sm flex flex-col justify-between"
  >
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className={`p-2 rounded-md ${colorClass}`}>
        <Icon size={16} strokeWidth={2.5} />
      </div>
    </div>
    <div>
      <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
    </div>
  </motion.div>
);

export default function Dashboard() {
  const [stats, setStats] = useState({ running: 0, waiting: 0, completed: 0, failed: 0 });
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedLogJob, setSelectedLogJob] = useState(null);
  const [selectedResumeJob, setSelectedResumeJob] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const [statsData, appsData] = await Promise.all([
        fetchDashboardStatsApi(),
        fetchApplicationsApi()
      ]);
      
      if (statsData.success) setStats(statsData.data);
      if (appsData.success) setApplications(appsData.data);
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    }
  };
  useEffect(() => {
    const initLoad = async () => {
      await fetchDashboardData();
      setLoading(false);
    };
    initLoad();
    
    const interval = setInterval(fetchDashboardData, 5000); // Poll every 5s for live updates
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status) => {
    if (['RUNNING', 'ANALYZING', 'INTERVIEWING', 'READY_TO_EXECUTE'].includes(status)) {
       return <span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded text-xs font-medium border border-blue-500/20">Running</span>;
    }
    if (status.startsWith('PAUSED')) {
       return <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded text-xs font-medium border border-amber-500/20">Waiting Action</span>;
    }
    if (status === 'COMPLETED') {
       return <span className="px-2 py-1 bg-green-500/10 text-green-600 rounded text-xs font-medium border border-green-500/20">Completed</span>;
    }
    return <span className="px-2 py-1 bg-red-500/10 text-red-600 rounded text-xs font-medium border border-red-500/20">Failed</span>;
  };

  const getProgress = (job) => {
     if (job.status === 'COMPLETED') return 100;
     if (job.status === 'FAILED') return 0;
     if (job.interviewStateId) {
        const total = job.interviewStateId.pendingFields.length + job.interviewStateId.completedFields.length;
        if (total === 0) return 50;
        return Math.round((job.interviewStateId.completedFields.length / total) * 100);
     }
     return 10; // Default analyzing
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Application Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your automated job applications.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-border bg-background hover:bg-muted h-9 px-4 py-2">
            <ListFilter size={16} className="mr-2" />
            Filter
          </button>
        </div>
      </header>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Running Applications" value={stats.running} icon={Activity} colorClass="bg-blue-500/10 text-blue-600" />
        <StatCard title="Waiting for User Action" value={stats.waiting} icon={PauseCircle} colorClass="bg-amber-500/10 text-amber-600" />
        <StatCard title="Completed Applications" value={stats.completed} icon={CheckCircle} colorClass="bg-green-500/10 text-green-600" />
        <StatCard title="Failed Applications" value={stats.failed} icon={XCircle} colorClass="bg-red-500/10 text-red-600" />
      </div>
      
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b border-border">
                  <tr>
                     <th className="px-6 py-4 font-medium">Application</th>
                     <th className="px-6 py-4 font-medium">Website</th>
                     <th className="px-6 py-4 font-medium">Status</th>
                     <th className="px-6 py-4 font-medium">Current Step</th>
                     <th className="px-6 py-4 font-medium">Progress</th>
                     <th className="px-6 py-4 font-medium">Last Updated</th>
                     <th className="px-6 py-4 font-medium text-right">Action</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {applications.length === 0 ? (
                     <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-muted-foreground">
                           No applications found. Start a new one!
                        </td>
                     </tr>
                   ) : applications.map((job, index) => (
                     <motion.tr 
                        key={job._id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-muted/30 transition-colors"
                     >
                        <td className="px-6 py-4 font-medium text-foreground">
                           {job.workflowId?.name || 'Unknown Workflow'}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                           <a href={job.workflowId?.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {job.workflowId?.url ? new URL(job.workflowId.url).hostname : 'N/A'}
                           </a>
                        </td>
                        <td className="px-6 py-4">
                           {getStatusBadge(job.status)}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground truncate max-w-[200px]">
                           {job.logs?.[job.logs.length - 1]?.message || 'Initializing...'}
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2">
                              <div className="w-full bg-muted rounded-full h-2">
                                 <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${getProgress(job)}%` }}
                                    className="bg-primary h-2 rounded-full" 
                                 />
                              </div>
                              <span className="text-xs text-muted-foreground">{getProgress(job)}%</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                           {new Date(job.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                           {job.status.startsWith('PAUSED') && (
                              <button 
                                 onClick={() => setSelectedResumeJob(job)}
                                 className="text-amber-600 hover:text-amber-700 font-medium text-xs border border-amber-600/30 px-2 py-1 rounded bg-amber-500/10 transition-colors"
                              >
                                 Resume
                              </button>
                           )}
                           {job.status === 'COMPLETED' && (
                              <button 
                                 className="text-green-600 hover:text-green-700 font-medium text-xs border border-green-600/30 px-2 py-1 rounded bg-green-500/10 inline-flex items-center gap-1 transition-colors"
                                 onClick={() => alert('Receipt generation is coming soon!')}
                              >
                                 <Download size={12} /> Receipt
                              </button>
                           )}
                           <button 
                              onClick={() => setSelectedLogJob(job)}
                              className="text-muted-foreground hover:text-foreground p-1 transition-colors" 
                              title="View Logs"
                           >
                              <FileText size={16} />
                           </button>
                        </td>
                     </motion.tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
      
      {/* Modals */}
      <ViewLogsModal 
         isOpen={!!selectedLogJob} 
         onClose={() => setSelectedLogJob(null)} 
         job={selectedLogJob} 
      />
      
      <ResumeModal
         isOpen={!!selectedResumeJob}
         onClose={() => setSelectedResumeJob(null)}
         job={selectedResumeJob}
         onResumed={() => {
            setSelectedResumeJob(null);
            fetchDashboardData();
         }}
      />
    </div>
  );
}
