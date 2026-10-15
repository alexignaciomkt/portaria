/**
 * A2Portaria — Parser e Validador Canônico de Códigos QR
 * Responsável por higienizar, validar domínios e extrair tokens canônicos
 * legítimos (CRED- e TKT_) emitidos pelo Ecossistema A2.
 */

export type QrCodeType = 'STAFF_CREDENTIAL' | 'TICKET' | 'INVALID';

export interface ParsedQrResult {
    type: QrCodeType;
    canonicalCode: string;
    rawInput: string;
    isUrl: boolean;
    extractedFromUrl?: boolean;
    domain?: string;
    errorReason?: string;
}

// Domínios legítimos e estritamente autorizados do ecossistema A2
const ALLOWED_DOMAIN_PATTERNS = [
    /^(.*\.)?a2tickets360\.com\.br$/i,
    /^(.*\.)?a2sports360\.com\.br$/i,
    /^(portaria|a2tickets|a2sports)[a-zA-Z0-9_-]*\.vercel\.app$/i,
    /^localhost$/i,
    /^127\.0\.0\.1$/i,
];

/**
 * Mascara com segurança um identificador canônico para auditoria sem expor segredos
 */
export function maskToken(token: string): string {
    if (!token) return '';
    if (token.length <= 10) return `${token.slice(0, 4)}***`;
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export interface SafeQrDiagnosis {
    type: QrCodeType;
    sourceFormat: 'CANONICAL_TOKEN' | 'URL_PATH' | 'URL_QUERY' | 'URL_HASH' | 'UNKNOWN';
    domain?: string;
    maskedToken?: string;
    tokenLength: number;
    isValidFormat: boolean;
}

/**
 * Gera diagnóstico operacional seguro para logs e auditoria
 */
export function getSafeQrDiagnosis(parsed: ParsedQrResult): SafeQrDiagnosis {
    let sourceFormat: SafeQrDiagnosis['sourceFormat'] = 'UNKNOWN';
    if (!parsed.isUrl && parsed.type !== 'INVALID') {
        sourceFormat = 'CANONICAL_TOKEN';
    } else if (parsed.isUrl && parsed.extractedFromUrl) {
        sourceFormat = 'URL_PATH';
    }

    return {
        type: parsed.type,
        sourceFormat,
        domain: parsed.domain,
        maskedToken: parsed.canonicalCode ? maskToken(parsed.canonicalCode) : undefined,
        tokenLength: parsed.canonicalCode ? parsed.canonicalCode.length : 0,
        isValidFormat: parsed.type !== 'INVALID'
    };
}

// Padrões canônicos estritos de identificadores A2
export const CANONICAL_STAFF_REGEX = /^CRED-[a-zA-Z0-9_-]{16,64}$/i;
export const CANONICAL_TICKET_REGEX = /^TKT_[a-zA-Z0-9_-]{6,64}$/i;

/**
 * Verifica se um hostname pertence aos domínios autorizados do ecossistema A2
 */
export function isAllowedDomain(hostname: string): boolean {
    const cleanHost = hostname.toLowerCase().trim();
    return ALLOWED_DOMAIN_PATTERNS.some(pattern => pattern.test(cleanHost));
}

/**
 * Tenta extrair um token canônico (CRED- ou TKT_) de uma string
 */
function matchCanonicalToken(candidate: string): { type: QrCodeType; canonicalCode: string } | null {
    const clean = candidate.trim();

    if (CANONICAL_STAFF_REGEX.test(clean)) {
        // Normaliza o prefixo para maiúsculo "CRED-"
        const normalized = 'CRED-' + clean.slice(5);
        return { type: 'STAFF_CREDENTIAL', canonicalCode: normalized };
    }

    if (CANONICAL_TICKET_REGEX.test(clean)) {
        // Normaliza o prefixo para maiúsculo "TKT_"
        const normalized = 'TKT_' + clean.slice(4);
        return { type: 'TICKET', canonicalCode: normalized };
    }

    return null;
}

/**
 * Decodifica URI components de forma segura sem lançar exceção
 */
function safeDecodeUri(val: string): string {
    try {
        return decodeURIComponent(val);
    } catch {
        return val;
    }
}

/**
 * Analisa e classifica uma leitura universal de QR Code
 * Suporta tokens diretos e URLs canônicas emitidas pelo ecossistema A2.
 */
export function parseUniversalQrCode(rawInput: string): ParsedQrResult {
    if (!rawInput || typeof rawInput !== 'string') {
        return {
            type: 'INVALID',
            canonicalCode: '',
            rawInput: rawInput || '',
            isUrl: false,
            errorReason: 'Entrada vazia ou formato inválido.'
        };
    }

    // 1. Limpeza inicial de whitespace, quebras de linha e aspas acidentais
    let cleaned = rawInput.trim().replace(/^["']|["']$/g, '');
    cleaned = safeDecodeUri(cleaned);

    // 2. Teste Direto: O código já é o token canônico puro?
    const directMatch = matchCanonicalToken(cleaned);
    if (directMatch) {
        return {
            type: directMatch.type,
            canonicalCode: directMatch.canonicalCode,
            rawInput,
            isUrl: false
        };
    }

    // 3. Teste de URL: Verifica se a leitura é uma URL (ex: lida de crachá digital, app de câmera, etc.)
    const isPotentiallyUrl = /^https?:\/\//i.test(cleaned) || /^portaria\./i.test(cleaned);
    if (isPotentiallyUrl) {
        try {
            // Garante protocolo para parse consistente
            const urlString = cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
            const parsedUrl = new URL(urlString);

            // A. Validação de Domínio Autorizado
            if (!isAllowedDomain(parsedUrl.hostname)) {
                return {
                    type: 'INVALID',
                    canonicalCode: '',
                    rawInput,
                    isUrl: true,
                    domain: parsedUrl.hostname,
                    errorReason: `Domínio não autorizado pelo ecossistema A2: ${parsedUrl.hostname}`
                };
            }

            // B. Busca no Pathname (ex: /credentials/CRED-... ou /ticket/TKT_...)
            const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
            for (const segment of pathSegments) {
                const segMatch = matchCanonicalToken(segment);
                if (segMatch) {
                    return {
                        type: segMatch.type,
                        canonicalCode: segMatch.canonicalCode,
                        rawInput,
                        isUrl: true,
                        extractedFromUrl: true,
                        domain: parsedUrl.hostname
                    };
                }
            }

            // C. Busca em Query Parameters (ex: ?code=CRED-... ou ?token=CRED-... ou ?credential=CRED-...)
            for (const [, val] of parsedUrl.searchParams.entries()) {
                const queryMatch = matchCanonicalToken(val);
                if (queryMatch) {
                    return {
                        type: queryMatch.type,
                        canonicalCode: queryMatch.canonicalCode,
                        rawInput,
                        isUrl: true,
                        extractedFromUrl: true,
                        domain: parsedUrl.hostname
                    };
                }
            }

            // D. Busca no Hash Fragment (ex: #CRED-... ou #token=CRED-...)
            if (parsedUrl.hash) {
                const hashContent = parsedUrl.hash.replace(/^#/, '');
                const hashMatch = matchCanonicalToken(hashContent);
                if (hashMatch) {
                    return {
                        type: hashMatch.type,
                        canonicalCode: hashMatch.canonicalCode,
                        rawInput,
                        isUrl: true,
                        extractedFromUrl: true,
                        domain: parsedUrl.hostname
                    };
                }
            }

            // Se for URL legítima mas sem identificador canônico reconhecido
            return {
                type: 'INVALID',
                canonicalCode: '',
                rawInput,
                isUrl: true,
                domain: parsedUrl.hostname,
                errorReason: 'URL legítima, porém nenhum identificador canônico (CRED- ou TKT_) foi encontrado.'
            };
        } catch {
            // Se falhar o parse da URL, segue para verificação de regex profunda
        }
    }

    // 4. Busca por ocorrência de token canônico embutido em texto livre (ex: crachá com texto ao redor)
    const credRegexGlobal = /CRED-[a-zA-Z0-9_-]{16,64}/i;
    const credMatch = cleaned.match(credRegexGlobal);
    if (credMatch) {
        return {
            type: 'STAFF_CREDENTIAL',
            canonicalCode: 'CRED-' + credMatch[0].slice(5),
            rawInput,
            isUrl: isPotentiallyUrl
        };
    }

    const tktRegexGlobal = /TKT_[a-zA-Z0-9_-]{6,64}/i;
    const tktMatch = cleaned.match(tktRegexGlobal);
    if (tktMatch) {
        return {
            type: 'TICKET',
            canonicalCode: 'TKT_' + tktMatch[0].slice(4),
            rawInput,
            isUrl: isPotentiallyUrl
        };
    }

    // 5. Código Desconhecido ou Inválido
    return {
        type: 'INVALID',
        canonicalCode: '',
        rawInput,
        isUrl: isPotentiallyUrl,
        errorReason: 'Código não reconhecido. Ingressos de público iniciam com TKT_ e credenciais profissionais com CRED-.'
    };
}
