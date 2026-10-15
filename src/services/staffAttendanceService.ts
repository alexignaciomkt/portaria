import { API_BASE_URL, authenticatedFetch } from '@/services/api';

export interface StaffPerson {
    eventStaffId: string;
    employeeId?: string | null;
    userId?: string;
    name: string;
    avatarUrl?: string | null;
    functionName: string;
    shiftStart?: string | null;
    shiftEnd?: string | null;
    shiftDisplay?: string | null;
    timezone?: string | null;
}

export interface StaffShiftItem {
    shiftId: string;
    shiftDate: string; // YYYY-MM-DD
    startTime: string; // HH:mm:ss
    endTime: string;   // HH:mm:ss
    timezone: string;
    role?: string;
    roleName?: string;
    status: string;
    operationalState: 'AWAITING_CHECKIN' | 'IN_SERVICE' | 'CHECKED_OUT' | 'SHIFT_NOT_STARTED' | 'SHIFT_EXPIRED';
    attendanceState: 'NONE' | 'ACTIVE' | 'COMPLETED';
    category: 'EM ANDAMENTO' | 'HOJE — ENTRADA ANTECIPADA' | 'HOJE — A INICIAR' | 'HOJE — ENCERRADO' | 'TURNO FUTURO' | 'TURNO SEM ELEGIBILIDADE' | 'PRESENÇA ATIVA' | 'SAÍDA REGISTRADA';
    requiresAuthorization: boolean;
    canRequestCheckin: boolean;
    canRequestCheckout: boolean;
    reasonCode?: string;
    isSuggested: boolean;
    startUtc: string | null;
    endUtc: string | null;
    displayTime: string;
    displayDate: string;
    earlyMinutes?: number;
    checkedInAt?: string;
    checkedOutAt?: string;
}

export type StaffCredentialState =
    | 'AWAITING_CHECKIN'
    | 'IN_SERVICE'
    | 'CHECKED_OUT'
    | 'SHIFT_NOT_STARTED'
    | 'SHIFT_EXPIRED'
    | 'INVALID_CREDENTIAL'
    | 'WRONG_EVENT'
    | 'UNAUTHORIZED_OPERATOR'
    | 'NO_CONFIRMED_SHIFTS'
    | 'CREDENTIAL_NOT_FOUND'
    | 'API_ERROR'
    | 'NETWORK_ERROR'
    | 'TIMEOUT_EXCEEDED';

export interface StaffValidationResponse {
    success: boolean;
    type?: 'STAFF' | 'EMPLOYEE';
    credentialId?: string;
    person?: StaffPerson;
    shifts?: StaffShiftItem[];
    suggestedShiftId?: string | null;
    state: StaffCredentialState;
    stateLabel: string;
    canCheckIn: boolean;
    canCheckOut: boolean;
    isEarly?: boolean;
    earlyMinutes?: number;
    requiresEarlyAuthorization?: boolean;
    earlyLabel?: string;
    checkedInAt?: string;
    checkedOutAt?: string;
    delayMinutes?: number;
    hasValidPhoto?: boolean;
    isFutureDate?: boolean;
    error?: string;
    message?: string;
}

export interface OperationalStatusResponse {
    canOperateTickets: boolean;
    canManageStaff: boolean;
    role: 'MASTER' | 'OWNER' | 'SUPERVISOR' | 'STAFF' | 'NONE';
    presenceStatus: 'NONE' | 'AWAITING_CHECKIN' | 'IN_SERVICE' | 'CHECKED_OUT' | 'EXPIRED';
    reason?: string;
    person?: {
        name: string;
        functionName?: string;
        shiftStart?: string | null;
        shiftEnd?: string | null;
        checkedInAt?: string | null;
        checkedOutAt?: string | null;
    };
}

export const staffAttendanceService = {
    /**
     * Valida uma credencial profissional (QR Code CRED-...)
     */
    validateCredential: async (
        credentialToken: string, 
        eventId: string,
        options: { timeout?: number; signal?: AbortSignal } = {}
    ): Promise<StaffValidationResponse> => {
        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/credentials/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ credentialToken, eventId }),
                timeout: options.timeout ?? 10000,
                signal: options.signal
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                let state: any = 'INVALID_CREDENTIAL';
                let message = data.message || data.error || 'Credencial não autorizada';

                if (response.status === 404) {
                    state = 'CREDENTIAL_NOT_FOUND';
                    message = 'Esta credencial não foi localizada na base de dados deste evento.';
                } else if (response.status === 403) {
                    state = 'UNAUTHORIZED_OPERATOR';
                    message = data.message || 'Você não possui permissão para autorizar ou registrar presença neste evento.';
                } else if (response.status >= 500) {
                    state = 'API_ERROR';
                    message = 'O serviço de validação retornou um erro interno temporário. Tente novamente em instantes.';
                }

                return {
                    ...data,
                    success: false,
                    state,
                    stateLabel: data.stateLabel || 'Não Autorizado',
                    canCheckIn: false,
                    canCheckOut: false,
                    error: data.error || state,
                    message,
                    person: data.person || undefined,
                    shifts: data.shifts || undefined
                };
            }

            // Se a validação foi bem sucedida mas não possui turnos cadastrados
            if (data.success && (!data.shifts || data.shifts.length === 0)) {
                return {
                    ...data,
                    state: 'NO_CONFIRMED_SHIFTS',
                    stateLabel: 'Sem Escala',
                    canCheckIn: false,
                    canCheckOut: false,
                    message: 'Profissional identificado, porém não possui escalas ou turnos confirmados para este evento.'
                };
            }

            return data;
        } catch (err: any) {
            const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite');
            return {
                success: false,
                state: isTimeout ? 'TIMEOUT_EXCEEDED' : 'NETWORK_ERROR',
                stateLabel: isTimeout ? 'Tempo Esgotado' : 'Erro de Conexão',
                canCheckIn: false,
                canCheckOut: false,
                error: isTimeout ? 'TIMEOUT_EXCEEDED' : 'NETWORK_ERROR',
                message: isTimeout 
                    ? 'Tempo limite de conexão esgotado (10s). O servidor não respondeu a tempo.'
                    : (err.message || 'Erro de rede ao consultar credencial. Verifique sua conexão com a internet.')
            };
        }
    },

    /**
     * Confirma a entrada (presença física) de um profissional.
     * PROTEÇÃO DE PRODUÇÃO: Em ambiente de homologação (P1.x), mutações no banco
     * compartilhado de produção são estritamente interceptadas e simuladas localmente.
     */
    confirmAttendance: async (params: {
        credentialId: string;
        eventId: string;
        eventStaffId?: string;
        employeeId?: string;
        shiftId?: string;
        shiftStart?: string | null;
        earlyAuthorization?: boolean;
        earlyReason?: string;
    }, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<{ success: boolean; message: string; checkedInAt?: string; earlyMinutes?: number; delayMinutes?: number; shiftId?: string; correlationId?: string }> => {
        // Blindagem de Produção: Impede estritamente gravações de homologação no banco de produção
        const isHomologationProtectionActive = import.meta.env.VITE_ENABLE_TRANSACTIONAL_WRITES !== 'true';

        if (isHomologationProtectionActive) {
            console.warn('🛡️ [MODO HOMOLOGAÇÃO] Registro desativado: Tentativa de check-in bloqueada para proteção do banco de produção.');
            const error: any = new Error('MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO');
            error.code = 'HOMOLOGATION_WRITE_BLOCKED';
            error.description = 'Ações que gravam no banco de dados estão desativadas neste ambiente de homologação.';
            throw error;
        }

        const response = await authenticatedFetch(`${API_BASE_URL}/api/credentials/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params),
            timeout: options.timeout ?? 10000,
            signal: options.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Erro ao confirmar presença');
        }

        return data;
    },

    /**
     * Registra o encerramento de turno (checkout) de um profissional.
     * PROTEÇÃO DE PRODUÇÃO: Em homologação (P1.x), mutações são estritamente bloqueadas.
     */
    checkoutAttendance: async (params: {
        credentialId: string;
        eventId: string;
        shiftId?: string;
        eventStaffId?: string;
        employeeId?: string;
    }, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<{ success: boolean; message: string; checkedOutAt?: string }> => {
        const isHomologationProtectionActive = import.meta.env.VITE_ENABLE_TRANSACTIONAL_WRITES !== 'true';

        if (isHomologationProtectionActive) {
            console.warn('🛡️ [MODO HOMOLOGAÇÃO] Registro desativado: Tentativa de checkout bloqueada para proteção do banco de produção.');
            const error: any = new Error('MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO');
            error.code = 'HOMOLOGATION_WRITE_BLOCKED';
            error.description = 'Ações que gravam no banco de dados estão desativadas neste ambiente de homologação.';
            throw error;
        }

        const response = await authenticatedFetch(`${API_BASE_URL}/api/credentials/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params),
            timeout: options.timeout ?? 10000,
            signal: options.signal
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Erro ao registrar saída');
        }

        return data;
    },

    /**
     * Consulta o status operacional do usuário autenticado no evento
     */
    checkOperationalStatus: async (eventId: string, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<OperationalStatusResponse> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/portaria/operational-status?eventId=${encodeURIComponent(eventId)}`, {
            method: 'GET',
            timeout: options.timeout ?? 8000,
            signal: options.signal
        });

        if (!response.ok) {
            throw new Error('Falha ao checar status operacional');
        }

        return await response.json();
    }
};
