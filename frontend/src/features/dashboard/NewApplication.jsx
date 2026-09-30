import React, { useState, useEffect, useRef } from 'react';
import { Play, ShieldAlert, MessageSquare, Loader2, Send, CheckCircle2, Paperclip, AlertTriangle } from 'lucide-react';
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
  
  // State Machine: Idle -> ANALYZING -> INTERVIEWING -> READY_TO_EXECUTE -> RUNNING -> PAUSED_* -> COMPLETED / FAILED
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState({ currentStep: 0, totalSteps: 0 });
  const [errorDetails, setErrorDetails] = useState(null);
  
  // Tracking IDs
  const [conversationId, setConversationId] = useState(null);
  const [interviewStateId, setInterviewStateId] = useState(null);
  const [jobId, setJobId] = useState(null);
  
  const [browserPreview, setBrowserPreview] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [pauseContext, setPauseContext] = useState(null); // { fieldName, pauseReason, captchaImageBase64 }
  
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
          if (job.progress) {
             setProgress(job.progress);
          }
          if (job.status === 'FAILED') {
             setErrorDetails(job.errorDetails || 'Automation execution failed.');
          }
          
          if (job.status === 'PAUSED_OTP' || job.status === 'PAUSED_CAPTCHA') {
             // Store pause context (captcha image, field name)
             if (job.pauseContext) {
               setPauseContext(job.pauseContext);
             }
             const lastLog = job.logs[job.logs.length - 1]?.message || 'Action required.';
             const alreadyShown = messages.some(m => m.content.includes('paused') && m.sender === 'AI');
             if (!alreadyShown) {
               const pauseMsg = job.status === 'PAUSED_CAPTCHA'
                 ? `⏸️ The form has a CAPTCHA. Please look at the image in the Execution Monitor panel on the right and type the code you see.`
                 : `⏸️ The form requires an OTP. Please check your registered mobile/email and type the OTP code below.`;
               setMessages(prev => [...prev, { sender: 'AI', content: pauseMsg }]);
               // If CAPTCHA image available, also show it inline in the chat
               if (job.status === 'PAUSED_CAPTCHA' && job.pauseContext?.captchaImageBase64) {
                 setMessages(prev => [...prev, {
                   sender: 'AI',
                   content: '__CAPTCHA_IMAGE__',
                   captchaImage: job.pauseContext.captchaImageBase64
                 }]);
               }
             }
          }
          if (job.logs && job.logs.length > 0) {
             const latestLogWithReceipt = [...job.logs].reverse().find(l => l.additionalData?.base64Receipt);
             if (latestLogWithReceipt) {
                setBrowserPreview(`data:image/png;base64,${latestLogWithReceipt.additionalData.base64Receipt}`);
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
    setErrorDetails(null);
    
    try {
      const res = await analyzeUrlApi(url);
      if (res.success) {
        setInterviewStateId(res.data.interviewStateId);
        setConversationId(res.data.conversationId);
        if (res.data.landingScreenshot) {
          setBrowserPreview(`data:image/png;base64,${res.data.landingScreenshot}`);
        }
        setMessages(prev => [...prev, res.data.firstMessage]);
        if (res.data.firstMessage?.content?.includes("ready to submit")) {
          setStatus('READY_TO_EXECUTE');
        } else {
          setStatus('INTERVIEWING');
        }
      } else {

        throw new Error("Failed to analyze");
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "Failed to analyze the application form.";
      if (err.response?.data?.details?.originalError) {
         errorMessage = err.response.data.details.originalError;
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

  const handleSendMessageDirect = async (textVal) => {
    if (!textVal) return;
    const userMessage = { sender: 'User', content: textVal };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    if (status === 'PAUSED_OTP' || status === 'PAUSED_CAPTCHA') {
      try {
        const fieldName = pauseContext?.fieldName || (status === 'PAUSED_CAPTCHA' ? 'captcha' : 'otp');
        const inputPayload = {
          [fieldName]: userMessage.content,
          otp: userMessage.content,
          captcha: userMessage.content,
        };
        await resumeAutomationApi(jobId, inputPayload);
        setMessages(prev => [...prev, { sender: 'AI', content: "✅ Got it! Resuming the application..." }]);
      } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { sender: 'AI', content: "Failed to resume application. Please try again." }]);
      }
      setIsTyping(false);
      return;
    }

    if (status === 'INTERVIEWING' && conversationId) {
      try {
        const res = await sendInterviewMessageApi(conversationId, textVal);
        if (res.success) {
          setMessages(prev => [...prev, res.data.reply]);
          if (res.data.state?.status === 'COMPLETED') {
            setStatus('READY_TO_EXECUTE');
          }
        }
      } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, { sender: 'AI', content: "I had trouble processing that. Could you repeat?" }]);
      }
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
    
    // 1. If Execution is paused for OTP/CAPTCHA
    if (status === 'PAUSED_OTP' || status === 'PAUSED_CAPTCHA') {
      try {
        // Build input keyed by the exact paused field name + generic keys
        const fieldName = pauseContext?.fieldName || (status === 'PAUSED_CAPTCHA' ? 'captcha' : 'otp');
        const inputPayload = {
          [fieldName]: userMessage.content,
          otp: userMessage.content,
          captcha: userMessage.content,
        };
        await resumeAutomationApi(jobId, inputPayload);
        setMessages(prev => [...prev, { sender: 'AI', content: "✅ Got it! Resuming the application..." }]);
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
          setMessages(prev => [...prev, reply]);
          
          if (state.status === 'COMPLETED') {
            setStatus('READY_TO_EXECUTE');
          }
        }
      } catch (e) {
        console.error(e);
        let errorMsg = "I had trouble processing that. Could you repeat?";
        if (e.response?.data?.error?.message) {
            errorMsg = `System Error: ${e.response.data.error.message}`;
        } else if (e.response?.data?.error) {
            errorMsg = typeof e.response.data.error === 'string' ? e.response.data.error : JSON.stringify(e.response.data.error);
        }
        setMessages(prev => [...prev, { sender: 'AI', content: errorMsg }]);
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
      setErrorDetails('Execution failed to initialize.');
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
                 {m.captchaImage ? (
                   <div className="max-w-[80%] p-3 rounded-lg bg-amber-50 border-2 border-amber-400 rounded-tl-none">
                     <p className="text-xs font-semibold text-amber-700 mb-2">🔐 CAPTCHA — Type the code you see:</p>
                     <img
                       src={`data:image/png;base64,${m.captchaImage}`}
                       alt="CAPTCHA"
                       className="rounded border border-amber-300 max-w-full"
                       style={{ imageRendering: 'pixelated' }}
                     />
                   </div>
                 ) : (
                   <div className={`max-w-[80%] p-3 rounded-lg text-sm ${m.sender === 'User' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted text-foreground border border-border rounded-tl-none'}`}>
                     <div>{m.content}</div>

                     {/* Render Interactive Checkbox / Choice Selector if message has options */}
                     {m.sender === 'AI' && (m.metadata?.options || m.options) && (
                       <div className="mt-3 pt-3 border-t border-border/60">
                         <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                           <span className="text-primary font-bold">☑</span> Select an Option from Website:
                         </p>
                         <div className="space-y-1.5">
                           {(() => {
                             const opts = m.metadata?.options || m.options;
                             let items = [];
                             if (Array.isArray(opts)) {
                               items = opts.map(o => (typeof o === 'object' ? { value: o.value || o.label || o.text, label: o.label || o.text || o.value } : { value: o, label: o }));
                             } else if (typeof opts === 'object') {
                               items = Object.entries(opts).map(([k, v]) => ({ value: k, label: typeof v === 'string' ? v : k }));
                             }
                             // Filter out placeholder header options
                             items = items.filter(i => i.label && !i.label.includes('Please Select') && i.value !== 'none');

                             return items.map((opt, i) => (
                               <label
                                 key={i}
                                 onClick={(e) => {
                                   e.preventDefault();
                                   setInput(opt.label);
                                   handleSendMessageDirect(opt.label);
                                 }}
                                 className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/80 hover:bg-primary/10 hover:border-primary/50 text-foreground cursor-pointer transition-all shadow-sm group active:scale-[0.98]"
                               >
                                 <input
                                   type="checkbox"
                                   readOnly
                                   checked={false}
                                   className="h-4 w-4 rounded border-primary/50 text-primary focus:ring-primary group-hover:scale-110 transition-transform cursor-pointer accent-primary"
                                 />
                                 <span className="text-xs font-medium group-hover:text-primary transition-colors">
                                   {opt.label}
                                 </span>
                               </label>
                             ));
                           })()}
                         </div>
                       </div>
                     )}
                   </div>
                 )}
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
          <div className="flex items-center gap-2">
            {progress.totalSteps > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                Step {progress.currentStep}/{progress.totalSteps}
              </span>
            )}
            <span className={`text-xs px-2 py-1 rounded font-mono ${
               ['RUNNING', 'ANALYZING'].includes(status) ? 'bg-blue-500/10 text-blue-600' :
               status === 'INTERVIEWING' ? 'bg-purple-500/10 text-purple-600' :
               status === 'READY_TO_EXECUTE' ? 'bg-green-500/10 text-green-600' :
               status.startsWith('PAUSED') ? 'bg-amber-500/10 text-amber-600' :
               status === 'COMPLETED' ? 'bg-green-500/10 text-green-600' :
               status === 'FAILED' ? 'bg-red-500/10 text-red-600' :
               'bg-muted text-muted-foreground'
            }`}>
               {status}
            </span>
          </div>
        </div>
        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-muted/10 relative overflow-hidden">
           
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
           ) : (
             <div className="relative w-full h-full flex flex-col items-center justify-center">
               {/* Live Browser Preview Image */}
               {browserPreview ? (
                 <div className="relative w-full h-full flex items-center justify-center overflow-auto rounded border border-border bg-background shadow-inner">
                   <img src={browserPreview} alt="Live Website State" className="max-w-full max-h-full object-contain rounded" />
                 </div>
               ) : (
                 <div className="text-center text-muted-foreground p-6">
                   <Loader2 size={32} className="animate-spin mx-auto mb-4 text-primary" />
                   <p className="font-medium text-sm">Browser Engine Active...</p>
                   {progress.totalSteps > 0 && (
                      <p className="text-xs mt-1 font-mono text-primary">Executing Step {progress.currentStep} of {progress.totalSteps}</p>
                   )}
                 </div>
               )}

               {/* Overlay Status Cards */}
               {status === 'INTERVIEWING' && !browserPreview && (
                 <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                   <MessageSquare size={32} className="mx-auto mb-3 text-purple-500" />
                   <p className="font-medium text-sm text-foreground">AI Interview in Progress</p>
                   <p className="text-xs text-muted-foreground mt-1">Please answer the questions in the chat panel.</p>
                 </div>
               )}

               {status === 'PAUSED_CAPTCHA' && (
                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-[90%] p-4 rounded-xl bg-amber-500/95 text-amber-950 backdrop-blur border-2 border-amber-400 shadow-2xl animate-in slide-in-from-bottom-4">
                   <div className="font-bold text-sm mb-1 flex items-center justify-center gap-2">🔐 CAPTCHA Required</div>
                   <p className="text-xs text-amber-900 mb-2 text-center">The live site requires a CAPTCHA. Type the code in the chat panel to proceed.</p>
                   {pauseContext?.captchaImageBase64 && (
                     <img
                       src={`data:image/png;base64,${pauseContext.captchaImageBase64}`}
                       alt="CAPTCHA to solve"
                       className="mx-auto rounded border border-amber-600 bg-white p-1 mb-2 shadow-sm"
                       style={{ imageRendering: 'pixelated', maxHeight: '60px' }}
                     />
                   )}
                   <p className="text-[11px] text-amber-900 font-mono text-center font-semibold">Type the code in the chat ↙</p>
                 </div>
               )}

               {status === 'PAUSED_OTP' && (
                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-[90%] p-4 rounded-xl bg-blue-500/95 text-blue-950 backdrop-blur border-2 border-blue-400 shadow-2xl animate-in slide-in-from-bottom-4 text-center">
                   <div className="font-bold text-sm mb-1">📱 OTP Required</div>
                   <p className="text-xs text-blue-900 mb-1">An OTP was sent to your registered mobile/email.</p>
                   <p className="text-[11px] text-blue-900 font-mono font-semibold">Type the OTP code in the chat ↙</p>
                 </div>
               )}

               {status === 'READY_TO_EXECUTE' && (
                 <div className="absolute top-4 right-4 bg-green-600 text-white px-3 py-1.5 rounded-lg shadow-lg font-medium text-xs flex items-center gap-2 backdrop-blur">
                   <CheckCircle2 size={16} />
                   All Fields Gathered
                 </div>
               )}

               {status === 'FAILED' && (
                 <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center p-4">
                   <div className="text-center max-w-sm p-4 rounded-lg bg-red-50 border border-red-200">
                     <AlertTriangle size={40} className="mx-auto mb-2 text-red-500" />
                     <p className="font-semibold text-sm text-red-700">Execution Failed</p>
                     <p className="text-xs mt-1 text-red-600 font-mono break-words">{errorDetails || 'An unexpected error occurred during execution.'}</p>
                   </div>
                 </div>
               )}
             </div>
           )}

        </div>
      </div>

    </div>
  );
}
