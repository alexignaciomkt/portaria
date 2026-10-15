import { API_BASE_URL, authenticatedFetch } from '@/services/api';

export interface CheckinValidationResponse {
    code: 'VALID' | 'ALREADY_USED' | 'INVALID_QR' | 'WRONG_EVENT' | 'PAYMENT_INVALID' | 'CANCELLED' | 'INACTIVE';
    message: string;
    isHomologation?: boolean;
    ticket?: {
        id: string;
        qrCode?: string;
        buyerName: string | null;
        ticketName?: string | null;
        participantPhoto?: string | null;
        ticketId: string;
        isCourtesy: boolean;
    };
    validatedAt?: string;
    operatorId?: string;
}

export const ticketCheckinService = {
    validateTicket: async (
        qrCode: string, 
        eventId: string, 
        options: { timeout?: number; signal?: AbortSignal } = {}
    ): Promise<CheckinValidationResponse> => {
        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/checkin/tickets/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ qrCode, eventId }),
                timeout: options.timeout ?? 10000,
                signal: options.signal
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Erro ao validar ingresso');
            }

            return await response.json();
        } catch (err: any) {
            if (err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite')) {
                throw new Error('Tempo limite esgotado (10s) ao consultar ingresso. Verifique sua conexão e tente novamente.');
            }
            throw err;
        }
    },

    undoCheckin: async (
        qrCode: string, 
        eventId: string, 
        reason: string,
        options: { timeout?: number; signal?: AbortSignal } = {}
    ): Promise<void> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/checkin/tickets/undo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ qrCode, eventId, reason }),
            timeout: options.timeout ?? 10000,
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Erro ao desfazer check-in');
        }
    }
};
