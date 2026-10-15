/**
 * MOTOR DE DECISÃO DO SEMÁFORO OPERACIONAL INTELIGENTE (P0.2)
 *
 * Mapeamento estrito e determinístico entre a resposta real do backend
 * e a representação visual/sonora de segurança da Portaria.
 *
 * REGRA CENTRAL: QR CODE RECONHECIDO !== ACESSO AUTORIZADO
 */

import { CheckinValidationResponse } from '@/services/ticketCheckinService';
import { StaffValidationResponse } from '@/services/staffAttendanceService';
import { SemaphorTone } from '@/utils/audioFeedback';
import { format } from 'date-fns';

export type SemaphorLevel = 'green' | 'yellow' | 'red' | 'neutral';

export interface SemaphorDecision {
    level: SemaphorLevel;
    title: string;
    subtitle: string;
    badgeLabel: string;
    sound: SemaphorTone;
    theme: {
        bannerBg: string;
        bannerBorder: string;
        bannerText: string;
        badgeBg: string;
        badgeText: string;
        borderColor: string;
        iconBg: string;
        photoRing: string;
        actionButtonClass: string;
    };
    actionType: 'NEW_SCAN' | 'CONFIRM_CHECKIN' | 'AUTHORIZE_EARLY' | 'RETRY_OR_CANCEL';
    isStaff?: boolean;
    isTicket?: boolean;
}

export function computeSemaphorDecision(params: {
    result?: CheckinValidationResponse | null;
    staffResult?: StaffValidationResponse | null;
    scanError?: { title: string; message: string; isTimeout?: boolean } | null;
    photoStatus?: 'loading' | 'loaded' | 'error' | 'missing';
}): SemaphorDecision {
    const { result, staffResult, scanError, photoStatus = 'loaded' } = params;

    // 1. ESTADO NEUTRO — FALHA TÉCNICA / TIMEOUT / INDETERMINADO
    if (scanError) {
        return {
            level: 'neutral',
            title: 'NÃO FOI POSSÍVEL VERIFICAR',
            subtitle: scanError.isTimeout
                ? 'Tempo limite de rede excedido (10s). O resultado é INDETERMINADO e nenhuma entrada foi registrada.'
                : scanError.message || 'Falha na comunicação com o servidor. Nenhuma entrada foi registrada.',
            badgeLabel: scanError.isTimeout ? 'TEMPO ESGOTADO' : 'INDETERMINADO',
            sound: 'neutral',
            theme: {
                bannerBg: 'bg-zinc-900/90 border-zinc-700/80',
                bannerBorder: 'border-zinc-700',
                bannerText: 'text-zinc-200',
                badgeBg: 'bg-zinc-700',
                badgeText: 'text-zinc-100 font-bold',
                borderColor: 'border-zinc-700',
                iconBg: 'bg-zinc-800 text-zinc-300',
                photoRing: 'ring-zinc-600 border-zinc-700',
                actionButtonClass: 'bg-zinc-700 hover:bg-zinc-600 text-white'
            },
            actionType: 'RETRY_OR_CANCEL',
            isTicket: false,
            isStaff: false
        };
    }

    // 2. FLUXO TKT_ — INGRESSO DE PÚBLICO
    if (result) {
        if (result.code === 'VALID') {
            // Em MODO HOMOLOGAÇÃO (SCAN_ONLY), o semáforo NUNCA pode ser verde ("ACESSO AUTORIZADO")
            // pois nenhuma entrada foi registrada/consumida no banco de dados.
            const isSimulation = result.isHomologation || result.message?.includes('HOMOLOGAÇÃO');

            if (isSimulation) {
                return {
                    level: 'yellow',
                    title: 'SIMULAÇÃO — VALIDAÇÃO SEM ENTRADA',
                    subtitle: result.message || 'Modo Homologação Ativo: Ingresso válido, porém NENHUM check-in ou consumo foi registrado.',
                    badgeLabel: 'SIMULAÇÃO (SCAN-ONLY)',
                    sound: 'yellow',
                    theme: {
                        bannerBg: 'bg-amber-950/80 border-amber-500/60 shadow-amber-950/40',
                        bannerBorder: 'border-amber-500/60',
                        bannerText: 'text-amber-400',
                        badgeBg: 'bg-amber-500',
                        badgeText: 'text-zinc-950 font-black',
                        borderColor: 'border-amber-500/60',
                        iconBg: 'bg-amber-600 text-white',
                        photoRing: 'ring-amber-500/40 border-amber-500',
                        actionButtonClass: 'bg-amber-600 hover:bg-amber-500 text-white'
                    },
                    actionType: 'NEW_SCAN',
                    isTicket: true,
                    isStaff: false
                };
            }

            return {
                level: 'green',
                title: 'ACESSO AUTORIZADO',
                subtitle: result.message || 'Ingresso de público validado e liberado.',
                badgeLabel: 'ACESSO AUTORIZADO',
                sound: 'green',
                theme: {
                    bannerBg: 'bg-emerald-950/80 border-emerald-500/60 shadow-emerald-950/40',
                    bannerBorder: 'border-emerald-500/60',
                    bannerText: 'text-emerald-400',
                    badgeBg: 'bg-emerald-500',
                    badgeText: 'text-zinc-950 font-black',
                    borderColor: 'border-emerald-500/60',
                    iconBg: 'bg-emerald-600 text-white',
                    photoRing: 'ring-emerald-500/40 border-emerald-500',
                    actionButtonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white'
                },
                actionType: 'NEW_SCAN',
                isTicket: true,
                isStaff: false
            };
        }

        // Ingresso já utilizado, cancelado, incorreto ou inválido -> VERMELHO
        let sub = result.message || 'Ingresso não autorizado para este evento.';
        let badge = 'ACESSO BLOQUEADO';
        if (result.code === 'ALREADY_USED') {
            badge = 'INGRESSO JÁ UTILIZADO';
            if (result.validatedAt) {
                try {
                    sub = `Ingresso já utilizado anteriormente às ${format(new Date(result.validatedAt), "HH:mm:ss 'em' dd/MM/yyyy")}.`;
                } catch {
                    sub = 'Ingresso já utilizado anteriormente.';
                }
            } else {
                sub = 'Ingresso já utilizado anteriormente.';
            }
        } else if (result.code === 'WRONG_EVENT') {
            badge = 'OUTRO EVENTO';
            sub = 'Este ingresso pertence a outro evento ou organizador.';
        } else if (result.code === 'CANCELLED' || result.code === 'INACTIVE') {
            badge = 'INGRESSO CANCELADO';
            sub = 'Ingresso inativo ou cancelado no sistema.';
        }

        return {
            level: 'red',
            title: 'ACESSO BLOQUEADO',
            subtitle: sub,
            badgeLabel: badge,
            sound: 'red',
            theme: {
                bannerBg: 'bg-destructive/15 border-destructive/50 shadow-destructive/20',
                bannerBorder: 'border-destructive/60',
                bannerText: 'text-destructive',
                badgeBg: 'bg-destructive',
                badgeText: 'text-white font-black',
                borderColor: 'border-destructive/60',
                iconBg: 'bg-destructive text-white',
                photoRing: 'ring-destructive/40 border-destructive',
                actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
            },
            actionType: 'NEW_SCAN',
            isTicket: true,
            isStaff: false
        };
    }

    // 3. FLUXO CRED- — CREDENCIAL PROFISSIONAL STAFF
    if (staffResult) {
        // A. Operador não autorizado / Sem permissão (FORBIDDEN) -> VERMELHO
        if (
            staffResult.state === 'UNAUTHORIZED_OPERATOR' || 
            (staffResult.state as string) === 'FORBIDDEN' || 
            staffResult.error === 'FORBIDDEN' ||
            staffResult.error?.includes('unauthorized') ||
            staffResult.error?.includes('permissão')
        ) {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: staffResult.message || 'Você não possui permissão para autorizar ou registrar esta presença.',
                badgeLabel: 'ACESSO NÃO AUTORIZADO',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // B. Evento incorreto -> VERMELHO
        if (staffResult.state === 'WRONG_EVENT') {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: 'Esta credencial pertence a outro evento ou organizador.',
                badgeLabel: 'OUTRO EVENTO',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // C. Escala em data futura -> VERMELHO
        if (staffResult.isFutureDate || staffResult.error === 'EARLY_CHECKIN_OUTSIDE_SHIFT_DATE') {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: 'Este profissional possui escala em uma data futura. A entrada antecipada somente pode ser autorizada no dia da escala.',
                badgeLabel: 'ESCALA EM DATA FUTURA',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // D. Turno encerrado / checkout anterior -> VERMELHO
        if (staffResult.state === 'CHECKED_OUT') {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: staffResult.checkedOutAt 
                    ? `Expediente encerrado com saída registrada às ${format(new Date(staffResult.checkedOutAt), "HH:mm:ss")}.`
                    : 'Expediente encerrado. Saída já registrada.',
                badgeLabel: 'EXPEDIENTE ENCERRADO',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // E. Turno expirado -> VERMELHO
        if (staffResult.state === 'SHIFT_EXPIRED') {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: 'O horário do turno foi ultrapassado considerando o fuso horário oficial do evento.',
                badgeLabel: 'TURNO EXPIRADO',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // F. Fotografia obrigatória ausente ou com falha de carregamento -> VERMELHO
        const isPhotoInvalid = staffResult.hasValidPhoto === false || 
                               photoStatus === 'missing' || 
                               photoStatus === 'error' || 
                               (!staffResult.person?.avatarUrl && staffResult.hasValidPhoto !== true);

        if (isPhotoInvalid) {
            return {
                level: 'red',
                title: 'ACESSO BLOQUEADO',
                subtitle: 'Fotografia indisponível — Identidade não verificada. A política de segurança exige conferência de foto válida do titular.',
                badgeLabel: 'FOTOGRAFIA OBRIGATÓRIA',
                sound: 'red',
                theme: {
                    bannerBg: 'bg-destructive/15 border-destructive/50',
                    bannerBorder: 'border-destructive/60',
                    bannerText: 'text-destructive',
                    badgeBg: 'bg-destructive',
                    badgeText: 'text-white font-black',
                    borderColor: 'border-destructive/60',
                    iconBg: 'bg-destructive text-white',
                    photoRing: 'ring-destructive/40 border-destructive',
                    actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // G. Profissional com presença ativa confirmada -> VERDE
        if (staffResult.state === 'IN_SERVICE') {
            return {
                level: 'green',
                title: 'ACESSO AUTORIZADO',
                subtitle: staffResult.checkedInAt 
                    ? `Presença ativa confirmada às ${format(new Date(staffResult.checkedInAt), "HH:mm:ss")}. Profissional em serviço.`
                    : 'Profissional em serviço com presença confirmada.',
                badgeLabel: 'PROFISSIONAL EM SERVIÇO',
                sound: 'green',
                theme: {
                    bannerBg: 'bg-emerald-950/80 border-emerald-500/60 shadow-emerald-950/40',
                    bannerBorder: 'border-emerald-500/60',
                    bannerText: 'text-emerald-400',
                    badgeBg: 'bg-emerald-500',
                    badgeText: 'text-zinc-950 font-black',
                    borderColor: 'border-emerald-500/60',
                    iconBg: 'bg-emerald-600 text-white',
                    photoRing: 'ring-emerald-500/40 border-emerald-500',
                    actionButtonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white'
                },
                actionType: 'NEW_SCAN',
                isStaff: true,
                isTicket: false
            };
        }

        // H. Entrada Antecipada no mesmo dia -> AMARELO (Requer autorização do produtor)
        if (staffResult.isEarly && !staffResult.isFutureDate) {
            return {
                level: 'yellow',
                title: 'AGUARDANDO CONFIRMAÇÃO',
                subtitle: `Escala prevista para ${staffResult.person?.shiftDisplay?.split('–')[0] || 'mais tarde'}. Entrada antecipada elegível para autorização expressa pelo produtor.`,
                badgeLabel: 'LIBERAÇÃO ANTECIPADA',
                sound: 'yellow',
                theme: {
                    bannerBg: 'bg-amber-950/80 border-amber-500/60 shadow-amber-950/40',
                    bannerBorder: 'border-amber-500/60',
                    bannerText: 'text-amber-400',
                    badgeBg: 'bg-amber-500',
                    badgeText: 'text-zinc-950 font-black',
                    borderColor: 'border-amber-500/60',
                    iconBg: 'bg-amber-600 text-white',
                    photoRing: 'ring-amber-500/40 border-amber-500',
                    actionButtonClass: 'bg-amber-600 hover:bg-amber-500 text-white font-bold'
                },
                actionType: 'AUTHORIZE_EARLY',
                isStaff: true,
                isTicket: false
            };
        }

        // I. Escala normal de hoje aguardando confirmação -> AMARELO
        if (staffResult.state === 'AWAITING_CHECKIN') {
            return {
                level: 'yellow',
                title: 'AGUARDANDO CONFIRMAÇÃO',
                subtitle: 'Credencial identificada e escala vigente. Realize a conferência visual da foto e confirme a entrada.',
                badgeLabel: 'AGUARDANDO CONFIRMAÇÃO',
                sound: 'yellow',
                theme: {
                    bannerBg: 'bg-amber-950/80 border-amber-500/60 shadow-amber-950/40',
                    bannerBorder: 'border-amber-500/60',
                    bannerText: 'text-amber-400',
                    badgeBg: 'bg-amber-500',
                    badgeText: 'text-zinc-950 font-black',
                    borderColor: 'border-amber-500/60',
                    iconBg: 'bg-amber-600 text-white',
                    photoRing: 'ring-amber-500/40 border-amber-500',
                    actionButtonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
                },
                actionType: 'CONFIRM_CHECKIN',
                isStaff: true,
                isTicket: false
            };
        }

        // J. Outros estados inválidos de credencial -> VERMELHO
        return {
            level: 'red',
            title: 'ACESSO BLOQUEADO',
            subtitle: staffResult.message || 'Credencial não autorizada para entrada.',
            badgeLabel: 'CREDENCIAL BLOQUEADA',
            sound: 'red',
            theme: {
                bannerBg: 'bg-destructive/15 border-destructive/50',
                bannerBorder: 'border-destructive/60',
                bannerText: 'text-destructive',
                badgeBg: 'bg-destructive',
                badgeText: 'text-white font-black',
                borderColor: 'border-destructive/60',
                iconBg: 'bg-destructive text-white',
                photoRing: 'ring-destructive/40 border-destructive',
                actionButtonClass: 'bg-zinc-800 hover:bg-zinc-700 text-white'
            },
            actionType: 'NEW_SCAN',
            isStaff: true,
            isTicket: false
        };
    }

    // Estado padrão de segurança (Fail-Closed)
    return {
        level: 'neutral',
        title: 'NÃO FOI POSSÍVEL VERIFICAR',
        subtitle: 'Aguardando leitura de QR Code...',
        badgeLabel: 'AGUARDANDO',
        sound: 'neutral',
        theme: {
            bannerBg: 'bg-zinc-900/90 border-zinc-700/80',
            bannerBorder: 'border-zinc-700',
            bannerText: 'text-zinc-200',
            badgeBg: 'bg-zinc-700',
            badgeText: 'text-zinc-100 font-bold',
            borderColor: 'border-zinc-700',
            iconBg: 'bg-zinc-800 text-zinc-300',
            photoRing: 'ring-zinc-600 border-zinc-700',
            actionButtonClass: 'bg-zinc-700 hover:bg-zinc-600 text-white'
        },
        actionType: 'RETRY_OR_CANCEL',
        isStaff: false,
        isTicket: false
    };
}
