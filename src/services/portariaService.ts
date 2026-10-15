import { API_BASE_URL, authenticatedFetch } from '@/services/api';

export interface PortariaOperation {
    id: string;
    title: string;
    slug: string;
    date?: string;
    bannerUrl?: string;
    canScan?: boolean;
    canManageStaff?: boolean;
}

export const portariaService = {
    getCurrentOperations: async (_token?: string): Promise<PortariaOperation[]> => {
        console.log('[PORTARIA SERVICE] BEFORE REQUEST', API_BASE_URL);
        try {
            const response = await authenticatedFetch(`${API_BASE_URL}/api/portaria/current-operation`, {
                method: 'GET'
            });
            console.log('[PORTARIA SERVICE] AFTER REQUEST', { status: response.status });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Erro ao carregar operações da portaria');
            }

            const data = await response.json();
            return data.operations || [];
        } catch (error: any) {
            console.error('[PORTARIA SERVICE] ERROR', error.message || error);
            throw error;
        }
    },

    sendRecoveryForStaff: async (eventStaffId: string, _token?: string): Promise<void> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/staff/${eventStaffId}/send-access-recovery`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Erro ao enviar recuperação');
        }
    }
};
