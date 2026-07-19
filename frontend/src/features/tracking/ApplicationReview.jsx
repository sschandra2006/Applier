import React, { useState } from 'react';
import { ShieldCheck, Play, ArrowRight, Loader2 } from 'lucide-react';

export default function ApplicationReview({ interviewState, onApprove }) {
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    await onApprove(interviewState._id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <header className="text-center">
        <div className="inline-flex items-center space-x-2 bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-full border border-emerald-500/20 mb-4">
          <ShieldCheck size={18} />
          <span className="font-medium">Data Verified</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Review Your Application</h1>
        <p className="text-gray-400">Please verify the extracted information before our AI takes over the browser to submit.</p>
      </header>

      <div className="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-gray-700/50">
          <h2 className="text-xl font-semibold text-white">Extracted Answers</h2>
        </div>
        <div className="p-6">
          <dl className="divide-y divide-gray-700/50">
            {Object.entries(interviewState?.answers || {}).map(([key, value]) => (
              <div key={key} className="py-4 flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</dt>
                <dd className="text-sm font-semibold text-white bg-gray-900/50 px-3 py-1 rounded-lg border border-gray-700">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors">
          Edit Answers
        </button>
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] flex items-center space-x-2 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Play size={18} />
          )}
          <span>{submitting ? 'Starting AI Engine...' : 'Approve & Execute Submission'}</span>
          {!submitting && <ArrowRight size={18} />}
        </button>
      </div>
    </div>
  );
}
