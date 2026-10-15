import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/ui/logo';

export default function PortariaResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [validSession, setValidSession] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        // Escuta o evento PASSWORD_RECOVERY garantindo que a sessão de recovery foi carregada
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || session) {
                setValidSession(true);
            }
        });

        // Caso a URL tenha tokens e o estado já tenha resolvido a sessão inicial
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setValidSession(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            toast({ title: "As senhas não coincidem", variant: "destructive" });
            return;
        }
        if (password.length < 6) {
            toast({ title: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            
            toast({ title: "Senha alterada com sucesso!", description: "Faça login com a nova senha." });
            
            // Logout e redireciona para login
            await supabase.auth.signOut();
            window.location.href = '/login';
            
        } catch (err: any) {
            toast({ title: "Erro ao atualizar senha", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    if (!validSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
                <Card className="w-full max-w-md border-border/10 bg-zinc-900/50 backdrop-blur-xl">
                    <CardHeader className="text-center">
                        <CardTitle className="text-xl text-white">Sessão Inválida ou Expirada</CardTitle>
                        <CardDescription>Não foi possível iniciar o fluxo de recuperação.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <Button variant="outline" onClick={() => window.location.href = '/login'}>Voltar para o Login</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
            <Card className="w-full max-w-md border-border/10 bg-zinc-900/50 backdrop-blur-xl">
                <CardHeader className="text-center">
                    <Logo variant="default" className="mb-4" />
                    <CardTitle className="text-2xl font-black tracking-tight text-white">REDEFINIR SENHA</CardTitle>
                    <CardDescription>Crie uma nova senha de acesso.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="relative">
                            <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Nova senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-zinc-800/50 border-zinc-700 pr-10"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <div className="relative">
                            <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Confirmar senha"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="bg-zinc-800/50 border-zinc-700 pr-10"
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Atualizando...' : 'Atualizar Senha'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
