import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';

export default function PortariaLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'login' | 'forgot'>('login');
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (error) throw error;
            if (data?.session?.access_token) {
                localStorage.setItem('A2Tickets_token', data.session.access_token);
            }
            // The Auth context handles the redirect globally via PortariaGuard
            window.location.href = '/app';
        } catch (err: any) {
            toast({ title: "Erro ao fazer login", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast({ title: "Informe o email", variant: "destructive" });
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://portaria.a2tickets360.com.br/redefinir-senha'
            });
            if (error) throw error;
            toast({ title: "Email enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
            setMode('login');
        } catch (err: any) {
            toast({ title: "Erro ao recuperar senha", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow="Sistema de Controle de Acesso"
            title="Portaria"
            subtitle="Entre com seu acesso A2Tickets360"
            footer={
                <div className="flex flex-col gap-6 justify-center">
                    <button 
                        type="button"
                        className="text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest text-[10px] transition-colors" 
                        onClick={() => setMode(mode === 'login' ? 'forgot' : 'login')}
                    >
                        {mode === 'login' ? 'Esqueci minha senha' : 'Voltar para o login'}
                    </button>
                    <p className="text-[9px] text-zinc-600 text-center w-full font-bold uppercase tracking-widest">
                        Acesso exclusivo para equipe autorizada
                    </p>
                </div>
            }
        >
            {mode === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            E-mail
                        </label>
                        <Input
                            type="email"
                            placeholder="E-mail cadastrado"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 h-14 text-sm text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all outline-none"
                            required
                        />
                    </div>
                    <div className="space-y-1.5 relative">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Senha
                        </label>
                        <div className="relative">
                            <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 h-14 pr-12 text-sm text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all outline-none"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div className="pt-2">
                        <button 
                            type="submit" 
                            className="w-full h-14 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center" 
                            disabled={loading}
                        >
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleRecovery} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            E-mail para recuperação
                        </label>
                        <Input
                            type="email"
                            placeholder="Seu email cadastrado"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-800/50 border border-white/10 rounded-xl px-4 h-14 text-sm text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all outline-none"
                            required
                        />
                    </div>
                    <div className="pt-2">
                        <button 
                            type="submit" 
                            className="w-full h-14 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center" 
                            disabled={loading}
                        >
                            {loading ? 'Enviando...' : 'Enviar link'}
                        </button>
                    </div>
                </form>
            )}
        </AuthShell>
    );
}
