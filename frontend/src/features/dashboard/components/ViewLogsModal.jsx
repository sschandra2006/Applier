import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal } from 'lucide-react';

export default function ViewLogsModal({ isOpen, onClose, job }) {
  if (!isOpen || !job) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="bg-card w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[80vh]"
        >
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-primary" />
              <h2 className="font-semibold">Execution Logs</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-4 overflow-y-auto bg-black text-gray-300 font-mono text-sm flex-1 space-y-2">
            {job.logs && job.logs.length > 0 ? (
              job.logs.map((log, index) => (
                <div key={index} className={`flex gap-3 ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' ? 'text-yellow-400' : ''}`}>
                  <span className="text-gray-500 shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
                  </span>
                  <span className="font-semibold shrink-0">
                    {log.level}:
                  </span>
                  <span className="break-words break-all">
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500 italic">No logs available for this application.</div>
            )}
          </div>
          
          <div className="p-4 border-t border-border bg-muted/30 flex justify-end">
             <button 
                onClick={onClose}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm hover:bg-primary/90 transition-colors"
             >
                Close Logs
             </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
