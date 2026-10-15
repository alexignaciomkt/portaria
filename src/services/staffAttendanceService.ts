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

export interface StaffValidationResponse {
    success: boolean;
    type?: 'STAFF' | 'EMPLOYEE';
    credentialId?: string;
    person?: StaffPerson;
    shifts?: StaffShiftItem[];
    suggestedShiftId?: string | null;
    state: 'AWAITING_CHECKIN' | 'IN_SERVICE' | 'CHECKED_OUT' | 'SHIFT_NOT_STARTED' | 'SHIFT_EXPIRED' | 'INVALID_CREDENTIAL' | 'WRONG_EVENT' | 'UNAUTHORIZED_OPERATOR';
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
                return {
                    ...data,
                    success: false,
                    state: data.state || 'INVALID_CREDENTIAL',
                    stateLabel: data.stateLabel || 'Não Autorizado',
                    canCheckIn: false,
                    canCheckOut: false,
                    error: data.error || 'Erro ao validar credencial',
                    message: data.message || data.error || 'Credencial não autorizada',
                    person: data.person || undefined,
                    shifts: data.shifts || undefined
                };
            }

            return data;
        } catch (err: any) {
            const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite');
            return {
                success: false,
                state: 'INVALID_CREDENTIAL',
                stateLabel: isTimeout ? 'Tempo Esgotado' : 'Erro de Conexão',
                canCheckIn: false,
                canCheckOut: false,
                error: isTimeout ? 'TIMEOUT_EXCEEDED' : 'NETWORK_ERROR',
                message: isTimeout 
                    ? 'Tempo limite de conexão esgotado (10s). O servidor não respondeu a tempo.'
                    : (err.message || 'Erro ao consultar credencial de equipe.')
            };
        }
    },

    /**
     * Confirma a entrada (presença física) de um profissional.
     * Suporta autorização antecipada explícita solicitada pelo produtor proprietário.
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
     * Registra a saída do profissional (checkout), revogando seu acesso operacional à Portaria
     */
    checkoutAttendance: async (params: {
        credentialId: string;
        eventId: string;
        eventStaffId?: string;
        employeeId?: string;
        shiftId?: string;
    }, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<{ success: boolean; message: string; checkedOutAt?: string; shiftId?: string; correlationId?: string }> => {
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
