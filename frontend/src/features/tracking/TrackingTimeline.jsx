import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, FileText, ArrowUpRight, Search } from 'lucide-react';

export default function TrackingTimeline() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch('http://localhost:5000/api/v1/tracking/timeline', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setApplications(data.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Application Tracking</h1>
        <p className="text-gray-400">Monitor the live status of your AI-submitted applications.</p>
      </header>
      
      {loading ? (
        <div className="flex justify-center py-20"><Clock className="animate-spin text-indigo-500" size={32} /></div>
      ) : (
        <div className="space-y-6">
          {applications.map((app, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={app._id}
              className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-6 rounded-2xl shadow-xl flex items-center justify-between group"
            >
              <div className="flex items-center space-x-6">
                <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
                  <FileText size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{app.workflowId?.name || 'Unknown Application'}</h3>
                  <div className="flex items-center space-x-4 mt-2 text-sm">
                    <span className="text-gray-400 flex items-center space-x-1">
                      <Clock size={14} />
                      <span>{new Date(app.submittedAt).toLocaleDateString()}</span>
                    </span>
                    <span className="text-gray-500">Ref: {app.applicationNumber}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex flex-col items-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    app.status === 'SUBMITTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                  }`}>
                    {app.status}
                  </span>
                  {app.receiptUrl && (
                    <a href={app.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 mt-2 hover:text-indigo-300 flex items-center space-x-1 transition-colors">
                      <Search size={12} />
                      <span>View Receipt</span>
                    </a>
                  )}
                </div>
                <button className="p-3 bg-gray-900 rounded-xl text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-all group-hover:bg-indigo-600 group-hover:border-indigo-500">
                  <ArrowUpRight size={20} />
                </button>
              </div>
            </motion.div>
          ))}
          {applications.length === 0 && (
            <div className="text-center py-20 text-gray-500 border border-dashed border-gray-700 rounded-2xl">
              No applications submitted yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
