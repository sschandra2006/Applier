import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Unlock, Loader2 } from 'lucide-react';
import apiClient from '../../../core/api/api.client.js';

export default function ResumeModal({ isOpen, onClose, job, onResumed }) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !job) return null;

  const isCaptcha = job.status === 'PAUSED_CAPTCHA';
  const label = isCaptcha ? 'Enter Captcha Code' : 'Enter OTP Code';
  const description = isCaptcha 
    ? 'The automation bot encountered a captcha. Please solve the captcha or enter the required text to proceed.'
    : 'The application portal sent an OTP to your email or phone. Please enter it here to resume.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Create a mock state format since the backend expects stateId, answers, workflowUrl
      // The backend actually maps it to the Python API format.
      await apiClient.post('/automation/resume', {
         jobId: job._id,
         answers: {
             [isCaptcha ? 'captcha' : 'otp']: inputValue.trim()
         },
         state: { _id: job.interviewStateId?._id, answers: {} },
         workflow: { url: job.workflowId?.url }
      });
      
      onResumed();
    } catch (err) {
       setError(err.userMessage || 'Failed to resume application. Please try again.');
    } finally {
       setIsSubmitting(false);
    }
  };

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
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="bg-card w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Unlock size={18} className="text-amber-500" />
              <h2 className="font-semibold">Action Required</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
            
            {error && (
               <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-md text-sm">
                  {error}
               </div>
            )}
            
            <div className="space-y-2">
               <label className="text-sm font-medium">{label}</label>
               <input 
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="..."
                  autoFocus
                  className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
               />
            </div>
            
            <div className="pt-4 flex gap-3">
               <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-border bg-transparent hover:bg-muted text-foreground font-medium py-2 rounded-md transition-colors"
                  disabled={isSubmitting}
               >
                  Cancel
               </button>
               <button 
                  type="submit"
                  disabled={isSubmitting || !inputValue.trim()}
                  className="flex-1 bg-black text-white hover:bg-gray-800 font-medium py-2 rounded-md transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
               >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Resume Automation'}
               </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
