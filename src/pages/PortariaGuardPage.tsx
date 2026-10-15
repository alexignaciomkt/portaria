import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { portariaService, PortariaOperation } from '@/services/portariaService';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/ui/logo';

export default function PortariaGuardPage() {
    const { user, loading: authLoading, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [operations, setOperations] = useState<PortariaOperation[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        // Wait for AuthProvider to finish loading
        if (authLoading) return;

        if (!isAuthenticated) {
            navigate('/login');
            return;
        }

        const checkOperations = async () => {
            console.log('[PORTARIA] START');
            try {
                console.log('[PORTARIA] BEFORE CURRENT OPERATION');
                const ops = await portariaService.getCurrentOperations();
                console.log('[PORTARIA] AFTER CURRENT OPERATION', { count: ops.length });
                setOperations(ops);

                // Regra: Uma operação -> vai direto para o scanner
                if (ops.length === 1) {
                    navigate(`/${ops[0].slug}/scanner`, { replace: true });
                }
            } catch (err: any) {
                console.error('[PORTARIA] ERROR', err.message || err);
                const msg = err.message || 'Erro ao carregar operações';
                setError(msg);
                if (msg.toLowerCase().includes('token inválido') || msg.toLowerCase().includes('sessão') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('não autenticado')) {
                    localStorage.removeItem('A2Tickets_token');
                    localStorage.removeItem('A2Tickets_user');
                    setTimeout(() => {
                        navigate('/login');
                    }, 2000);
                }
            } finally {
                console.log('[PORTARIA] FINALLY');
                setLoading(false);
            }
        };
        checkOperations();
    }, [navigate, authLoading, isAuthenticated]);

    const handleLogout = async () => {
        localStorage.removeItem('A2Tickets_token');
        localStorage.removeItem('A2Tickets_user');
        await supabase.auth.signOut();
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
                <p>Verificando operações de portaria...</p>
            </div>
        );
    }

    // NENHUMA OPERAÇÃO
    if (operations.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
                <Card className="w-full max-w-md border-border/10 bg-zinc-900/50 backdrop-blur-xl text-center">
                    <CardHeader>
                        <Logo variant="default" className="mb-4 opacity-75" />
                        <CardTitle className="text-xl text-white">Olá, {user?.name || 'Operador'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {error ? (
                            <p className="text-red-400 text-sm">
                                Erro ao carregar operações: {error}
                            </p>
                        ) : (
                            <p className="text-zinc-400">
                                Você não possui operação de portaria ativa neste momento.
                            </p>
                        )}
                        <div className="flex flex-col gap-2">
                            {error && (
                                <Button onClick={() => window.location.reload()} className="w-full">
                                    Tentar Novamente
                                </Button>
                            )}
                            <Button variant="outline" onClick={() => window.location.href = 'https://app.a2tickets360.com.br'}>
                                Acessar meu perfil na A2Tickets360
                            </Button>
                            <Button variant="ghost" onClick={handleLogout} className="text-red-400 hover:text-red-300">
                                <LogOut className="w-4 h-4 mr-2" />
                                Sair
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // MÚLTIPLAS OPERAÇÕES
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 p-4">
            <Card className="w-full max-w-md border-border/10 bg-zinc-900/50 backdrop-blur-xl">
                <CardHeader className="text-center">
                    <Logo variant="default" className="mb-4" />
                    <CardTitle className="text-xl text-white">Operações Disponíveis</CardTitle>
                    <CardDescription>Selecione o evento para iniciar a validação.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {operations.map(op => (
                        <div key={op.id} className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 flex flex-col items-center gap-4 text-center">
                            <div>
                                <h3 className="font-bold text-white text-lg">{op.title}</h3>
                            </div>
                            <Button 
                                className="w-full"
                                onClick={() => navigate(`/${op.slug}/scanner`)}
                            >
                                ABRIR CONTROLE DE ACESSO
                            </Button>
                        </div>
                    ))}
                    
                    <Button variant="ghost" onClick={handleLogout} className="w-full mt-4 text-zinc-400 hover:text-white">
                        <LogOut className="w-4 h-4 mr-2" />
                        Sair
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
