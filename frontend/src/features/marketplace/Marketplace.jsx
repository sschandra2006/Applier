import React, { useState, useEffect } from 'react';
import { Search, Zap, Clock, Play, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function Marketplace() {
  const [apps, setApps] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMarketplace = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('http://localhost:5000/api/v1/workflows/marketplace', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setApps(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch marketplace data', error);
      }
    };
    fetchMarketplace();
  }, []);

  const categories = ['All', ...new Set(apps.map(a => a.category))];

  const filteredApps = apps.filter(app => {
    const matchCategory = activeCategory === 'All' || app.category === activeCategory;
    const matchSearch = app.name.toLowerCase().includes(search.toLowerCase()) || 
                        app.description.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleStartApplication = (url) => {
    // Navigate to Workflow Builder with pre-filled URL to instantly generate and start
    navigate(`/dashboard/workflows?url=${encodeURIComponent(url)}`);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Universal Marketplace</h1>
          <p className="text-gray-400">Discover and launch automated applications instantly.</p>
        </div>
        
        <div className="relative max-w-md w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-xl leading-5 bg-gray-900/50 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm backdrop-blur-md transition-all"
            placeholder="Search for ePass, PAN, SBI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Categories */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              activeCategory === category
                ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white border border-gray-700/50'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredApps.map((app, index) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            key={app.id}
            className="bg-gray-800/40 backdrop-blur-xl border border-gray-700 hover:border-indigo-500/50 rounded-2xl p-6 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-semibold rounded-full border border-indigo-500/20">
                  {app.category}
                </span>
                <span className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle size={12} />
                  <span>Verified</span>
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{app.name}</h3>
              <p className="text-gray-400 text-sm mb-6 line-clamp-2">{app.description}</p>
            </div>
            
            <div>
              <div className="flex items-center justify-between text-sm text-gray-500 mb-6 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                <div className="flex items-center space-x-1.5">
                  <Clock size={16} className="text-gray-400" />
                  <span>{app.estimatedTime}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Zap size={16} className="text-yellow-500" />
                  <span>{app.successRate} Success</span>
                </div>
              </div>
              
              <button 
                onClick={() => handleStartApplication(app.url)}
                className="w-full py-3 bg-white text-gray-900 hover:bg-gray-100 rounded-xl font-semibold flex items-center justify-center space-x-2 transition-colors shadow-lg"
              >
                <Play size={18} />
                <span>Start Application</span>
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredApps.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <Search size={48} className="mx-auto mb-4 text-gray-600 opacity-50" />
          <h2 className="text-xl font-medium text-gray-400">No applications found</h2>
          <p className="mt-2 text-sm">Try adjusting your search or category filter.</p>
        </div>
      )}
    </div>
  );
}
