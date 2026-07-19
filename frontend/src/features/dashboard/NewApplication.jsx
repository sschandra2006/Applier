import React, { useState, useEffect, useRef } from 'react';
import { Play, ShieldAlert, MessageSquare, Loader2, Send, CheckCircle2, Paperclip } from 'lucide-react';
import { 
  analyzeUrlApi, 
  sendInterviewMessageApi, 
  executeApplicationApi, 
  fetchAutomationStatusApi, 
  resumeAutomationApi,
  uploadInlineDocumentApi
} from './services/automation.api.js';

export default function NewApplication() {
  const [url, setUrl] = useState('');
  const [messages, setMessages] = useState([{ sender: 'AI', content: 'Hello! I am Applier AI. Please paste the application URL to begin.' }]);
  const [input, setInput] = useState('');
  
  // State Machine: Idle -> ANALYZING -> INTERVIEWING -> READY_TO_EXECUTE -> RUNNING -> PAUSED_* -> COMPLETED/FAILED
  const [status, setStatus] = useState('Idle');
  
  // Tracking IDs
  const [conversationId, setConversationId] = useState(null);
  const [interviewStateId, setInterviewStateId] = useState(null);
  const [jobId, setJobId] = useState(null);
  
  const [browserPreview, setBrowserPreview] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Polling for Live Execution Status (Only when RUNNING or PAUSED)
  useEffect(() => {
    if (!jobId || status === 'COMPLETED' || status === 'FAILED' || status === 'Idle' || status === 'ANALYZING' || status === 'INTERVIEWING' || status === 'READY_TO_EXECUTE') return;
    
    const interval = setInterval(async () => {
      try {
        const data = await fetchAutomationStatusApi(jobId);
        if (data.success) {
          const job = data.data;
          setStatus(job.status);
          
          if (job.status === 'PAUSED_OTP' || job.status === 'PAUSED_CAPTCHA') {
             const lastLog = job.logs[job.logs.length - 1]?.message || 'Action required.';
             if (!messages.find(m => m.content.includes(lastLog))) {
                setMessages(prev => [...prev, { sender: 'AI', content: `The application is paused. The system says: ${lastLog}. Please provide the required information below.`}]);
             }
          }
          if (job.logs && job.logs.length > 0) {
             const latestLog = job.logs[job.logs.length - 1];
             if (latestLog.additionalData?.base64Receipt) {
                setBrowserPreview(`data:image/png;base64,${latestLog.additionalData.base64Receipt}`);
             }
          }
        }
      } catch (e) {
        console.error('Polling error', e);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [jobId, status, messages]);

  // Handle URL Submission -> Start Analysis
  const startAnalysis = async () => {
    if (!url) return;
    setMessages(prev => [...prev, { sender: 'User', content: `Scan and apply to: ${url}` }]);
    setMessages(prev => [...prev, { sender: 'AI', content: 'I am scanning the website, extracting the form structure, and generating an application workflow... This may take a few seconds.' }]);
    setStatus('ANALYZING');
    setIsTyping(true);
    
    try {
      const res = await analyzeUrlApi(url);
      if (res.success) {
        setInterviewStateId(res.data.interviewStateId);
        setConversationId(res.data.conversationId);
        setMessages(prev => [...prev, res.data.firstMessage]);
        setStatus('INTERVIEWING');
      } else {
        throw new Error("Failed to analyze");
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "Failed to analyze the application form.";
      if (err.response?.data?.details?.detail) {
         errorMessage = err.response.data.details.detail;
      } else if (err.response?.data?.error) {
         errorMessage = err.response.data.error;
      } else if (err.message) {
         errorMessage = err.message;
      }
      setMessages(prev => [...prev, { sender: 'AI', content: `Sorry, I failed to analyze the application form. Reason: ${errorMessage}` }]);
      setStatus('Idle');
    } finally {
      setIsTyping(false);
    }
  };

  // Handle Chat Submission
  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = { sender: 'User', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    
    // 1. If Execution is paused for OTP
    if (status === 'PAUSED_OTP' || status === 'PAUSED_CAPTCHA') {
      try {
        await resumeAutomationApi(jobId, { otp: userMessage.content, captcha: userMessage.content });
        setMessages(prev => [...prev, { sender: 'AI', content: "Got it! Resuming the application..." }]);
      } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { sender: 'AI', content: "Failed to resume application. Please try again." }]);
      }
      setIsTyping(false);
      return;
    }

    // 2. If in Interview phase
    if (status === 'INTERVIEWING' && conversationId) {
      try {
        const res = await sendInterviewMessageApi(conversationId, userMessage.content);
        if (res.success) {
          const { state, reply } = res.data;
          setMessages(prev => [...prev, { sender: 'AI', content: reply.content }]);
          
          if (state.status === 'COMPLETED') {
            setStatus('READY_TO_EXECUTE');
          }
        }
      } catch (e) {
        console.error(e);
        setMessages(prev => [...prev, { sender: 'AI', content: "I had trouble processing that. Could you repeat?" }]);
      } finally {
        setIsTyping(false);
      }
      return;
    }
    
    setIsTyping(false);
  };

  // Handle Inline File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsTyping(true);
    setUploadStatus('Validating...');
    setMessages(prev => [...prev, { sender: 'User', content: `[Attached File: ${file.name}]` }]);
    
    try {
      setUploadStatus('Compressing & Optimizing...');
      const res = await uploadInlineDocumentApi(file, 'document');
      
      if (res.success) {
         setUploadStatus('Uploading...');
         await new Promise(r => setTimeout(r, 800)); // UX delay
         
         if (status === 'INTERVIEWING' && conversationId) {
            setUploadStatus('Sending to AI...');
            const aiRes = await sendInterviewMessageApi(conversationId, `[System: User uploaded a file: ${file.name}. File saved to vault.]`);
            if (aiRes.success) {
              const { state, reply } = aiRes.data;
              setMessages(prev => [...prev, { sender: 'AI', content: reply.content }]);
              if (state.status === 'COMPLETED') {
                setStatus('READY_TO_EXECUTE');
              }
            }
         } else if (status.startsWith('PAUSED')) {
            await resumeAutomationApi(jobId, { document: res.data.fileUrl });
            setMessages(prev => [...prev, { sender: 'AI', content: "Document received! Resuming the application..." }]);
         }
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.error || "Failed to process the document.";
      setMessages(prev => [...prev, { sender: 'AI', content: errorMsg }]);
    } finally {
      setIsTyping(false);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Final Execution
  const executeApplication = async () => {
    setMessages(prev => [...prev, { sender: 'AI', content: 'Initializing Browser Engine... Deploying automation.' }]);
    setStatus('RUNNING');
    try {
      const res = await executeApplicationApi(interviewStateId);
      if (res.success) {
        setJobId(res.data._id);
      }
    } catch (e) {
      console.error(e);
      setStatus('FAILED');
      setMessages(prev => [...prev, { sender: 'AI', content: 'Execution failed to start.' }]);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500">
      
      {/* Left: AI Conversational Flow */}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare size={18} />
            AI Assistant
          </h2>
          <p className="text-xs text-muted-foreground">Chat with the AI to provide missing info.</p>
        </div>
        
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5">
           {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'User' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[80%] p-3 rounded-lg text-sm ${m.sender === 'User' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted text-foreground border border-border rounded-tl-none'}`}>
                   {m.content}
                 </div>
              </div>
           ))}
           {isTyping && (
             <div className="flex justify-start">
                 <div className="p-3 rounded-lg bg-muted text-foreground border border-border rounded-tl-none flex items-center gap-3">
                   <div className="flex gap-1">
                     <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                     <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce delay-75" />
                     <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce delay-150" />
                   </div>
                   {uploadStatus && <span className="text-xs font-medium text-muted-foreground">{uploadStatus}</span>}
                 </div>
             </div>
           )}
           <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border bg-background">
          <div className="flex items-center gap-2">
            {status === 'READY_TO_EXECUTE' ? (
               <button onClick={executeApplication} className="w-full h-10 px-4 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
                 <Play size={16} />
                 Start Application Execution
               </button>
            ) : (
              <>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  accept="image/jpeg,image/png,application/pdf"
                />
                
                {status !== 'Idle' && status !== 'ANALYZING' && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isTyping}
                    className="h-10 w-10 text-muted-foreground hover:bg-muted rounded-md flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Upload Document"
                  >
                    <Paperclip size={18} />
                  </button>
                )}
                
                <input 
                  type={status === 'Idle' ? "url" : "text"} 
                  placeholder={status === 'Idle' ? "https://company.com/apply" : "Type your answer..."} 
                  className="flex-1 h-10 px-4 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-50"
                  value={status === 'Idle' ? url : input}
                  onChange={(e) => status === 'Idle' ? setUrl(e.target.value) : setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (status === 'Idle' ? startAnalysis() : handleSendMessage())}
                  disabled={isTyping || status === 'ANALYZING'}
                />
                {status === 'Idle' ? (
                  <button onClick={startAnalysis} disabled={!url} className="h-10 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium text-sm flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50">
                    <Play size={16} />
                    Analyze
                  </button>
                ) : (
                  <button onClick={handleSendMessage} disabled={isTyping || status === 'ANALYZING' || !input.trim()} className="h-10 w-10 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center justify-center transition-colors shadow-sm disabled:opacity-50">
                    <Send size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Live Browser Preview / Progress */}
      <div className="w-full lg:w-1/2 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShieldAlert size={18} />
            Execution Monitor
          </h2>
          <span className={`text-xs px-2 py-1 rounded font-mono ${
             ['RUNNING', 'ANALYZING'].includes(status) ? 'bg-blue-500/10 text-blue-600' :
             status === 'INTERVIEWING' ? 'bg-purple-500/10 text-purple-600' :
             status === 'READY_TO_EXECUTE' ? 'bg-green-500/10 text-green-600' :
             status.startsWith('PAUSED') ? 'bg-amber-500/10 text-amber-600' :
             status === 'COMPLETED' ? 'bg-green-500/10 text-green-600' :
             'bg-muted text-muted-foreground'
          }`}>
             {status}
          </span>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center bg-muted/10 relative">
           
           {status === 'Idle' ? (
              <div className="text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full border-4 border-dashed border-muted flex items-center justify-center mx-auto mb-4" />
                <p className="font-medium text-sm">Waiting for application URL...</p>
              </div>
           ) : status === 'ANALYZING' ? (
              <div className="text-center text-muted-foreground animate-pulse">
                <Loader2 size={32} className="animate-spin mx-auto mb-4 text-primary" />
                <p className="font-medium text-sm">Scanning Website...</p>
                <p className="text-xs mt-2 opacity-70">Extracting DOM layout and generating intelligent workflow.</p>
              </div>
           ) : status === 'INTERVIEWING' ? (
              <div className="text-center text-muted-foreground">
                <MessageSquare size={32} className="mx-auto mb-4 text-purple-500" />
                <p className="font-medium text-sm">AI Interview in Progress</p>
                <p className="text-xs mt-2 opacity-70">Please answer the questions in the chat panel.</p>
              </div>
           ) : status === 'READY_TO_EXECUTE' ? (
              <div className="text-center text-green-600">
                <CheckCircle2 size={48} className="mx-auto mb-4" />
                <p className="font-medium text-lg">All Fields Gathered</p>
                <p className="text-sm mt-2 opacity-80">Ready to deploy automation engine.</p>
              </div>
           ) : browserPreview ? (
              <img src={browserPreview} alt="Browser state" className="max-w-full max-h-full object-contain rounded border border-border shadow-sm" />
           ) : (
              <div className="text-center text-muted-foreground animate-pulse">
                <Loader2 size={32} className="animate-spin mx-auto mb-4 text-primary" />
                <p className="font-medium text-sm">Browser Engine Active...</p>
                <p className="text-xs mt-2 opacity-70">Executing workflow steps.</p>
              </div>
           )}

        </div>
      </div>

    </div>
  );
}
