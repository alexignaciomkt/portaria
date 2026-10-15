import { supabase } from '@/lib/supabase';

export const resolveApiBaseUrl = (): string => {
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        // Se estiver em HTTPS (ex: túnel Cloudflare, produção) OU não for localhost (ex: celular acessando o túnel):
        // SEMPRE usar caminho relativo ('') para rotear via proxy Same-Origin (Vite proxy / Vercel rewrites),
        // evitando erros de Mixed Content e "Failed to fetch" no mobile.
        if (window.location.protocol === 'https:' || !isLocalhost) {
            return '';
        }
    }
    return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
};

export const API_BASE_URL = resolveApiBaseUrl();
console.log('API Conectada em:', API_BASE_URL || '(Relativa / Proxy Same-Origin)');

export interface CustomRequestInit extends RequestInit {
    timeout?: number;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> => {
    let timerId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timerId = setTimeout(() => {
            const err = new Error(timeoutMsg);
            err.name = 'TimeoutError';
            reject(err);
        }, ms);
    });
    return Promise.race([
        promise.finally(() => clearTimeout(timerId)),
        timeoutPromise
    ]);
};

let activeRefreshPromise: Promise<string | null> | null = null;

export async function getValidAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
    if (activeRefreshPromise) {
        return activeRefreshPromise;
    }

    const resolveToken = async (): Promise<string | null> => {
        try {
            if (options.forceRefresh) {
                console.log('🔄 [AUTH] Forçando renovação da sessão via Supabase...');
                const refreshPromise = supabase.auth.refreshSession();
                const { data, error } = await withTimeout(refreshPromise, 4500, 'Supabase refreshSession timeout');
                if (!error && data?.session?.access_token) {
                    localStorage.setItem('A2Tickets_token', data.session.access_token);
                    return data.session.access_token;
                }
                console.warn('⚠️ [AUTH] Falha ao renovar sessão:', error?.message);
                return localStorage.getItem('A2Tickets_token') || null;
            }

            // Busca sessão atual com timeout de segurança (4s)
            const getSessionPromise = supabase.auth.getSession();
            const { data: { session }, error } = await withTimeout(getSessionPromise, 4000, 'Supabase getSession timeout')
                .catch(() => ({ data: { session: null }, error: new Error('Session timeout') }));

            if (error || !session) {
                console.log('🔄 [AUTH] Sem sessão ativa em cache, tentando refreshSession...');
                const { data: refData, error: refErr } = await withTimeout(supabase.auth.refreshSession(), 4000, 'Supabase refreshSession timeout')
                    .catch(() => ({ data: null, error: new Error('Refresh timeout') }));

                if (!refErr && refData?.session?.access_token) {
                    localStorage.setItem('A2Tickets_token', refData.session.access_token);
                    return refData.session.access_token;
                }
                return localStorage.getItem('A2Tickets_token') || null;
            }

            // Checa expiração (margem de 60 segundos)
            const nowSec = Math.floor(Date.now() / 1000);
            const expiresAt = session.expires_at || 0;
            if (expiresAt > 0 && (expiresAt - nowSec) < 60) {
                console.log('🔄 [AUTH] Token expirado ou próximo de expirar. Renovando sessão...');
                const { data: refData, error: refErr } = await withTimeout(supabase.auth.refreshSession(), 4000, 'Supabase refreshSession timeout')
                    .catch(() => ({ data: null, error: new Error('Refresh timeout') }));

                if (!refErr && refData?.session?.access_token) {
                    localStorage.setItem('A2Tickets_token', refData.session.access_token);
                    return refData.session.access_token;
                }
            }

            localStorage.setItem('A2Tickets_token', session.access_token);
            return session.access_token;
        } catch (err: any) {
            console.warn('⚠️ [AUTH] Fallback para token local após instabilidade:', err.message || err);
            return localStorage.getItem('A2Tickets_token') || null;
        } finally {
            activeRefreshPromise = null;
        }
    };

    activeRefreshPromise = resolveToken();
    return activeRefreshPromise;
}

export async function authenticatedFetch(url: string, init: CustomRequestInit = {}): Promise<Response> {
    const timeoutMs = init.timeout ?? 10000; // 10s default timeout
    const controller = new AbortController();
    let isTimedOut = false;

    // Link com signal externo, se fornecido
    if (init.signal) {
        if (init.signal.aborted) {
            controller.abort(init.signal.reason);
        } else {
            init.signal.addEventListener('abort', () => controller.abort(init.signal?.reason));
        }
    }

    const timerId = setTimeout(() => {
        isTimedOut = true;
        controller.abort(new Error('TIMEOUT_EXCEEDED'));
    }, timeoutMs);

    try {
        let token = await getValidAccessToken();

        const doFetch = (authToken: string | null) => {
            const headers: Record<string, string> = {
                ...(init.headers as Record<string, string> || {}),
            };
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }
            const { timeout, signal, ...restInit } = init;
            return fetch(url, {
                ...restInit,
                signal: controller.signal,
                headers
            });
        };

        let response = await doFetch(token);

        // Se receber 401, tenta UMA ÚNICA recuperação controlada da sessão
        if (response.status === 401) {
            console.warn('⚠️ [AUTH] 401 recebido. Tentando renovação controlada de sessão (tentativa única)...');
            const refreshedToken = await getValidAccessToken({ forceRefresh: true });
            if (refreshedToken) {
                console.log('✅ [AUTH] Sessão renovada com sucesso. Repetindo requisição...');
                response = await doFetch(refreshedToken);
            } else {
                console.error('❌ [AUTH] Sessão irrecuperável. Limpando credenciais locais...');
                localStorage.removeItem('A2Tickets_token');
                localStorage.removeItem('A2Tickets_user');
            }
        }

        return response;
    } catch (err: any) {
        if (isTimedOut || err?.name === 'AbortError' || err?.message === 'TIMEOUT_EXCEEDED') {
            const timeoutError = new Error('Tempo limite de rede excedido (10s). O servidor não respondeu a tempo.');
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
        }
        throw err;
    } finally {
        clearTimeout(timerId);
    }
}

export async function request<T>(endpoint: string, options: CustomRequestInit = {}): Promise<T> {
    let token = null;
    try {
        token = await getValidAccessToken();
    } catch (err: any) {
        console.error('[API AUTH] SESSION ERROR', err);
        throw new Error('Não foi possível validar sua sessão. Atualize a página e tente novamente.');
    }

    const isFormData = options.body instanceof FormData;

    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    } as any;

    const { timeout, ...fetchOptions } = options;

    let controller: AbortController | undefined;
    let timerId: NodeJS.Timeout | undefined;

    if (timeout) {
        controller = new AbortController();
        if (fetchOptions.signal) {
            // Se já tiver um signal, a gente poderia fazer um abort signal composto,
            // mas para simplificar, substituimos (a rota de upload de banner não passa timeout)
        }
        fetchOptions.signal = controller.signal;
        timerId = setTimeout(() => {
            controller!.abort();
        }, timeout);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...fetchOptions,
            headers,
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('A2Tickets_user');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || errorData.message || 'Erro na requisição ao servidor';
            console.error(`❌ API Error [${options.method || 'GET'}] ${endpoint}:`, errorMessage);
            throw new Error(errorMessage);
        }
        const data = await response.json();
        return data;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            const timeoutErr = new Error('TimeoutError');
            timeoutErr.name = 'TimeoutError';
            throw timeoutErr;
        }
        throw err;
    } finally {
        if (timerId) {
            clearTimeout(timerId);
        }
    }
}

export const api = {
    get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
    post: <T>(endpoint: string, body: any, options: CustomRequestInit = {}) =>
        request<T>(endpoint, {
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body),
            ...options
        }),
    put: <T>(endpoint: string, body: any, options: CustomRequestInit = {}) =>
        request<T>(endpoint, {
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body),
            ...options
        }),
    patch: <T>(endpoint: string, body: any, options: CustomRequestInit = {}) =>
        request<T>(endpoint, {
            method: 'PATCH',
            body: body instanceof FormData ? body : JSON.stringify(body),
            ...options
        }),
    delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export default api;
