/**
 * MOTOR DE FEEDBACK SONORO OPERACIONAL (WEB AUDIO API)
 * 
 * Implementação 100% nativa sem dependência de bibliotecas pesadas ou arquivos de áudio externos.
 * Totalmente compatível com as políticas de autoplay do Chrome Android.
 */

export type SemaphorTone = 'green' | 'yellow' | 'red' | 'neutral';

class AudioFeedbackEngine {
    private audioCtx: AudioContext | null = null;
    private _isMuted: boolean = false;
    private _volume: number = 0.7; // 0.0 a 1.0

    constructor() {
        if (typeof window !== 'undefined') {
            try {
                const savedMuted = localStorage.getItem('portaria_sound_muted');
                if (savedMuted !== null) {
                    this._isMuted = savedMuted === 'true';
                }
                const savedVol = localStorage.getItem('portaria_sound_volume');
                if (savedVol !== null) {
                    const parsed = parseFloat(savedVol);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                        this._volume = parsed;
                    }
                }
            } catch (err) {
                console.warn('[AUDIO] Não foi possível ler preferências do localStorage:', err);
            }
        }
    }

    /**
     * Inicializa ou retoma o AudioContext após interação do usuário (exigência do Chrome/Android)
     */
    public async unlock(): Promise<void> {
        try {
            if (typeof window === 'undefined') return;
            if (!this.audioCtx) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    this.audioCtx = new AudioContextClass();
                }
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
        } catch (err) {
            console.warn('[AUDIO] Não foi possível inicializar AudioContext:', err);
        }
    }

    /**
     * Retorna se o áudio está silenciado
     */
    public isMuted(): boolean {
        return this._isMuted;
    }

    /**
     * Alias para compatibilidade retroativa
     */
    public isAudioMuted(): boolean {
        return this._isMuted;
    }

    public setMuted(muted: boolean): void {
        this._isMuted = Boolean(muted);
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('portaria_sound_muted', String(this._isMuted));
            } catch (err) {
                console.warn('[AUDIO] Falha ao persistir portaria_sound_muted:', err);
            }
        }
    }

    public getVolume(): number {
        return this._volume;
    }

    public setVolume(vol: number): void {
        const clamped = Math.max(0, Math.min(1, typeof vol === 'number' && !isNaN(vol) ? vol : 0.7));
        this._volume = clamped;
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('portaria_sound_volume', String(clamped));
            } catch (err) {
                console.warn('[AUDIO] Falha ao persistir portaria_sound_volume:', err);
            }
        }
    }

    /**
     * Toca o tom sonoro sintetizado de acordo com a decisão operacional do semáforo
     */
    public async playTone(tone: SemaphorTone): Promise<void> {
        if (this._isMuted || this._volume <= 0) return;

        try {
            await this.unlock();
            if (!this.audioCtx) return;

            const now = this.audioCtx.currentTime;
            const masterGain = this.audioCtx.createGain();
            masterGain.gain.setValueAtTime(this._volume, now);
            masterGain.connect(this.audioCtx.destination);

            switch (tone) {
                case 'green':
                    this.playGreenChime(now, masterGain);
                    break;
                case 'yellow':
                    this.playYellowAlert(now, masterGain);
                    break;
                case 'red':
                    this.playRedBuzzer(now, masterGain);
                    break;
                case 'neutral':
                    this.playNeutralBlip(now, masterGain);
                    break;
            }
        } catch (err) {
            // Falha de áudio não interrompe operação visual da portaria
            console.warn('[AUDIO] Falha ao reproduzir sinal sonoro:', err);
        }
    }

    /**
     * Som VERDE: Acorde melódico duplo ascendente (C5 523.25Hz -> E5 659.25Hz)
     * Curto, agradável e autoritativo de aprovação positiva.
     */
    private playGreenChime(now: number, destination: GainNode): void {
        if (!this.audioCtx) return;

        // Nota 1: C5 (523.25 Hz)
        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc1.connect(gain1);
        gain1.connect(destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        // Nota 2: E5 (659.25 Hz)
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.08);
        gain2.gain.setValueAtTime(0.5, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc2.connect(gain2);
        gain2.connect(destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.28);
    }

    /**
     * Som AMARELO: Sinal discreto de atenção (A4 440Hz duplo pulso)
     * Notificação clara sem conotação negativa nem de aprovação antecipada.
     */
    private playYellowAlert(now: number, destination: GainNode): void {
        if (!this.audioCtx) return;

        // Pulso 1
        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc1.connect(gain1);
        gain1.connect(destination);
        osc1.start(now);
        osc1.stop(now + 0.07);

        // Pulso 2
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(440, now + 0.09);
        gain2.gain.setValueAtTime(0.35, now + 0.09);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc2.connect(gain2);
        gain2.connect(destination);
        osc2.start(now + 0.09);
        osc2.stop(now + 0.18);
    }

    /**
     * Som VERMELHO: Alerta de bloqueio (Sawtooth filtrado em 220Hz / 185Hz)
     * Tom grave e dissonante, inconfundível em relação ao verde.
     */
    private playRedBuzzer(now: number, destination: GainNode): void {
        if (!this.audioCtx) return;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);
        filter.connect(destination);

        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(220, now); // A3
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        const osc2 = this.audioCtx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(185, now); // F#3 (dissonância proposital)

        osc1.connect(gain1);
        osc2.connect(gain1);
        gain1.connect(filter);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.22);
        osc2.stop(now + 0.22);
    }

    /**
     * Som NEUTRO: Blip técnico suave (F4 349.23Hz)
     * Indica resposta técnica ou cancelamento sem induzir aprovação.
     */
    private playNeutralBlip(now: number, destination: GainNode): void {
        if (!this.audioCtx) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(349.23, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.07);
    }
}

export const audioFeedback = new AudioFeedbackEngine();
