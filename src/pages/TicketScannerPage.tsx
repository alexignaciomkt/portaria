import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ticketCheckinService, CheckinValidationResponse } from '@/services/ticketCheckinService';
import { staffAttendanceService, StaffValidationResponse } from '@/services/staffAttendanceService';
import { portariaService } from '@/services/portariaService';
import { supabase } from '@/lib/supabase';
import { 
    Camera, 
    CheckCircle, 
    AlertTriangle, 
    XCircle, 
    RotateCcw, 
    Keyboard, 
    Users, 
    LogOut, 
    UserCheck, 
    Clock, 
    Calendar,
    Sparkles,
    ShieldAlert, 
    ArrowRightCircle, 
    DoorClosed,
    Lock,
    Loader2,
    RefreshCw,
    Volume2,
    VolumeX,
    Volume1,
    HelpCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '@/contexts/AuthContext';
import { audioFeedback } from '@/utils/audioFeedback';
import { computeSemaphorDecision } from '@/utils/semaphorUtils';
import { parseUniversalQrCode, getSafeQrDiagnosis } from '@/utils/qrCodeParser';

export default function TicketScannerPage() {
    const isTransactionalWritesEnabled = import.meta.env.VITE_ENABLE_TRANSACTIONAL_WRITES === 'true';
    const { session, loading: authLoading, isAuthenticated } = useAuth();
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [eventId, setEventId] = useState<string | null>(null);
    const [eventName, setEventName] = useState<string>('');
    const [scanning, setScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [manualInput, setManualInput] = useState('');
    const [processing, setProcessing] = useState(false);
    
    // Ingressos
    const [result, setResult] = useState<CheckinValidationResponse | null>(null);
    const [undoReason, setUndoReason] = useState('');
    
    // Staff & Credenciais
    const [staffResult, setStaffResult] = useState<StaffValidationResponse | null>(null);
    const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
    const [confirmingAttendance, setConfirmingAttendance] = useState(false);
    const [photoStatus, setPhotoStatus] = useState<'loading' | 'loaded' | 'error' | 'missing'>('loading');
    
    // Deslogamento / Revogação Operacional
    const [evictionReason, setEvictionReason] = useState<string | null>(null);
    
    const [currentQrCode, setCurrentQrCode] = useState<string>('');

    // Tratamento de Erros, Timeout e Recuperação
    const [scanError, setScanError] = useState<{ title: string; message: string; isTimeout?: boolean } | null>(null);
    const isProcessingRef = useRef(false);
    const lastScannedRef = useRef<{ code: string; timestamp: number }>({ code: '', timestamp: 0 });
    const activeAbortControllerRef = useRef<AbortController | null>(null);
    
    // Feedback Sonoro e Controle de Áudio (P0.2 / P0.2.1)
    const [soundMuted, setSoundMuted] = useState<boolean>(() => {
        try {
            return typeof audioFeedback?.isMuted === 'function' ? audioFeedback.isMuted() : false;
        } catch {
            return false;
        }
    });
    const [soundVolume, setSoundVolume] = useState<number>(() => {
        try {
            return typeof audioFeedback?.getVolume === 'function' ? audioFeedback.getVolume() : 0.7;
        } catch {
            return 0.7;
        }
    });
    const lastPlayedSignatureRef = useRef<string>('');

    const toggleSoundMute = () => {
        try {
            audioFeedback.unlock?.();
            const next = !soundMuted;
            audioFeedback.setMuted?.(next);
            setSoundMuted(next);
        } catch (err) {
            console.warn('[SCANNER] Falha ao alternar mute de áudio:', err);
        }
    };

    const cycleSoundVolume = () => {
        try {
            audioFeedback.unlock?.();
            let next = 1.0;
            if (soundVolume >= 0.9) next = 0.3;
            else if (soundVolume < 0.5) next = 0.7;
            else next = 1.0;
            audioFeedback.setVolume?.(next);
            setSoundVolume(next);
            if (soundMuted) {
                audioFeedback.setMuted?.(false);
                setSoundMuted(false);
            }
        } catch (err) {
            console.warn('[SCANNER] Falha ao ajustar volume:', err);
        }
    };

    const qrCodeRegionId = "html5qr-code-full-region";
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const isStartingRef = useRef(false);
    const isStoppingRef = useRef(false);
    const isMountedRef = useRef(true);

    // Load Event ID from slug
    useEffect(() => {
        const loadEvent = async () => {
            if (authLoading) return;
            
            if (!isAuthenticated) {
                navigate('/login');
                return;
            }

            try {
                if (!slug) return;
                console.log('[SCANNER] AUTH READY');
                console.log('[SCANNER] BEFORE EVENT FETCH');
                const events = await portariaService.getCurrentOperations();
                console.log('[SCANNER] AFTER EVENT FETCH', { count: events.length });
                const event = events.find(e => e.slug === slug || e.id === slug);
                if (event) {
                    setEventId(event.id);
                    setEventName(event.title);
                } else {
                    toast({ title: "Evento não encontrado na sua operação", variant: "destructive" });
                }
            } catch (err) {
                console.error('[SCANNER] ERROR', err);
                toast({ title: "Erro ao carregar evento", variant: "destructive" });
            }
        };
        loadEvent();
    }, [slug, authLoading, isAuthenticated, session]);

    // Heartbeat Periódico de Status Operacional (Detecção de saída/revogação)
    useEffect(() => {
        if (!eventId || !isAuthenticated) return;

        const checkStatus = async () => {
            try {
                const status = await staffAttendanceService.checkOperationalStatus(eventId);
                if (!status.canOperateTickets && !status.canManageStaff) {
                    await stopScanner();
                    setScanning(false);
                    setEvictionReason(status.reason || 'Acesso operacional da Portaria finalizado para o seu perfil.');
                }
            } catch (err) {
                // Falha pontual de rede não desloga
            }
        };

        // Checar inicialmente e a cada 25 segundos
        checkStatus();
        const intervalId = setInterval(checkStatus, 25000);
        return () => clearInterval(intervalId);
    }, [eventId, isAuthenticated]);

    // Component Mount / Unmount Lifecycle Guard
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            console.log("[LIFECYCLE] Component unmounted - stopping scanner");
            isMountedRef.current = false;
            stopScanner();
        };
    }, []);

    // Scanning State Effect
    useEffect(() => {
        if (scanning) {
            startScanner();
        } else {
            stopScanner();
        }
    }, [scanning]);

    const startScanner = async () => {
        if (!isMountedRef.current) return;
        if (evictionReason) return; // Não abre câmera se evictado
        if (isStartingRef.current || isStoppingRef.current) {
            console.log("[LIFECYCLE] startScanner ignorado: transição em andamento");
            return;
        }

        const container = document.getElementById(qrCodeRegionId);
        if (!container) {
            console.warn("[LIFECYCLE] Container do scanner não encontrado no DOM");
            return;
        }

        isStartingRef.current = true;
        setCameraError(null);

        try {
            // Limpar qualquer resquício prévio antes de instanciar
            if (html5QrCodeRef.current) {
                try {
                    if (html5QrCodeRef.current.isScanning) {
                        await html5QrCodeRef.current.stop();
                    }
                    html5QrCodeRef.current.clear();
                } catch (cleanErr) {
                    console.warn("[LIFECYCLE] Aviso na limpeza prévia:", cleanErr);
                }
                html5QrCodeRef.current = null;
            }

            console.log("[LIFECYCLE] Criando instância Html5Qrcode vinculada a:", qrCodeRegionId);
            const scanner = new Html5Qrcode(qrCodeRegionId);
            html5QrCodeRef.current = scanner;

            const scanConfig = {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            };

            // Estratégia de Fallback Resiliente para Câmera Mobile
            try {
                console.log("[LIFECYCLE] Tentando iniciar com facingMode: environment");
                await scanner.start(
                    { facingMode: "environment" },
                    scanConfig,
                    onScanSuccess,
                    () => {}
                );
            } catch (firstErr: any) {
                console.warn("[LIFECYCLE] facingMode direto falhou, buscando lista de câmeras...", firstErr);
                const cameras = await Html5Qrcode.getCameras();
                if (!cameras || cameras.length === 0) {
                    throw new Error("Nenhuma câmera encontrada no dispositivo.");
                }
                const backCamera = cameras.find(c => /back|rear|traseira|environment/i.test(c.label)) || cameras[cameras.length - 1];
                console.log("[LIFECYCLE] Iniciando scanner com câmera selecionada:", backCamera.id, backCamera.label);
                await scanner.start(
                    backCamera.id,
                    scanConfig,
                    onScanSuccess,
                    () => {}
                );
            }

            console.log("[LIFECYCLE] Scanner iniciado com sucesso");
        } catch (err: any) {
            if (!isMountedRef.current) return;
            console.error("[LIFECYCLE] Erro ao iniciar câmera:", err);

            let friendlyMessage = "Não foi possível acessar a câmera.";
            const errMsg = err?.message || String(err);
            if (/NotAllowedError|permission|denied/i.test(errMsg)) {
                friendlyMessage = "Permissão da câmera negada. Habilite o acesso nas configurações do navegador.";
            } else if (/NotFoundError|DevicesNotFoundError|nenhuma câmera/i.test(errMsg)) {
                friendlyMessage = "Nenhuma câmera compatível detectada neste aparelho.";
            } else if (/NotReadableError|TrackStartError/i.test(errMsg)) {
                friendlyMessage = "A câmera pode estar em uso por outro aplicativo.";
            } else if (/OverconstrainedError/i.test(errMsg)) {
                friendlyMessage = "Configuração de câmera não suportada pelo aparelho.";
            }

            setCameraError(friendlyMessage);
            toast({ title: friendlyMessage, variant: "destructive" });
            setScanning(false);
        } finally {
            isStartingRef.current = false;
        }
    };

    const stopScanner = async () => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;
        try {
            if (html5QrCodeRef.current) {
                console.log("[LIFECYCLE] Parando scanner...");
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
                console.log("[LIFECYCLE] Scanner parado e container DOM liberado");
            }
        } catch (error) {
            console.warn("[LIFECYCLE] Aviso ao parar scanner:", error);
        } finally {
            html5QrCodeRef.current = null;
            isStoppingRef.current = false;
        }
    };

    const onScanSuccess = async (decodedText: string) => {
        if (!decodedText) return;
        const cleanCode = decodedText.trim();

        // 1. Mutex síncrono via Ref (evita leituras simultâneas a 30fps antes do React atualizar estado)
        if (isProcessingRef.current) {
            console.log("[SCANNER] Leitura descartada: operação já em processamento");
            return;
        }

        // 2. Proteção contra leitura repetida consecutiva (cooldown de 2.5s para o mesmo código)
        const now = Date.now();
        if (lastScannedRef.current.code === cleanCode && (now - lastScannedRef.current.timestamp) < 2500) {
            return;
        }

        // Bloquear mutex imediatamente
        isProcessingRef.current = true;
        lastScannedRef.current = { code: cleanCode, timestamp: now };
        console.log("[SCANNER] QR Code detectado:", cleanCode.substring(0, 8) + '...');

        // 3. Pausar/Parar scanner com timeout de segurança (não trava se a câmera demorar a fechar)
        try {
            await Promise.race([
                stopScanner(),
                new Promise(resolve => setTimeout(resolve, 1200))
            ]);
        } catch (err) {
            console.warn("[SCANNER] Aviso ao parar câmera:", err);
        }

        // 4. Disparar validação universal
        if (isMountedRef.current) {
            setScanning(false);
            handleUniversalValidate(cleanCode);
        } else {
            isProcessingRef.current = false;
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualInput) {
            handleUniversalValidate(manualInput.trim());
        }
    };

    const handleCancelProcessing = () => {
        if (activeAbortControllerRef.current) {
            activeAbortControllerRef.current.abort();
            activeAbortControllerRef.current = null;
        }
        isProcessingRef.current = false;
        setProcessing(false);
        setScanError({
            title: "Leitura Interrompida",
            message: "O processamento da leitura foi cancelado pelo operador."
        });
    };

    const handleRetry = () => {
        if (!currentQrCode) {
            handleResetToScanner();
            return;
        }
        setScanError(null);
        handleUniversalValidate(currentQrCode);
    };

    const handleResetToScanner = () => {
        if (activeAbortControllerRef.current) {
            activeAbortControllerRef.current.abort();
            activeAbortControllerRef.current = null;
        }
        isProcessingRef.current = false;
        setProcessing(false);
        setResult(null);
        setStaffResult(null);
        setScanError(null);
        setCurrentQrCode('');
        setManualInput('');
        lastScannedRef.current = { code: '', timestamp: 0 };
        lastPlayedSignatureRef.current = '';
        setScanning(true);
    };

    /**
     * Roteamento Universal por Prefixo (TKT_ vs CRED- vs Desconhecido)
     */
    const handleUniversalValidate = async (qrData: string) => {
        if (!eventId) {
            toast({ title: "Evento não identificado", description: "Aguarde o carregamento dos dados do evento.", variant: "destructive" });
            isProcessingRef.current = false;
            return;
        }

        // Cancela qualquer requisição anterior pendente
        if (activeAbortControllerRef.current) {
            activeAbortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        activeAbortControllerRef.current = abortController;

        isProcessingRef.current = true;
        setProcessing(true);
        setResult(null);
        setStaffResult(null);
        setScanError(null);
        setUndoReason('');
        setCurrentQrCode(qrData);
        setPhotoStatus('loading');

        // Classificação e extração canônica (suporta tokens diretos e URLs de domínios A2)
        const parsed = parseUniversalQrCode(qrData);
        const safeDiag = getSafeQrDiagnosis(parsed);
        console.log('[SCANNER DIAGNÓSTICO SEGURO]', safeDiag);

        const canonicalCode = parsed.canonicalCode || qrData.trim();
        setCurrentQrCode(canonicalCode);

        try {
            if (parsed.type === 'TICKET') {
                // ROTA A: INGRESSO DE PÚBLICO
                await handleTicketValidation(canonicalCode, abortController.signal);
            } else if (parsed.type === 'STAFF_CREDENTIAL') {
                // ROTA B: CREDENCIAL PROFISSIONAL DE STAFF
                await handleStaffValidation(canonicalCode, abortController.signal);
            } else {
                // ROTA C: PREFIXO DESCONHECIDO OU URL NÃO AUTORIZADA
                setResult({
                    code: 'INVALID_QR',
                    message: parsed.errorReason || 'Código não reconhecido. Ingressos de público iniciam com TKT_ e credenciais profissionais com CRED-.'
                });
                setManualInput('');
            }
        } catch (err: any) {
            const isAborted = abortController.signal.aborted;
            const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite');
            console.error("[SCANNER] Erro na validação universal:", err?.message || err);
            
            setScanError({
                title: isTimeout ? "Tempo Limite Excedido" : (isAborted ? "Leitura Interrompida" : "Falha na Leitura"),
                message: isTimeout 
                    ? "A conexão com o servidor demorou mais de 10 segundos. O resultado é INDETERMINADO e nenhuma entrada foi registrada."
                    : (err?.message || "Não foi possível validar o código lido. Verifique sua conexão e tente novamente."),
                isTimeout
            });
        } finally {
            if (activeAbortControllerRef.current === abortController) {
                activeAbortControllerRef.current = null;
            }
            isProcessingRef.current = false;
            if (isMountedRef.current) {
                setProcessing(false);
            }
        }
    };

    const handleTicketValidation = async (ticketQr: string, signal?: AbortSignal) => {
        try {
            const res = await ticketCheckinService.validateTicket(ticketQr, eventId!, { timeout: 10000, signal });
            if (!isMountedRef.current) return;
            setResult(res);
            if (res.code === 'VALID') {
                toast({ title: "Acesso Liberado!" });
            }
        } catch (err: any) {
            if (!isMountedRef.current) return;
            const msg = err.message || 'Erro ao validar ingresso';
            if (/presença ativa|unauthorized/i.test(msg)) {
                setEvictionReason('Operação bloqueada: presença presencial obrigatória não confirmada ou expediente encerrado.');
            }
            // Se for timeout ou erro de conexão, relança para tratamento no handleUniversalValidate
            if (err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite')) {
                throw err;
            }
            setResult({
                code: 'INVALID_QR',
                message: msg
            });
        } finally {
            if (isMountedRef.current) {
                setManualInput('');
            }
        }
    };

    const handleStaffValidation = async (credQr: string, signal?: AbortSignal) => {
        try {
            const res = await staffAttendanceService.validateCredential(credQr, eventId!, { timeout: 10000, signal });
            if (!isMountedRef.current) return;

            // Se o serviço retornou erro de timeout ou rede
            if (res.error === 'TIMEOUT_EXCEEDED') {
                throw new Error(res.message || 'Tempo limite de conexão esgotado (10s).');
            }

            setStaffResult(res);
            const initialShiftId = res.suggestedShiftId || res.shifts?.[0]?.shiftId || null;
            setSelectedShiftId(initialShiftId);

            if (!res.person?.avatarUrl) {
                setPhotoStatus('missing');
            } else {
                setPhotoStatus('loading');
            }

            if (res.isFutureDate || res.error === 'EARLY_CHECKIN_OUTSIDE_SHIFT_DATE') {
                toast({ 
                    title: "Escala em Data Futura", 
                    description: "Este profissional possui escala em uma data futura. A entrada antecipada somente pode ser autorizada no dia da escala.",
                    variant: "destructive"
                });
            } else if (res.state === 'NO_CONFIRMED_SHIFTS') {
                toast({
                    title: "Sem Escala Confirmada",
                    description: "Profissional cadastrado, porém sem escalas ou turnos confirmados para este evento.",
                    variant: "destructive"
                });
            } else if (res.state === 'CREDENTIAL_NOT_FOUND') {
                toast({
                    title: "Credencial Não Encontrada",
                    description: "Código não encontrado na base de credenciais deste evento.",
                    variant: "destructive"
                });
            } else if (res.state === 'UNAUTHORIZED_OPERATOR') {
                toast({
                    title: "Acesso Não Autorizado",
                    description: res.message || "Você não possui permissão para autorizar presença neste evento.",
                    variant: "destructive"
                });
            } else if (res.state === 'API_ERROR') {
                toast({
                    title: "Falha no Serviço",
                    description: "O serviço de validação retornou um erro interno temporário.",
                    variant: "destructive"
                });
            } else if (res.success && res.state === 'AWAITING_CHECKIN' && res.isEarly) {
                toast({ 
                    title: "Escala de Hoje (Antecipada)", 
                    description: "Início programado para mais tarde. Entrada antecipada disponível para autorização pelo produtor." 
                });
            } else if (res.success && res.state === 'AWAITING_CHECKIN') {
                toast({ title: "Credencial Identificada!", description: "Confirme a entrada do profissional." });
            } else if (res.state === 'IN_SERVICE') {
                toast({ title: "Profissional em Serviço", description: "Entrada já registrada anteriormente." });
            }
        } catch (err: any) {
            if (!isMountedRef.current) return;
            if (err?.name === 'TimeoutError' || err?.message?.includes('Tempo limite')) {
                throw err;
            }
            setPhotoStatus('error');
            setSelectedShiftId(null);
            setStaffResult({
                success: false,
                state: 'INVALID_CREDENTIAL',
                stateLabel: 'Erro de Leitura',
                canCheckIn: false,
                canCheckOut: false,
                error: err.message,
                message: err.message || 'Erro ao consultar credencial de equipe.'
            });
        } finally {
            if (isMountedRef.current) {
                setManualInput('');
            }
        }
    };

    // Estado derivado em tempo real com base no turno selecionado pelo operador
    const effectiveStaffResult: StaffValidationResponse | null = useMemo(() => {
        if (!staffResult) return null;
        if (!staffResult.shifts || staffResult.shifts.length === 0) return staffResult;
        const activeShift = staffResult.shifts.find(s => s.shiftId === selectedShiftId) || staffResult.shifts.find(s => s.isSuggested) || staffResult.shifts[0];
        if (!activeShift) return staffResult;

        return {
            ...staffResult,
            state: activeShift.operationalState,
            stateLabel: activeShift.category,
            canCheckIn: activeShift.canRequestCheckin && (photoStatus === 'loaded'),
            canCheckOut: activeShift.canRequestCheckout,
            isEarly: activeShift.category === 'HOJE — ENTRADA ANTECIPADA',
            earlyMinutes: activeShift.earlyMinutes || 0,
            requiresEarlyAuthorization: activeShift.requiresAuthorization,
            isFutureDate: activeShift.category === 'TURNO FUTURO',
            checkedInAt: activeShift.checkedInAt || staffResult.checkedInAt,
            checkedOutAt: activeShift.checkedOutAt || staffResult.checkedOutAt,
            message: activeShift.category === 'TURNO FUTURO'
                ? 'Este profissional possui escala em uma data futura. A entrada antecipada somente pode ser autorizada no dia da escala.'
                : (activeShift.category === 'HOJE — ENCERRADO' ? 'O horário limite desta escala já foi ultrapassado.' : staffResult.message),
            person: staffResult.person ? {
                ...staffResult.person,
                shiftStart: activeShift.startUtc || staffResult.person.shiftStart,
                shiftEnd: activeShift.endUtc || staffResult.person.shiftEnd,
                shiftDisplay: `${activeShift.displayDate} ${activeShift.displayTime}`
            } : undefined
        };
    }, [staffResult, selectedShiftId, photoStatus]);

    const handleConfirmStaffCheckin = async (isEarly: boolean = false) => {
        const target = effectiveStaffResult || staffResult;
        if (!target?.credentialId || !eventId) return;

        if (photoStatus !== 'loaded') {
            toast({
                title: "Identidade Não Verificada",
                description: "Fotografia indisponível. A conferência de presença exige fotografia válida carregada no dispositivo.",
                variant: "destructive"
            });
            return;
        }

        if (target.isFutureDate || target.error === 'EARLY_CHECKIN_OUTSIDE_SHIFT_DATE') {
            toast({
                title: "Escala em Data Futura",
                description: "Este profissional possui escala em uma data futura. A entrada antecipada somente pode ser autorizada no dia da escala.",
                variant: "destructive"
            });
            return;
        }

        // BLOQUEIO ESTRITO DE ESCRITA EM HOMOLOGAÇÃO
        if (!isTransactionalWritesEnabled) {
            toast({
                title: "MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO",
                description: "A leitura de QR, foto e turnos foram homologados com sucesso. Ações que gravam presença física no banco estão desativadas.",
                variant: "destructive"
            });
            return;
        }

        setConfirmingAttendance(true);
        try {
            const res = await staffAttendanceService.confirmAttendance({
                credentialId: target.credentialId,
                eventId: eventId,
                eventStaffId: target.person?.eventStaffId,
                employeeId: target.person?.employeeId || undefined,
                shiftId: selectedShiftId || undefined,
                shiftStart: target.person?.shiftStart,
                earlyAuthorization: isEarly || target.isEarly || target.state === 'SHIFT_NOT_STARTED',
                earlyReason: isEarly ? 'Autorização antecipada confirmada pelo produtor na portaria' : undefined
            });

            toast({ title: isEarly ? "Entrada Antecipada Autorizada!" : "Presença Confirmada!", description: res.message });
            setStaffResult(prev => prev ? ({
                ...prev,
                state: 'IN_SERVICE',
                stateLabel: 'Em Serviço',
                canCheckIn: false,
                canCheckOut: true,
                checkedInAt: res.checkedInAt,
                delayMinutes: res.delayMinutes,
                shifts: prev.shifts?.map(s => s.shiftId === selectedShiftId ? {
                    ...s,
                    operationalState: 'IN_SERVICE',
                    category: 'PRESENÇA ATIVA',
                    attendanceState: 'ACTIVE',
                    canRequestCheckin: false,
                    canRequestCheckout: true,
                    checkedInAt: res.checkedInAt
                } : s)
            }) : null);
        } catch (err: any) {
            const msg = err.message || 'Falha ao confirmar presença';
            if (msg.includes('MODO HOMOLOGAÇÃO') || err.code === 'HOMOLOGATION_WRITE_BLOCKED') {
                toast({ 
                    title: "MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO", 
                    description: "Leitura e identificação aprovadas. A gravação no banco de produção está bloqueada neste ambiente.",
                    variant: "destructive"
                });
            } else if (msg.includes('EARLY_AUTHORIZATION_FORBIDDEN')) {
                toast({
                    title: "Delegação Ausente",
                    description: "Operador sem delegação explícita para autorizar entrada antecipada de Staff.",
                    variant: "destructive"
                });
            } else {
                toast({ title: "Falha na confirmação", description: msg, variant: "destructive" });
            }
        } finally {
            setConfirmingAttendance(false);
        }
    };

    const handleConfirmStaffCheckout = async () => {
        const target = effectiveStaffResult || staffResult;
        if (!target?.credentialId || !eventId) return;

        // BLOQUEIO ESTRITO DE ESCRITA EM HOMOLOGAÇÃO
        if (!isTransactionalWritesEnabled) {
            toast({
                title: "MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO",
                description: "A leitura de QR, foto e turnos foram homologados com sucesso. O encerramento de turno no banco está desativado.",
                variant: "destructive"
            });
            return;
        }

        setConfirmingAttendance(true);
        try {
            const res = await staffAttendanceService.checkoutAttendance({
                credentialId: target.credentialId,
                eventId: eventId,
                eventStaffId: target.person?.eventStaffId,
                employeeId: target.person?.employeeId || undefined,
                shiftId: selectedShiftId || undefined
            });

            toast({ title: "Saída Registrada!", description: res.message });
            setStaffResult(prev => prev ? ({
                ...prev,
                state: 'CHECKED_OUT',
                stateLabel: 'Expediente Encerrado',
                canCheckIn: false,
                canCheckOut: false,
                checkedOutAt: res.checkedOutAt,
                shifts: prev.shifts?.map(s => s.shiftId === selectedShiftId ? {
                    ...s,
                    operationalState: 'CHECKED_OUT',
                    category: 'SAÍDA REGISTRADA',
                    attendanceState: 'COMPLETED',
                    canRequestCheckin: false,
                    canRequestCheckout: false,
                    checkedOutAt: res.checkedOutAt
                } : s)
            }) : null);
        } catch (err: any) {
            const msg = err.message || 'Falha ao registrar saída';
            if (msg.includes('MODO HOMOLOGAÇÃO') || err.code === 'HOMOLOGATION_WRITE_BLOCKED') {
                toast({ 
                    title: "MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO", 
                    description: "Leitura aprovada. O registro de saída no banco está bloqueado em modo de homologação.",
                    variant: "destructive"
                });
            } else {
                toast({ title: "Falha ao registrar saída", description: msg, variant: "destructive" });
            }
        } finally {
            setConfirmingAttendance(false);
        }
    };

    const handleUndo = async () => {
        const qrToUndo = currentQrCode || result?.ticket?.qrCode;
        if (!result?.ticket || !eventId || !undoReason || !qrToUndo) return;
        try {
            setProcessing(true);
            await ticketCheckinService.undoCheckin(qrToUndo, eventId, undoReason);
            toast({ title: "Check-in desfeito" });
            setResult(null);
            setCurrentQrCode('');
        } catch (err: any) {
            toast({ title: err.message, variant: "destructive" });
        } finally {
            setProcessing(false);
        }
    };

    // Semáforo Operacional Inteligente: Decisão Consolidada
    const decision = (result || effectiveStaffResult || scanError) && !processing
        ? computeSemaphorDecision({ result, staffResult: effectiveStaffResult, scanError, photoStatus })
        : null;

    // Feedback Sonoro: Disparo único por transição inequívoca de decisão
    useEffect(() => {
        if (!decision) return;

        const signature = `${decision.level}-${decision.badgeLabel}-${staffResult?.credentialId || result?.ticket?.ticketId || currentQrCode}-${staffResult?.state || result?.code || ''}-${photoStatus}`;
        
        if (lastPlayedSignatureRef.current !== signature) {
            lastPlayedSignatureRef.current = signature;
            try {
                audioFeedback.playTone?.(decision.sound);
            } catch (err) {
                console.warn('[SCANNER] Falha ao reproduzir tom sonoro:', err);
            }
        }
    }, [decision, staffResult, result, currentQrCode, photoStatus]);

    const handleToggleScanning = async () => {
        if (scanning) {
            await stopScanner();
            setScanning(false);
        } else {
            setCameraError(null);
            setResult(null);
            setStaffResult(null);
            setSelectedShiftId(null);
            setScanning(true);
        }
    };

    const handleLogout = async () => {
        await stopScanner();
        setScanning(false);
        await supabase.auth.signOut();
        setResult(null);
        setStaffResult(null);
        setSelectedShiftId(null);
        setEventId(null);
        setEventName('');
        navigate('/login', { replace: true });
    };

    if (!eventId) {
        return (
            <div className="p-8 text-center notranslate" translate="no">
                <span>Carregando evento...</span>
            </div>
        );
    }

    // Modal de Revogação Operacional (Sem deslogar Supabase global)
    if (evictionReason) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center p-4 notranslate" translate="no">
                <Card className="max-w-md w-full border-destructive/20 bg-card shadow-2xl p-6 text-center space-y-6">
                    <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
                        <Lock className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight"><span>Acesso Operacional Finalizado</span></h2>
                        <p className="text-sm text-muted-foreground mt-2">
                            <span>{evictionReason}</span>
                        </p>
                    </div>
                    <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground text-left space-y-1">
                        <p><span>• Sua conta global do A2Tickets360 permanece ativa.</span></p>
                        <p><span>• Para operar a Portaria, seu vínculo e presença devem estar ativos.</span></p>
                    </div>
                    <Button 
                        onClick={() => navigate('/app')} 
                        className="w-full"
                    >
                        <span>Voltar às Minhas Operações</span>
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 max-w-2xl notranslate" translate="no">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight"><span>Controle de Acesso</span></h1>
                    <p className="text-muted-foreground"><span>{eventName}</span></p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-muted-foreground hover:text-destructive shrink-0 notranslate"
                    translate="no"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    <span>SAIR</span>
                </Button>
            </div>

            <div className="mb-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-400 notranslate" translate="no">
                <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>HOMOLOGAÇÃO MOBILE (SCAN-ONLY)</span>
                </span>
                <span className="text-[11px] text-zinc-400">Banco Protegido (Zero Escritas)</span>
            </div>

            <Card className="mb-6 notranslate" translate="no">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle className="flex items-center gap-2 notranslate" translate="no">
                        <span className="inline-flex items-center">
                            {scanning ? <Camera className="w-5 h-5" /> : <Keyboard className="w-5 h-5" />}
                        </span>
                        <span>Scanner Universal</span>
                    </CardTitle>
                    <div className="flex items-center gap-1.5 notranslate" translate="no">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleSoundMute}
                            className="h-8 px-2 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            title={soundMuted ? "Ativar som operacional" : "Silenciar scanner"}
                        >
                            {soundMuted ? (
                                <VolumeX className="w-4 h-4 text-destructive" />
                            ) : soundVolume < 0.5 ? (
                                <Volume1 className="w-4 h-4 text-primary" />
                            ) : (
                                <Volume2 className="w-4 h-4 text-primary" />
                            )}
                            <span className="font-mono text-[11px]">{soundMuted ? 'MUDO' : `${Math.round(soundVolume * 100)}%`}</span>
                        </Button>
                        {!soundMuted && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={cycleSoundVolume}
                                className="h-7 px-2 text-[10px] font-mono border-muted-foreground/30 hover:bg-muted"
                                title="Ajustar nível de volume (30%, 70%, 100%)"
                            >
                                Vol
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="notranslate" translate="no">
                    {!result && !staffResult && !scanError && (
                        <div className="flex flex-col items-center justify-center space-y-4">
                            {/* Container Estável e Isolado para o Scanner */}
                            <div className="w-full max-w-sm min-h-[260px] rounded-lg overflow-hidden border bg-black relative flex items-center justify-center notranslate" translate="no">
                                <div
                                    id={qrCodeRegionId}
                                    className="w-full h-full min-h-[260px]"
                                    style={{ display: scanning ? 'block' : 'none' }}
                                />

                                {!scanning && !cameraError && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-muted/20 pointer-events-none">
                                        <Camera className="w-12 h-12 mb-4 text-muted-foreground opacity-50" />
                                        <p className="text-muted-foreground text-sm">
                                            <span>Câmera pausada</span>
                                        </p>
                                    </div>
                                )}

                                {cameraError && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-destructive/10 text-destructive space-y-3">
                                        <AlertTriangle className="w-10 h-10" />
                                        <p className="text-xs font-semibold max-w-xs">
                                            <span>{cameraError}</span>
                                        </p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => { setCameraError(null); setScanning(true); }}
                                            className="notranslate"
                                            translate="no"
                                        >
                                            <span>Tentar Novamente</span>
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={handleToggleScanning} 
                                variant={scanning ? "destructive" : "default"}
                                className="w-full max-w-sm notranslate"
                                translate="no"
                                disabled={processing}
                            >
                                <span>{scanning ? 'Pausar Câmera' : 'Abrir Câmera'}</span>
                            </Button>

                            <div className="w-full max-w-sm flex items-center gap-2 my-4 notranslate" translate="no">
                                <div className="h-px bg-border flex-1"></div>
                                <span className="text-xs text-muted-foreground uppercase">OU</span>
                                <div className="h-px bg-border flex-1"></div>
                            </div>

                            <form onSubmit={handleManualSubmit} className="w-full max-w-sm flex gap-2 notranslate" translate="no">
                                <Input 
                                    placeholder="Código (TKT_... ou CRED-...)" 
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    disabled={processing}
                                />
                                <Button type="submit" disabled={processing || !manualInput}>
                                    <span>Validar</span>
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* ESTADO: PROCESSANDO LEITURA (COM ANIMAÇÃO E BOTÃO DE CANCELAMENTO SEGURO) */}
                    {processing && !result && !staffResult && (
                        <div className="flex flex-col items-center justify-center p-8 space-y-5 text-center notranslate" translate="no">
                            <div className="relative">
                                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-foreground">
                                    <span>Processando leitura...</span>
                                </h3>
                                <p className="text-xs text-muted-foreground max-w-xs">
                                    <span>Consultando autenticação e validando dados do evento...</span>
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={handleCancelProcessing}
                                className="mt-2 text-xs border-muted-foreground/30 hover:bg-destructive/10 hover:text-destructive"
                            >
                                <XCircle className="w-4 h-4 mr-1.5" />
                                <span>Cancelar e Voltar</span>
                            </Button>
                        </div>
                    )}

                    {/* SEMÁFORO OPERACIONAL INTELIGENTE (P0.2) */}
                    {decision && !processing && (
                        <div className="flex flex-col items-center text-center space-y-5 notranslate" translate="no">
                            {/* A. INDICADOR DE DECISÃO GRANDE COM COR + ÍCONE + TEXTO */}
                            <div className={`w-full p-4 rounded-2xl border-2 flex flex-col items-center justify-center space-y-2 shadow-lg transition-all ${decision.theme.bannerBg} ${decision.theme.borderColor}`}>
                                <div className={`p-3 rounded-full ${decision.theme.iconBg} shadow-md`}>
                                    {decision.level === 'green' && <CheckCircle className="w-10 h-10 text-white" />}
                                    {decision.level === 'yellow' && <AlertTriangle className="w-10 h-10 text-white" />}
                                    {decision.level === 'red' && <XCircle className="w-10 h-10 text-white" />}
                                    {decision.level === 'neutral' && <HelpCircle className="w-10 h-10 text-white" />}
                                </div>
                                <div className="space-y-1">
                                    <h2 className={`text-2xl sm:text-3xl font-black uppercase tracking-wider ${decision.theme.bannerText}`}>
                                        {decision.title}
                                    </h2>
                                    <div className="flex items-center justify-center">
                                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-white shadow-sm ${decision.theme.badgeBg}`}>
                                            {decision.badgeLabel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-foreground/80 max-w-sm mt-1 leading-relaxed font-medium">
                                        {decision.subtitle}
                                    </p>
                                </div>
                            </div>

                            {/* B. IDENTIFICAÇÃO VISUAL & FOTOGRAFIA DESTACADA */}
                            {/* 1. Credencial Profissional de Staff */}
                            {decision.isStaff && staffResult && (
                                <div className="w-full flex flex-col items-center space-y-4">
                                    <div className="relative">
                                        <div className={`w-36 h-36 rounded-2xl overflow-hidden border-4 shadow-2xl mx-auto flex items-center justify-center ${
                                            photoStatus === 'loaded' ? 'border-primary/40 bg-muted' : 'border-destructive/60 bg-destructive/10'
                                        }`}>
                                            {staffResult.person?.avatarUrl ? (
                                                <img 
                                                    src={staffResult.person.avatarUrl} 
                                                    alt={staffResult.person.name || 'Avatar'} 
                                                    className="w-full h-full object-cover" 
                                                    loading="eager"
                                                    decoding="async"
                                                    onLoad={() => setPhotoStatus('loaded')}
                                                    onError={(e) => {
                                                        setPhotoStatus('error');
                                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                                        const fallback = e.currentTarget.parentElement?.querySelector('.fallback-avatar');
                                                        if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                                                    }}
                                                />
                                            ) : null}
                                            <div className={`flex flex-col items-center justify-center p-2 text-destructive fallback-avatar ${staffResult.person?.avatarUrl && photoStatus === 'loaded' ? 'hidden' : ''}`}>
                                                <ShieldAlert className="w-10 h-10 mb-1" />
                                                <span className="text-[10px] font-bold uppercase tracking-tight">Sem Foto Válida</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-2xl font-bold tracking-tight text-foreground">
                                            {staffResult.person?.name || 'Profissional'}
                                        </h3>
                                        <p className="text-sm font-semibold text-primary uppercase tracking-wide mt-0.5">
                                            {staffResult.person?.functionName || 'Equipe do Evento'}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                                            {eventName || 'A2Tickets360'}
                                        </p>
                                    </div>

                                    {/* Alerta de Foto Obrigatória (se ausente ou com falha) */}
                                    {(photoStatus === 'missing' || photoStatus === 'error') && (
                                        <div className="w-full max-w-sm bg-destructive/15 border-2 border-destructive/50 rounded-xl p-3 text-destructive text-xs space-y-1.5 text-left shadow-sm">
                                            <div className="flex items-center gap-2 font-black tracking-wide">
                                                <ShieldAlert className="w-4 h-4 shrink-0 text-destructive" />
                                                <span>FOTOGRAFIA OBRIGATÓRIA NÃO CARREGADA</span>
                                            </div>
                                            <p className="text-[11px] leading-relaxed text-destructive/90">
                                                A política de segurança exige a conferência da fotografia no dispositivo. A confirmação de entrada está bloqueada.
                                            </p>
                                        </div>
                                    )}

                                    {/* BLOCO 2 — TURNOS DISPONÍVEIS */}
                                    {staffResult.shifts && staffResult.shifts.length > 0 ? (
                                        <div className="w-full max-w-sm space-y-2 text-left">
                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-primary" />
                                                    Escalas Disponíveis ({staffResult.shifts.length})
                                                </span>
                                                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                                                    Seleção Operacional
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {staffResult.shifts.map((shift) => {
                                                    const isSelected = selectedShiftId === shift.shiftId;
                                                    const dateParts = shift.shiftDate.split('-');
                                                    const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : shift.shiftDate;
                                                    
                                                    let badgeColor = 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
                                                    if (shift.category === 'EM ANDAMENTO' || shift.category === 'PRESENÇA ATIVA') {
                                                        badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold';
                                                    } else if (shift.category.includes('ENTRADA ANTECIPADA')) {
                                                        badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold';
                                                    } else if (shift.category === 'TURNO FUTURO') {
                                                        badgeColor = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
                                                    }

                                                    return (
                                                        <div
                                                            key={shift.shiftId}
                                                            onClick={() => setSelectedShiftId(shift.shiftId)}
                                                            className={`cursor-pointer rounded-xl border p-3 transition-all ${
                                                                isSelected 
                                                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm' 
                                                                    : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40'
                                                            }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                                        isSelected ? 'border-primary' : 'border-muted-foreground/40'
                                                                    }`}>
                                                                        {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-xs text-foreground">{displayDate}</span>
                                                                            <span className="font-mono text-xs font-semibold text-foreground/80">
                                                                                {shift.startTime} – {shift.endTime}
                                                                            </span>
                                                                        </div>
                                                                        {(shift.roleName || shift.role) && (
                                                                            <div className="text-[11px] text-muted-foreground">{shift.roleName || shift.role}</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    {shift.isSuggested && (
                                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                                            <Sparkles className="w-2.5 h-2.5" /> Sugerido
                                                                        </span>
                                                                    )}
                                                                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-md border ${badgeColor}`}>
                                                                        {shift.category}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Indicadores de Presença no card */}
                                                            {(shift.checkedInAt || shift.checkedOutAt) && (
                                                                <div className="mt-2 pt-2 border-t border-border/40 text-[11px] flex justify-between items-center text-muted-foreground">
                                                                    {shift.checkedInAt && (
                                                                        <span className="text-emerald-600 font-medium">
                                                                            Entrada: {format(new Date(shift.checkedInAt), "dd/MM HH:mm")}
                                                                        </span>
                                                                    )}
                                                                    {shift.checkedOutAt && (
                                                                        <span className="text-zinc-500 font-medium">
                                                                            Saída: {format(new Date(shift.checkedOutAt), "dd/MM HH:mm")}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Fallback legado caso não haja lista de turnos */
                                        <div className="w-full max-w-sm bg-muted/30 border rounded-xl p-3.5 text-xs space-y-2 text-left">
                                            {staffResult.person?.shiftStart && (
                                                <div className="flex justify-between items-center text-muted-foreground">
                                                    <span>Escala Prevista:</span>
                                                    <span className="font-semibold text-foreground font-mono">
                                                        {staffResult.person.shiftDisplay || (
                                                            `${formatInTimeZone(new Date(staffResult.person.shiftStart), staffResult.person.timezone || 'America/Sao_Paulo', "HH:mm")}${staffResult.person.shiftEnd ? ` - ${formatInTimeZone(new Date(staffResult.person.shiftEnd), staffResult.person.timezone || 'America/Sao_Paulo', "HH:mm")}` : ''}`
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                            {staffResult.checkedInAt && (
                                                <div className="flex justify-between items-center text-emerald-600 font-medium">
                                                    <span>Entrada Registrada:</span>
                                                    <span className="font-mono">{format(new Date(staffResult.checkedInAt), "dd/MM HH:mm:ss")}</span>
                                                </div>
                                            )}
                                            {staffResult.checkedOutAt && (
                                                <div className="flex justify-between items-center text-zinc-500 font-medium">
                                                    <span>Saída Registrada:</span>
                                                    <span className="font-mono">{format(new Date(staffResult.checkedOutAt), "dd/MM HH:mm:ss")}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* D. AÇÕES OPERACIONAIS CONTEXTUAIS */}
                                    <div className="w-full max-w-sm space-y-2 pt-1">
                                        {!isTransactionalWritesEnabled && (
                                            <div className="w-full text-center py-2 px-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2">
                                                <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                                                <span>MODO HOMOLOGAÇÃO — REGISTRO DESATIVADO</span>
                                            </div>
                                        )}

                                        {/* Botão de Autorização Antecipada (Mesmo dia) */}
                                        {effectiveStaffResult?.isEarly && !effectiveStaffResult?.isFutureDate && (
                                            <Button
                                                onClick={() => handleConfirmStaffCheckin(true)}
                                                disabled={confirmingAttendance || photoStatus !== 'loaded'}
                                                className="w-full h-12 bg-amber-600 hover:bg-amber-500 text-white font-bold tracking-wide rounded-xl shadow-md gap-2"
                                            >
                                                <ShieldAlert className="w-5 h-5" />
                                                <span>{confirmingAttendance ? 'Autorizando...' : 'AUTORIZAR ENTRADA ANTECIPADA'}</span>
                                            </Button>
                                        )}

                                        {/* Botão de Confirmação Normal */}
                                        {effectiveStaffResult?.canCheckIn && !effectiveStaffResult?.isEarly && !effectiveStaffResult?.isFutureDate && (
                                            <Button
                                                onClick={() => handleConfirmStaffCheckin(false)}
                                                disabled={confirmingAttendance || photoStatus !== 'loaded'}
                                                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold tracking-wide rounded-xl shadow-md gap-2"
                                            >
                                                 <UserCheck className="w-5 h-5" />
                                                <span>{confirmingAttendance ? 'Confirmando...' : 'CONFIRMAR ENTRADA'}</span>
                                            </Button>
                                        )}

                                        {/* Botão de Saída (Checkout) */}
                                        {effectiveStaffResult?.canCheckOut && (
                                            <Button
                                                onClick={handleConfirmStaffCheckout}
                                                disabled={confirmingAttendance}
                                                className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold tracking-wide rounded-xl shadow-md gap-2 border border-zinc-700"
                                            >
                                                <LogOut className="w-5 h-5 text-amber-400" />
                                                <span>{confirmingAttendance ? 'Registrando...' : 'CONFIRMAR SAÍDA (CHECKOUT)'}</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 2. Ingresso de Público (TKT_) */}
                            {decision.isTicket && result && (
                                <div className="w-full flex flex-col items-center space-y-4">
                                    {/* Fotografia do Titular do Ingresso (se existir) */}
                                    {result.ticket?.participantPhoto ? (
                                        <div className="relative">
                                            <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-primary/40 shadow-xl mx-auto bg-muted">
                                                <img 
                                                    src={result.ticket.participantPhoto} 
                                                    alt={result.ticket.ticketName || 'Titular'} 
                                                    className="w-full h-full object-cover" 
                                                    crossOrigin="anonymous"
                                                />
                                            </div>
                                            <span className="block text-[10px] uppercase font-bold text-muted-foreground mt-1">
                                                Foto do Titular Vinculada
                                            </span>
                                        </div>
                                    ) : null}

                                    {/* Informações Operacionais do Ingresso */}
                                    <div className="w-full max-w-sm bg-muted/30 border rounded-xl p-4 text-xs space-y-2 text-left">
                                        <div className="flex justify-between items-center text-muted-foreground">
                                            <span>Titular / Nome:</span>
                                            <span className="font-bold text-foreground text-sm">
                                                {result.ticket?.ticketName || result.ticket?.buyerName || 'Participante'}
                                            </span>
                                        </div>
                                        {result.ticket?.ticketId && (
                                            <div className="flex justify-between items-center text-muted-foreground">
                                                <span>ID do Ingresso:</span>
                                                <span className="font-mono text-foreground">{result.ticket.ticketId}</span>
                                            </div>
                                        )}
                                        {result.ticket?.isCourtesy && (
                                            <div className="flex justify-between items-center">
                                                <span>Categoria:</span>
                                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded-full">
                                                    Cortesia
                                                </span>
                                            </div>
                                        )}
                                        {result.validatedAt && (
                                            <div className="flex justify-between items-center text-muted-foreground">
                                                <span>Check-in Registrado:</span>
                                                <span className="font-mono">{format(new Date(result.validatedAt), "dd/MM HH:mm:ss")}</span>
                                            </div>
                                        )}
                                        {result.operatorId && (
                                            <div className="flex justify-between items-center text-muted-foreground">
                                                <span>Operador:</span>
                                                <span className="font-mono">{result.operatorId}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Ação Administrativa: Desfazer Check-in (quando aplicável) */}
                                    {(result.code === 'ALREADY_USED' || result.code === 'VALID') && result.ticket && (
                                        <div className="w-full max-w-sm mt-2 border-t pt-4 text-left">
                                            <p className="text-xs text-muted-foreground mb-1.5 font-semibold">
                                                Ação Administrativa (Owner)
                                            </p>
                                            <div className="flex gap-2">
                                                <Input 
                                                    placeholder="Motivo para desfazer" 
                                                    value={undoReason}
                                                    onChange={(e) => setUndoReason(e.target.value)}
                                                    className="text-xs"
                                                />
                                                <Button 
                                                    variant="destructive" 
                                                    size="sm"
                                                    onClick={handleUndo}
                                                    disabled={!undoReason || processing}
                                                    title="Desfazer Check-in"
                                                    className="gap-1 text-xs shrink-0"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span>Desfazer</span>
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 3. Falha Técnica / Erro de Rede / Timeout (Estado Neutro) */}
                            {scanError && !result && !staffResult && (
                                <div className="w-full max-w-sm flex flex-col gap-2.5 pt-2">
                                    {scanError.isTimeout && (
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-xs text-left leading-relaxed">
                                            <strong>Atenção Técnica:</strong> Como a resposta da rede não foi recebida dentro do tempo limite (10s), o estado é estritamente <strong>INDETERMINADO</strong>. Nenhuma autorização foi concedida e nenhum registro foi gravado no banco de dados.
                                        </div>
                                    )}
                                    {currentQrCode && (
                                        <Button 
                                            onClick={handleRetry} 
                                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md gap-2 h-12 rounded-xl"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            <span>TENTAR NOVAMENTE</span>
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                {decision && !processing && (
                    <CardFooter className="justify-center border-t bg-muted/10 p-4 notranslate" translate="no">
                        <Button 
                            size="lg" 
                            onClick={handleResetToScanner} 
                            className="w-full max-w-sm gap-2 h-12 text-base font-bold rounded-xl shadow-md"
                        >
                            <Camera className="w-5 h-5" />
                            <span>NOVA LEITURA</span>
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
