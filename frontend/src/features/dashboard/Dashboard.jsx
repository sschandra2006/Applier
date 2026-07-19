import React from 'react';
import { Activity, FileText, CheckCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const StatCard = ({ title, value, icon: Icon, color }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-6 rounded-2xl shadow-xl"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-white">{value}</h3>
      </div>
      <div className={`p-4 rounded-xl ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  </motion.div>
);

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Overview</h1>
        <p className="text-gray-400">Welcome back! Here's how your automation engine is performing.</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Workflows" value="12" icon={Activity} color="bg-blue-500/20 text-blue-500 border border-blue-500/30" />
        <StatCard title="Total Applications" value="348" icon={FileText} color="bg-indigo-500/20 text-indigo-500 border border-indigo-500/30" />
        <StatCard title="Success Rate" value="94%" icon={CheckCircle} color="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" />
        <StatCard title="Hours Saved" value="124" icon={Clock} color="bg-purple-500/20 text-purple-500 border border-purple-500/30" />
      </div>
      
      <div className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-8 rounded-2xl shadow-xl min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Activity size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-xl font-medium text-gray-300">Activity Chart Placeholder</h3>
          <p className="text-gray-500 mt-2">Connect to analytics microservice</p>
        </div>
      </div>
    </div>
  );
}
