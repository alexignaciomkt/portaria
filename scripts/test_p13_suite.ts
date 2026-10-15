import { parseUniversalQrCode, isAllowedDomain } from '../src/utils/qrCodeParser';
import { computeSemaphorDecision } from '../src/utils/semaphorUtils';
import { StaffValidationResponse } from '../src/services/staffAttendanceService';

console.log('========================================================================');
console.log('🛡️ A2PORTARIA — BATERIA DE TESTES P1.3: PARSER UNIVERSAL & SEMÁFORO');
console.log('========================================================================\n');

let passed = 0;
let total = 0;

function assert(code: string, desc: string, cond: boolean, extra?: any) {
    total++;
    if (cond) {
        passed++;
        console.log(`  ✅ [PASS] ${code} — ${desc}`);
    } else {
        console.error(`  ❌ [FAIL] ${code} — ${desc}`, extra || '');
    }
}

// ============================================================================
// GRUPO 1: VALIDAÇÃO DE DOMÍNIOS PERMITIDOS
// ============================================================================
assert('TC_DOM_01', 'portaria.a2tickets360.com.br é permitido', isAllowedDomain('portaria.a2tickets360.com.br'));
assert('TC_DOM_02', 'api.a2tickets360.com.br é permitido', isAllowedDomain('api.a2tickets360.com.br'));
assert('TC_DOM_03', 'www.a2tickets360.com.br é permitido', isAllowedDomain('www.a2tickets360.com.br'));
assert('TC_DOM_04', 'sports.a2tickets360.com.br é permitido', isAllowedDomain('sports.a2tickets360.com.br'));
assert('TC_DOM_05', 'portaria-three-omega.vercel.app é permitido', isAllowedDomain('portaria-three-omega.vercel.app'));
assert('TC_DOM_06', 'localhost é permitido', isAllowedDomain('localhost'));
assert('TC_DOM_07', '127.0.0.1 é permitido', isAllowedDomain('127.0.0.1'));
assert('TC_DOM_08', 'google.com NÃO é permitido', !isAllowedDomain('google.com'));
assert('TC_DOM_09', 'malicious-domain.com NÃO é permitido', !isAllowedDomain('malicious-domain.com'));

// ============================================================================
// GRUPO 2: PARSE DE CREDENCIAL DIRETA (CRED-)
// ============================================================================
const r1 = parseUniversalQrCode('CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_CRED_01', 'CRED- canônico válido é classificado como STAFF_CREDENTIAL', r1.type === 'STAFF_CREDENTIAL');
assert('TC_CRED_02', 'Token canônico preservado integralmente', r1.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

const r2 = parseUniversalQrCode('  CRED-a55cc1be3bad4b03a8ef4a2de7d0126b \r\n');
assert('TC_CRED_03', 'CRED- com espaços e CRLF é higienizado com sucesso', r2.type === 'STAFF_CREDENTIAL' && r2.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

const r3 = parseUniversalQrCode('"CRED-a55cc1be3bad4b03a8ef4a2de7d0126b"');
assert('TC_CRED_04', 'CRED- envolto em aspas é higienizado com sucesso', r3.type === 'STAFF_CREDENTIAL' && r3.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

const r4 = parseUniversalQrCode('cred-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_CRED_05', 'cred- em minúsculas é normalizado para maiúsculo CRED-', r4.type === 'STAFF_CREDENTIAL' && r4.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

// ============================================================================
// GRUPO 3: PARSE DE INGRESSO DIRETO (TKT_)
// ============================================================================
const t1 = parseUniversalQrCode('TKT_99341235abc8');
assert('TC_TKT_01', 'TKT_ canônico válido é classificado como TICKET', t1.type === 'TICKET');
assert('TC_TKT_02', 'Token TKT_ preservado', t1.canonicalCode === 'TKT_99341235abc8');

const t2 = parseUniversalQrCode('tkt_99341235abc8\n');
assert('TC_TKT_03', 'tkt_ em minúsculas é normalizado para TKT_', t2.type === 'TICKET' && t2.canonicalCode === 'TKT_99341235abc8');

// ============================================================================
// GRUPO 4: QR CODE CONTENDO URL LEGÍTIMA A2
// ============================================================================
const u1 = parseUniversalQrCode('https://portaria.a2tickets360.com.br/credentials/CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_URL_01', 'URL com credencial no path é extraída com sucesso', u1.type === 'STAFF_CREDENTIAL' && u1.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_URL_02', 'Flag isUrl e extractedFromUrl marcadas como true', u1.isUrl === true && u1.extractedFromUrl === true);

const u2 = parseUniversalQrCode('https://portaria.a2tickets360.com.br/?code=CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_URL_03', 'URL com credencial em query param code é extraída com sucesso', u2.type === 'STAFF_CREDENTIAL' && u2.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

const u3 = parseUniversalQrCode('https://www.a2tickets360.com.br/ingressos/TKT_ABCD1234EFGH');
assert('TC_URL_04', 'URL com ingresso TKT_ é extraída com sucesso', u3.type === 'TICKET' && u3.canonicalCode === 'TKT_ABCD1234EFGH');

const u4 = parseUniversalQrCode('https://portaria-three-omega.vercel.app/valida/CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_URL_05', 'URL sob vercel.app homologada é permitida e extrai token', u4.type === 'STAFF_CREDENTIAL' && u4.canonicalCode === 'CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');

// ============================================================================
// GRUPO 5: REJEIÇÃO DE FORMATOS ILEGÍTIMOS E URLS NÃO AUTORIZADAS
// ============================================================================
const e1 = parseUniversalQrCode('https://arbitrary-attacker.com/credentials/CRED-a55cc1be3bad4b03a8ef4a2de7d0126b');
assert('TC_REJ_01', 'URL de domínio não autorizado é REJEITADA mesmo contendo CRED-', e1.type === 'INVALID');

const e2 = parseUniversalQrCode('https://portaria.a2tickets360.com.br/home');
assert('TC_REJ_02', 'URL legítima sem token canônico é rejeitada como INVALID', e2.type === 'INVALID');

const e3 = parseUniversalQrCode('1234567890');
assert('TC_REJ_03', 'Código numérico arbitrário é rejeitado como INVALID', e3.type === 'INVALID');

const e4 = parseUniversalQrCode('b82ed98d-168d-4f61-a15c-14c233e2cc84');
assert('TC_REJ_04', 'UUID sem prefixo canônico é rejeitado como INVALID', e4.type === 'INVALID');

// ============================================================================
// GRUPO 6: RESPOSTAS DO SEMÁFORO (VALIDAÇÃO DE TURNOS E ERROS)
// ============================================================================

// 6.1 Credencial válida com múltiplos turnos aguardando confirmação -> AMARELO
const validStaffWithShifts: StaffValidationResponse = {
    success: true,
    credentialId: 'cred-123',
    state: 'AWAITING_CHECKIN',
    stateLabel: 'Aguardando Confirmação',
    canCheckIn: true,
    canCheckOut: false,
    person: {
        eventStaffId: 'staff-1',
        name: 'Ricardo Almeida Ferreira',
        functionName: 'Controlador de Acesso',
        avatarUrl: 'https://osfnqpehvhznrecljjjf.supabase.co/storage/v1/object/public/profile-avatars/ricardo.jpg',
        shiftDisplay: '15/10/2026 14:00 – 22:00'
    },
    shifts: [
        {
            shiftId: 'shift-1',
            shiftDate: '2026-10-15',
            startTime: '14:00:00',
            endTime: '22:00:00',
            timezone: 'America/Sao_Paulo',
            status: 'CONFIRMED',
            operationalState: 'AWAITING_CHECKIN',
            attendanceState: 'NONE',
            category: 'HOJE — ENTRADA ANTECIPADA',
            requiresAuthorization: false,
            canRequestCheckin: true,
            canRequestCheckout: false,
            isSuggested: true,
            startUtc: null,
            endUtc: null,
            displayTime: '14:00 – 22:00',
            displayDate: '15/10/2026'
        },
        {
            shiftId: 'shift-2',
            shiftDate: '2026-11-21',
            startTime: '08:00:00',
            endTime: '18:00:00',
            timezone: 'America/Sao_Paulo',
            status: 'CONFIRMED',
            operationalState: 'SHIFT_NOT_STARTED',
            attendanceState: 'NONE',
            category: 'TURNO FUTURO',
            requiresAuthorization: true,
            canRequestCheckin: false,
            canRequestCheckout: false,
            isSuggested: false,
            startUtc: null,
            endUtc: null,
            displayTime: '08:00 – 18:00',
            displayDate: '21/11/2026'
        }
    ]
};

const sem1 = computeSemaphorDecision({ staffResult: validStaffWithShifts, photoStatus: 'loaded' });
assert('TC_SEM_01', 'Credencial válida aguardando checkin com foto carregada gera semáforo AMARELO', sem1.level === 'yellow');
assert('TC_SEM_02', 'Ação operacional sugerida é CONFIRM_CHECKIN', sem1.actionType === 'CONFIRM_CHECKIN');

// 6.2 Credencial identificada SEM turnos confirmados -> VERMELHO informativo
const staffWithoutShifts: StaffValidationResponse = {
    success: true,
    credentialId: 'cred-no-shifts',
    state: 'NO_CONFIRMED_SHIFTS',
    stateLabel: 'Sem Escala',
    canCheckIn: false,
    canCheckOut: false,
    person: {
        eventStaffId: 'staff-2',
        name: 'Carlos Alberto',
        functionName: 'Apoio Operacional',
        avatarUrl: 'https://osfnqpehvhznrecljjjf.supabase.co/storage/v1/object/public/profile-avatars/carlos.jpg'
    },
    shifts: []
};
const sem2 = computeSemaphorDecision({ staffResult: staffWithoutShifts, photoStatus: 'loaded' });
assert('TC_SEM_03', 'Staff sem escalas confirmadas gera semáforo VERMELHO com título SEM ESCALA CONFIRMADA', 
    sem2.level === 'red' && sem2.title === 'SEM ESCALA CONFIRMADA'
);
assert('TC_SEM_04', 'Badge é SEM TURNO VINCULADO', sem2.badgeLabel === 'SEM TURNO VINCULADO');

// 6.3 Credencial Inexistente (404) -> VERMELHO
const credNotFound: StaffValidationResponse = {
    success: false,
    state: 'CREDENTIAL_NOT_FOUND',
    stateLabel: 'Não Localizado',
    canCheckIn: false,
    canCheckOut: false,
    error: 'CREDENCIAL NÃO ENCONTRADA',
    message: 'Esta credencial não foi localizada na base de dados deste evento.'
};
const sem3 = computeSemaphorDecision({ staffResult: credNotFound, photoStatus: 'missing' });
assert('TC_SEM_05', 'Credencial inexistente (404) gera semáforo VERMELHO com título CREDENCIAL NÃO ENCONTRADA', 
    sem3.level === 'red' && sem3.title === 'CREDENCIAL NÃO ENCONTRADA'
);

// 6.4 Falha de Permissão / Operador não autorizado (403) -> VERMELHO
const forbiddenOperator: StaffValidationResponse = {
    success: false,
    state: 'UNAUTHORIZED_OPERATOR',
    stateLabel: 'Não Autorizado',
    canCheckIn: false,
    canCheckOut: false,
    error: 'UNAUTHORIZED_OPERATOR',
    message: 'Você não possui permissão para autorizar ou registrar esta presença.'
};
const sem4 = computeSemaphorDecision({ staffResult: forbiddenOperator, photoStatus: 'missing' });
assert('TC_SEM_06', 'Operador sem permissão (403) gera semáforo VERMELHO com título ACESSO BLOQUEADO', 
    sem4.level === 'red' && sem4.badgeLabel === 'ACESSO NÃO AUTORIZADO'
);

// 6.5 Falha de Rede ou Timeout -> NEUTRO (INDETERMINADO)
const networkError: StaffValidationResponse = {
    success: false,
    state: 'NETWORK_ERROR',
    stateLabel: 'Erro de Conexão',
    canCheckIn: false,
    canCheckOut: false,
    error: 'NETWORK_ERROR',
    message: 'Tempo limite de conexão esgotado (10s).'
};
const sem5 = computeSemaphorDecision({ staffResult: networkError, photoStatus: 'error' });
assert('TC_SEM_07', 'Falha de rede/timeout gera semáforo NEUTRO (INDETERMINADO)', 
    sem5.level === 'neutral' && sem5.badgeLabel === 'INDETERMINADO'
);

// ============================================================================
// GRUPO 7: DIAGNÓSTICO SEGURO E MASCARAMENTO DE TOKENS (P1.5)
// ============================================================================
import { maskToken, getSafeQrDiagnosis } from '../src/utils/qrCodeParser';
import { staffAttendanceService } from '../src/services/staffAttendanceService';

assert('TC_DIAG_01', 'maskToken mascara tokens longos mantendo apenas prefixo e sufixo', 
    maskToken('CRED-a55cc1be3bad4b03a8ef4a2de7d0126b') === 'CRED-a55...126b'
);
assert('TC_DIAG_02', 'maskToken mascara tokens curtos com asteriscos', 
    maskToken('TKT_123456') === 'TKT_***'
);
assert('TC_DIAG_03', 'maskToken lida com string vazia de forma segura', 
    maskToken('') === ''
);

const diag1 = getSafeQrDiagnosis(r1);
assert('TC_DIAG_04', 'Diagnóstico seguro classifica formato CANONICAL_TOKEN', 
    diag1.sourceFormat === 'CANONICAL_TOKEN' && diag1.isValidFormat === true
);
assert('TC_DIAG_05', 'Diagnóstico seguro NUNCA expõe o token completo no maskedToken', 
    !diag1.maskedToken?.includes('3bad4b03a8ef4a2de7d0')
);

// Teste de rejeição de vercel.app genérico não autorizado
assert('TC_DOM_10', 'Domínio arbitrário no vercel.app NÃO é permitido', 
    !isAllowedDomain('random-user.vercel.app')
);
assert('TC_DOM_11', 'Domínio da portaria no vercel.app É permitido', 
    isAllowedDomain('portaria-three-omega.vercel.app')
);

// ============================================================================
// GRUPO 8: BLOQUEIO ESTRITO DE ESCRITA EM HOMOLOGAÇÃO (P1.5)
// ============================================================================
let confirmBlocked = false;
let confirmErrorMessage = '';
try {
    await staffAttendanceService.confirmAttendance({
        credentialId: 'CRED-test',
        eventId: 'event-test'
    });
} catch (err: any) {
    confirmBlocked = true;
    confirmErrorMessage = err.message || '';
}

assert('TC_WRT_01', 'Tentativa de check-in em homologação é ESTRITAMENTE BLOQUEADA (sem simulação de sucesso)', 
    confirmBlocked === true
);
assert('TC_WRT_02', 'Mensagem de erro é MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO', 
    confirmErrorMessage.includes('MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO')
);

let checkoutBlocked = false;
let checkoutErrorMessage = '';
try {
    await staffAttendanceService.checkoutAttendance({
        credentialId: 'CRED-test',
        eventId: 'event-test'
    });
} catch (err: any) {
    checkoutBlocked = true;
    checkoutErrorMessage = err.message || '';
}

assert('TC_WRT_03', 'Tentativa de checkout em homologação é ESTRITAMENTE BLOQUEADA', 
    checkoutBlocked === true
);
assert('TC_WRT_04', 'Mensagem de checkout é MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO', 
    checkoutErrorMessage.includes('MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO')
);

console.log('\n========================================================================');
console.log(`TOTAL DE TESTES P1.5: ${total} | APROVADOS: ${passed} | FALHAS: ${total - passed}`);
console.log('========================================================================\n');

if (passed === total) {
    process.exit(0);
} else {
    process.exit(1);
}
