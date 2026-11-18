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
   * Plays a real recorded audio file from /sfx/*.mp3 with volume control.
   * Falls back silently in headless test environments (happy-dom) where HTMLAudioElement playback is stubbed.
   */
  private playSample(path: string, volumeMultiplier = 1.0, playbackRate = 1.0): boolean {
    const vol = this.getEffectiveVolume("combat");
    if (vol <= 0) return false;
    if (typeof window === "undefined" || typeof window.Audio !== "function") return false;

    try {
      const audio = new window.Audio(path);
      audio.volume = Math.max(0, Math.min(1, vol * volumeMultiplier));
      audio.playbackRate = playbackRate;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Ignore autoplay restrictions or headless test environment rejections
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Real recorded katana unsheathe / draw sound (/sfx/katana-draw.mp3)
   */
  public playKatanaUnsheathe(): void {
    this.playSample("/sfx/katana-draw.mp3", 0.95, 1.0);
  }

  /**
   * Real recorded katana rush swipe sound (/sfx/katana-swipe.mp3)
   */
  public playThunderDashBurst(): void {
    this.playSample("/sfx/katana-swipe.mp3", 0.9, 1.05);
  }

  /**
   * Real recorded katana double slash attack sound (/sfx/katana-slash.mp3)
   */
  public playRealisticFleshSlice(): void {
    this.playSample("/sfx/katana-slash.mp3", 1.0, 1.0);
  }

  /**
   * Alias for backwards compatibility
   */
  public playKatanaSlice(): void {
    this.playRealisticFleshSlice();
  }

  /**
   * Real recorded secondary katana follow-through slash (/sfx/katana-swipe.mp3)
   */
  public playScreenBloodSlap(): void {
    this.playSample("/sfx/katana-swipe.mp3", 0.85, 0.92);
  }

  /**
   * Alias for backwards compatibility
   */
  public playBloodSplash(): void {
    this.playScreenBloodSlap();
  }

  /**
   * Real recorded katana blade flick / flourish (/sfx/katana-flick.mp3)
   */
  public playChiburuiFlick(): void {
    this.playSample("/sfx/katana-flick.mp3", 0.9, 1.0);
  }

  /**
   * Real recorded metallic katana lock / clash sheathe (/sfx/katana-sheathe.mp3)
   */
  public playKatanaSheathe(): void {
    this.playSample("/sfx/katana-sheathe.mp3", 0.95, 1.0);
  }

  /**
   * Comical Knockout Stamp Slam & Final Sword Ring (/sfx/katana-draw.mp3)
   */
  public playKnockoutStampSlam(): void {
    this.playSample("/sfx/katana-draw.mp3", 0.9, 0.85);
  }
}

export const soundManager = new SoundManager();

