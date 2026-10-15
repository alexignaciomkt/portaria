import React from 'react';
import Logo from '@/components/ui/logo';

interface AuthShellProps {
  title: string;
  subtitle: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const AuthShell = ({ title, subtitle, eyebrow, children, footer }: AuthShellProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Visual Elements (Ambient Lights) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-indigo-600/10 blur-[150px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-purple-600/10 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/5 bg-zinc-900/50 backdrop-blur-xl">
          <div className="px-6 py-10 sm:px-10 sm:py-12">
            
            <div className="flex justify-center mb-8">
              <Logo variant="large" className="drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            </div>

            <div className="text-center mb-10">
              {eyebrow && (
                <p className="text-indigo-400 font-bold uppercase tracking-[0.25em] text-[10px] mb-3">
                  {eyebrow}
                </p>
              )}
              <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">
                {title}
              </h1>
              <p className="text-zinc-400 text-sm font-medium">
                {subtitle}
              </p>
            </div>

            {children}
          </div>

          {footer && (
            <div className="bg-black/20 border-t border-white/5 px-6 py-6 sm:px-10 text-center">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthShell;
