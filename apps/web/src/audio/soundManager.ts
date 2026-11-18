export type AudioChannel = "music" | "book" | "combat" | "ui" | "voice";

export interface ChannelAudioSetting {
  volume: number;
  muted: boolean;
}

export type AudioChannelSettingsMap = Record<AudioChannel, ChannelAudioSetting>;

interface SoundSettings {
  volume: number;
  muted: boolean;
}

const SETTINGS_KEY = "pageshooter_sound_settings";
const CHANNEL_SETTINGS_KEY = "pageshooter_audio_v2_settings";

const DEFAULT_CHANNELS: AudioChannelSettingsMap = {
  music: { volume: 0.5, muted: false },
  book: { volume: 0.8, muted: false },
  combat: { volume: 0.85, muted: false },
  ui: { volume: 0.7, muted: false },
  voice: { volume: 0.8, muted: false }
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private settings: SoundSettings = {
    volume: 0.7,
    muted: false
  };
  private channels: AudioChannelSettingsMap = {
    music: { ...DEFAULT_CHANNELS.music },
    book: { ...DEFAULT_CHANNELS.book },
    combat: { ...DEFAULT_CHANNELS.combat },
    ui: { ...DEFAULT_CHANNELS.ui },
    voice: { ...DEFAULT_CHANNELS.voice }
  };

  constructor() {
    this.loadSettings();
    this.loadChannelSettings();
  }

  private loadSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.volume === "number") {
          this.settings.volume = Math.max(0, Math.min(1, parsed.volume));
        }
        if (typeof parsed.muted === "boolean") {
          this.settings.muted = parsed.muted;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private saveSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore localStorage errors
    }
  }

  private loadChannelSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const stored = localStorage.getItem(CHANNEL_SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AudioChannelSettingsMap>;
        for (const ch of Object.keys(DEFAULT_CHANNELS) as AudioChannel[]) {
          const entry = parsed[ch];
          if (entry) {
            if (typeof entry.volume === "number") {
              this.channels[ch].volume = Math.max(0, Math.min(1, entry.volume));
            }
            if (typeof entry.muted === "boolean") {
              this.channels[ch].muted = entry.muted;
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private saveChannelSettings(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.setItem(CHANNEL_SETTINGS_KEY, JSON.stringify(this.channels));
    } catch {
      // Ignore localStorage errors
    }
  }

  public getChannelSettings(): AudioChannelSettingsMap {
    return {
      music: { ...this.channels.music },
      book: { ...this.channels.book },
      combat: { ...this.channels.combat },
      ui: { ...this.channels.ui },
      voice: { ...this.channels.voice }
    };
  }

  public setChannelVolume(channel: AudioChannel, volume: number): void {
    this.channels[channel].volume = Math.max(0, Math.min(1, volume));
    if (this.channels[channel].volume > 0 && this.channels[channel].muted) {
      this.channels[channel].muted = false;
    }
    this.saveChannelSettings();
  }

  public setChannelMuted(channel: AudioChannel, muted: boolean): void {
    this.channels[channel].muted = muted;
    this.saveChannelSettings();
  }

  public toggleChannelMute(channel: AudioChannel): boolean {
    this.channels[channel].muted = !this.channels[channel].muted;
    this.saveChannelSettings();
    return this.channels[channel].muted;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  public setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    if (this.settings.volume > 0 && this.settings.muted) {
      this.settings.muted = false;
    }
    this.saveSettings();
  }

  public setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.saveSettings();
  }

  public toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.saveSettings();
    return this.settings.muted;
  }

  public getEffectiveVolume(channel?: AudioChannel): number {
    if (this.settings.muted) return 0;
    if (!channel) return this.settings.volume;
    const ch = this.channels[channel];
    if (ch.muted) return 0;
    return this.settings.volume * ch.volume;
  }

  public playChatPing(): void {
    const vol = this.getEffectiveVolume("ui");
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(vol * 0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  }

  public playEmojiPop(): void {
    const vol = this.getEffectiveVolume("ui");
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(vol * 0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  }

  public playTurnChime(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(vol * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  public playPageFlip(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(1.5, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  public playRuneHum(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(146.83, ctx.currentTime); // D3
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(220, ctx.currentTime); // A3

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol * 0.3, ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  }

  public playGunshot(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Noise blast
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Low punch
    const kick = ctx.createOscillator();
    kick.type = "triangle";
    kick.frequency.setValueAtTime(180, ctx.currentTime);
    kick.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.25);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    noise.connect(gain);
    kick.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    kick.start();
    kick.stop(ctx.currentTime + 0.35);
  }

  public playCellDestroyed(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Shattering glass / stone crunch
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  public playElimination(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Dark tomb gong
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 1.8);

    sub.type = "sine";
    sub.frequency.setValueAtTime(55, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 2.0);

    gain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

    osc.connect(gain);
    sub.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    sub.start();
    osc.stop(ctx.currentTime + 2.0);
    sub.stop(ctx.currentTime + 2.0);
  }

  public playVictory(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const notes = [261.63, 329.63, 392.0, 523.25, 659.25]; // C4, E4, G4, C5, E5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.12;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol * 0.35, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });
  }

  public playPencilSketch(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Organic scratchy pencil stroke
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2400, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  public playCartoonPop(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Snappy wooden cork / popgun pop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(vol * 0.45, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  public playCartoonImpact(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Whimsical comic bonk / thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  public playPencilCross(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // Fast double scratch of a pencil crossing out
    const bufferSize = ctx.sampleRate * 0.25;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(i / 100);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.Q.setValueAtTime(2.0, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  public playPaperRustle(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 0.18;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  /**
   * Realistic metallic katana unsheathe / draw sound
   */
  public playKatanaUnsheathe(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    // 1. High metallic friction draw ring
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3400, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol * 0.45, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);

    // 2. High blade-throat friction noise
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / bufferSize));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(5200, ctx.currentTime + 0.12);
    filter.Q.setValueAtTime(4.0, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  }

  /**
   * Visceral, damn immersive 4-layer katana flesh slice:
   * Layer 1: High-velocity razor blade whoosh
   * Layer 2: Dual piercing steel harmonic ring (2850Hz & 4200Hz)
   * Layer 3: Wet flesh tearing / cleaving squelch (frequency-modulated resonant noise)
   * Layer 4: Deep sub-bass body impact thud (140Hz -> 38Hz)
   */
  public playRealisticFleshSlice(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Layer 1: High-speed slicing blade whoosh
    const whooshSize = Math.floor(ctx.sampleRate * 0.16);
    const whooshBuffer = ctx.createBuffer(1, whooshSize, ctx.sampleRate);
    const whooshData = whooshBuffer.getChannelData(0);
    for (let i = 0; i < whooshSize; i++) {
      whooshData[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / whooshSize));
    }
    const whooshSource = ctx.createBufferSource();
    whooshSource.buffer = whooshBuffer;

    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = "bandpass";
    whooshFilter.frequency.setValueAtTime(5500, t);
    whooshFilter.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
    whooshFilter.Q.setValueAtTime(3.8, t);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(vol * 0.7, t);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(ctx.destination);
    whooshSource.start(t);

    // Layer 2: Dual piercing steel harmonic ring
    const ringFreqs = [2850, 4200];
    ringFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, t + 0.38);

      gain.gain.setValueAtTime(vol * 0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });

    // Layer 3: Wet flesh tearing / cleaving squelch (FM modulated lowpass noise)
    const fleshSize = Math.floor(ctx.sampleRate * 0.22);
    const fleshBuffer = ctx.createBuffer(1, fleshSize, ctx.sampleRate);
    const fleshData = fleshBuffer.getChannelData(0);
    for (let i = 0; i < fleshSize; i++) {
      // Frequency-modulated organic squelch profile
      const env = Math.exp(-i / (ctx.sampleRate * 0.06));
      const mod = 1 + 0.4 * Math.sin(i / 45) + 0.25 * Math.sin(i / 110);
      fleshData[i] = (Math.random() * 2 - 1) * env * mod;
    }
    const fleshSource = ctx.createBufferSource();
    fleshSource.buffer = fleshBuffer;

    const fleshFilter = ctx.createBiquadFilter();
    fleshFilter.type = "lowpass";
    fleshFilter.frequency.setValueAtTime(750, t);
    fleshFilter.frequency.linearRampToValueAtTime(220, t + 0.2);
    fleshFilter.Q.setValueAtTime(2.2, t);

    const fleshGain = ctx.createGain();
    fleshGain.gain.setValueAtTime(vol * 0.65, t);
    fleshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    fleshSource.connect(fleshFilter);
    fleshFilter.connect(fleshGain);
    fleshGain.connect(ctx.destination);
    fleshSource.start(t);

    // Layer 4: Deep sub-bass body impact thud (weight & visceral punch)
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();

    thudOsc.type = "sine";
    thudOsc.frequency.setValueAtTime(140, t);
    thudOsc.frequency.exponentialRampToValueAtTime(38, t + 0.16);

    thudGain.gain.setValueAtTime(vol * 0.75, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(t);
    thudOsc.stop(t + 0.18);
  }

  /**
   * Alias for backwards compatibility
   */
  public playKatanaSlice(): void {
    this.playRealisticFleshSlice();
  }

  /**
   * Heavy wet impact of blood splashing directly onto the camera lens / screen:
   * Heavy viscous liquid slap + micro droplet splatter + running drip sound
   */
  public playScreenBloodSlap(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // 1. Wet heavy liquid slap onto glass
    const slapOsc = ctx.createOscillator();
    const slapGain = ctx.createGain();
    slapOsc.type = "sine";
    slapOsc.frequency.setValueAtTime(220, t);
    slapOsc.frequency.exponentialRampToValueAtTime(42, t + 0.14);

    slapGain.gain.setValueAtTime(vol * 0.7, t);
    slapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    slapOsc.connect(slapGain);
    slapGain.connect(ctx.destination);
    slapOsc.start(t);
    slapOsc.stop(t + 0.16);

    // 2. Viscous liquid splatter & spray burst
    const spraySize = Math.floor(ctx.sampleRate * 0.32);
    const sprayBuffer = ctx.createBuffer(1, spraySize, ctx.sampleRate);
    const sprayData = sprayBuffer.getChannelData(0);
    for (let i = 0; i < spraySize; i++) {
      // Liquid droplet modulation with trailing runs
      const dripEnv = Math.exp(-i / (ctx.sampleRate * 0.09)) * (1 + 0.35 * Math.sin(i / 60));
      sprayData[i] = (Math.random() * 2 - 1) * dripEnv;
    }
    const spraySource = ctx.createBufferSource();
    spraySource.buffer = sprayBuffer;

    const sprayFilter = ctx.createBiquadFilter();
    sprayFilter.type = "lowpass";
    sprayFilter.frequency.setValueAtTime(1100, t);
    sprayFilter.frequency.linearRampToValueAtTime(320, t + 0.3);

    const sprayGain = ctx.createGain();
    sprayGain.gain.setValueAtTime(vol * 0.6, t);
    sprayGain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    spraySource.connect(sprayFilter);
    sprayFilter.connect(sprayGain);
    sprayGain.connect(ctx.destination);
    spraySource.start(t);

    // 3. High micro-droplet clicks on glass (subtle glass contact)
    const clickFreqs = [1800, 2400, 3100];
    clickFreqs.forEach((freq, idx) => {
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      const delay = 0.02 + idx * 0.025;

      clickOsc.type = "sine";
      clickOsc.frequency.setValueAtTime(freq, t + delay);
      clickOsc.frequency.exponentialRampToValueAtTime(800, t + delay + 0.03);

      clickGain.gain.setValueAtTime(vol * 0.25, t + delay);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.03);

      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(t + delay);
      clickOsc.stop(t + delay + 0.03);
    });
  }

  /**
   * Alias for backwards compatibility
   */
  public playBloodSplash(): void {
    this.playScreenBloodSlap();
  }

  /**
   * Samurai Chiburui (血振るい) - Swift blade flick to cast blood off the scythe:
   * Fast whipping air swoosh + high steel harmonic flex chime + liquid droplet snaps
   */
  public playChiburuiFlick(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // 1. Fast whipping air swoosh
    const swooshSize = Math.floor(ctx.sampleRate * 0.12);
    const swooshBuffer = ctx.createBuffer(1, swooshSize, ctx.sampleRate);
    const swooshData = swooshBuffer.getChannelData(0);
    for (let i = 0; i < swooshSize; i++) {
      swooshData[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / swooshSize));
    }
    const swooshSource = ctx.createBufferSource();
    swooshSource.buffer = swooshBuffer;

    const swooshFilter = ctx.createBiquadFilter();
    swooshFilter.type = "bandpass";
    swooshFilter.frequency.setValueAtTime(3600, t);
    swooshFilter.frequency.exponentialRampToValueAtTime(850, t + 0.1);
    swooshFilter.Q.setValueAtTime(3.2, t);

    const swooshGain = ctx.createGain();
    swooshGain.gain.setValueAtTime(vol * 0.65, t);
    swooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    swooshSource.connect(swooshFilter);
    swooshFilter.connect(swooshGain);
    swooshGain.connect(ctx.destination);
    swooshSource.start(t);

    // 2. High steel harmonic chime as the blade flexes and snaps back
    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = "triangle";
    chimeOsc.frequency.setValueAtTime(1450, t);
    chimeOsc.frequency.exponentialRampToValueAtTime(950, t + 0.28);

    chimeGain.gain.setValueAtTime(vol * 0.45, t);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chimeOsc.start(t);
    chimeOsc.stop(t + 0.28);

    // 3. Droplets detaching in the air (micro liquid snaps)
    for (let i = 0; i < 3; i++) {
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      const delay = 0.03 + i * 0.02;

      snapOsc.type = "sine";
      snapOsc.frequency.setValueAtTime(1100 - i * 150, t + delay);
      snapOsc.frequency.exponentialRampToValueAtTime(350, t + delay + 0.025);

      snapGain.gain.setValueAtTime(vol * 0.3, t + delay);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.025);

      snapOsc.connect(snapGain);
      snapGain.connect(ctx.destination);
      snapOsc.start(t + delay);
      snapOsc.stop(t + delay + 0.025);
    }
  }

  /**
   * Authentic samurai sheathing sound:
   * Smooth wooden scabbard throat friction + crisp metallic Habaki lock snap (*KLICK-CLACK*)
   */
  public playKatanaSheathe(): void {
    const vol = this.getEffectiveVolume();
    if (vol <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // 1. Sliding friction into scabbard throat (saya)
    const slideSize = Math.floor(ctx.sampleRate * 0.08);
    const slideBuffer = ctx.createBuffer(1, slideSize, ctx.sampleRate);
    const slideData = slideBuffer.getChannelData(0);
    for (let i = 0; i < slideSize; i++) {
      slideData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    }
    const slideSource = ctx.createBufferSource();
    slideSource.buffer = slideBuffer;
    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = "bandpass";
    slideFilter.frequency.setValueAtTime(1200, t);
    slideFilter.frequency.exponentialRampToValueAtTime(2400, t + 0.06);

    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(vol * 0.35, t);
    slideGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    slideSource.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(ctx.destination);
    slideSource.start(t);

    // 2. Crisp, loud Habaki/Koiguchi metallic wooden lock snap (*KLICK-CLACK*)
    const snapDelay = 0.05;

    // High metallic click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = "triangle";
    clickOsc.frequency.setValueAtTime(2200, t + snapDelay);
    clickOsc.frequency.exponentialRampToValueAtTime(450, t + snapDelay + 0.035);

    clickGain.gain.setValueAtTime(vol * 0.65, t + snapDelay);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + snapDelay + 0.045);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(t + snapDelay);
    clickOsc.stop(t + snapDelay + 0.045);

    // Solid wooden scabbard throat pop
    const woodOsc = ctx.createOscillator();
    const woodGain = ctx.createGain();
    woodOsc.type = "sine";
    woodOsc.frequency.setValueAtTime(850, t + snapDelay);
    woodOsc.frequency.exponentialRampToValueAtTime(180, t + snapDelay + 0.04);

    woodGain.gain.setValueAtTime(vol * 0.5, t + snapDelay);
    woodGain.gain.exponentialRampToValueAtTime(0.001, t + snapDelay + 0.045);

    woodOsc.connect(woodGain);
    woodGain.connect(ctx.destination);
    woodOsc.start(t + snapDelay);
    woodOsc.stop(t + snapDelay + 0.045);
  }
}

export const soundManager = new SoundManager();

