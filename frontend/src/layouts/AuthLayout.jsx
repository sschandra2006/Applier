import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background text-foreground selection:bg-primary/30">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] mix-blend-screen opacity-70 animate-pulse-slow"></div>
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen opacity-60"></div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-6 relative z-10">
        
        {/* Logo/Brand Header */}
        <div className="mb-10 text-center flex flex-col items-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-4">
             <span className="text-primary-foreground font-bold text-2xl tracking-tighter">A</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Applier AI</h1>
          <p className="text-muted-foreground mt-2 font-medium">Your intelligent web automation assistant</p>
        </div>

        {/* Auth Card */}
        <div className="w-full max-w-[420px] bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          {/* Subtle Top Glow inside Card */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50"></div>
          
          <Outlet />
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-muted-foreground flex items-center gap-1.5 opacity-70">
          <Sparkles size={12} className="text-primary" />
          Powered by Qwen 2.5 & Playwright
        </div>


      </div>
    </div>
  );
}
