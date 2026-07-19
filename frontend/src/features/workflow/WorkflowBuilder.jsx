import React, { useState } from 'react';
import { generateWorkflow } from './workflow.api.js';
import { motion } from 'framer-motion';
import { Search, Loader2, Sparkles, Server, Check } from 'lucide-react';

export default function WorkflowBuilder() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError('');
    setSchema(null);
    try {
      const data = await generateWorkflow(url);
      setSchema(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="text-center py-8">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center space-x-2 bg-indigo-500/10 text-indigo-400 px-4 py-2 rounded-full border border-indigo-500/20 mb-6"
        >
          <Sparkles size={16} />
          <span className="text-sm font-medium">AI Powered Engine</span>
        </motion.div>
        <h1 className="text-4xl font-bold text-white mb-4">Workflow Builder</h1>
        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
          Paste an application URL below. Our AI will scan the page headlessly, extract all form data, and generate a strict execution schema.
        </p>
      </header>

      <form onSubmit={handleGenerate} className="relative group">
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
        </div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/apply"
          className="w-full bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 text-white px-14 py-5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 shadow-2xl transition-all text-lg"
          required
        />
        <div className="absolute inset-y-2 right-2">
          <button
            type="submit"
            disabled={loading}
            className="h-full px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Scanning...</span>
              </>
            ) : (
              <span>Generate Schema</span>
            )}
          </button>
        </div>
      </form>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
          {error}
        </motion.div>
      )}

      {schema && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gray-900/50">
            <div className="flex items-center space-x-3">
              <Server className="text-emerald-400" size={20} />
              <h3 className="font-semibold text-gray-200">Generated Schema: {schema.name}</h3>
            </div>
            <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 text-sm">
              <Check size={14} />
              <span>Saved to MongoDB</span>
            </div>
          </div>
          <div className="p-6 overflow-x-auto">
            <pre className="text-gray-300 font-mono text-sm">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>
        </motion.div>
      )}
    </div>
  );
}
